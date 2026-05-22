// pages/api/search.js
// Increased timeout config for Vercel hobby plan (max 60s)

export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { query, city, minReviews, maxReviews, maxResults } = req.body;
  if (!query || !city) return res.status(400).json({ error: 'query and city are required' });

  const APIFY_TOKEN = process.env.APIFY_API_TOKEN;
  if (!APIFY_TOKEN) return res.status(500).json({ error: 'APIFY_API_TOKEN not configured' });

  const min = parseInt(minReviews) || 20;
  const max = parseInt(maxReviews) || 500;
  const target = parseInt(maxResults) || 20;
  const scrapeCount = Math.min(target * 3, 80);

  try {
    // Start Apify actor run
    const runRes = await fetch(
      `https://api.apify.com/v2/acts/compass~crawler-google-places/runs?token=${APIFY_TOKEN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          searchStringsArray: [
            `${query} in ${city}`,
            `${query} near ${city}`,
          ],
          maxCrawledPlacesPerSearch: scrapeCount,
          language: 'en',
          countryCode: 'us',
          includeReviews: false,
          includeImages: false,
          includeOpeningHours: false,
          maxImages: 0,
        })
      }
    );

    if (!runRes.ok) {
      const err = await runRes.json().catch(() => ({}));
      return res.status(runRes.status).json({ error: err.error?.message || 'Apify run failed to start' });
    }

    const runData = await runRes.json();
    const runId = runData.data?.id;
    if (!runId) return res.status(500).json({ error: 'No run ID returned from Apify' });

    // Poll for completion — max 50 seconds (fits within Vercel 60s limit)
    // Poll every 3 seconds, max 16 attempts = 48 seconds
    let attempts = 0;
    let status = 'RUNNING';

    while ((status === 'RUNNING' || status === 'READY') && attempts < 16) {
      await sleep(3000);
      attempts++;

      const statusRes = await fetch(
        `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`
      );
      const statusData = await statusRes.json();
      status = statusData.data?.status;
      console.log(`Poll ${attempts}: ${status}`);
    }

    // If still running after 48s, fetch whatever results exist so far
    if (status !== 'SUCCEEDED') {
      console.log(`Apify did not finish in time (status: ${status}) — fetching partial results`);

      // Try to get partial dataset results
      const runInfoRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`);
      const runInfo = await runInfoRes.json();
      const datasetId = runInfo.data?.defaultDatasetId;

      if (!datasetId) {
        return res.status(504).json({
          error: 'Apify is taking longer than expected. Try setting "Leads to find" to 5 for a faster test, then increase.',
          tip: 'Vercel hobby plan has a 60s function limit. Upgrade to Vercel Pro for longer scrapes, or reduce lead count.'
        });
      }

      const itemsRes = await fetch(
        `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}&clean=true&format=json&limit=200`
      );
      const items = await itemsRes.json();
      if (!items.length) {
        return res.status(504).json({
          error: 'Apify scrape timed out with no results. Try "5 leads" for a faster test.',
        });
      }
      return res.status(200).json(processItems(items, min, max, target, scrapeCount, true));
    }

    // Fetch full results
    const runInfoRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`);
    const runInfo = await runInfoRes.json();
    const datasetId = runInfo.data?.defaultDatasetId;

    const itemsRes = await fetch(
      `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}&clean=true&format=json&limit=200`
    );
    const items = await itemsRes.json();

    return res.status(200).json(processItems(items, min, max, target, scrapeCount, false));

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

function processItems(items, min, max, target, scrapeCount, partial) {
  // Deduplicate
  const seen = new Set();
  const deduped = items.filter(p => {
    const key = `${(p.title || p.name || '').toLowerCase()}-${p.address}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Franchise name signals to pre-filter
  const FRANCHISE_SIGNALS = [
    'one hour', 'mr. ', 'aire serv', 'comfort systems',
    'service experts', 'ashley', 'carrier', 'american home',
    'first choice', 'rescue air'
  ];

  const filtered = deduped
    .filter(p => {
      const rc = p.reviewsCount || 0;
      const name = (p.title || p.name || '').toLowerCase();
      const isFranchise = FRANCHISE_SIGNALS.some(f => name.includes(f));
      return rc >= min && rc <= max && !isFranchise;
    })
    .map(p => ({
      name: p.title || p.name || '',
      address: p.address || '',
      phone: p.phone || p.phoneUnformatted || '',
      website: p.website || '',
      reviewCount: p.reviewsCount || 0,
      rating: p.totalScore || p.rating || '',
      category: p.categoryName || p.category || '',
      mapsUrl: p.url || p.googleMapsUrl || '',
      placeId: p.placeId || '',
    }))
    .slice(0, target);

  return {
    results: filtered,
    total: filtered.length,
    scraped: deduped.length,
    partial,
    debug: `Scraped ${deduped.length} → filtered to ${filtered.length} (review range ${min}–${max})${partial ? ' [PARTIAL]' : ''}`
  };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
