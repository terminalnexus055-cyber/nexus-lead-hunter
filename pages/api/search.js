// pages/api/search.js
// Server-side: calls Apify Google Maps Scraper
// API keys never exposed to the browser

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { query, city, minReviews, maxReviews, maxResults } = req.body;
  if (!query || !city) return res.status(400).json({ error: 'query and city are required' });

  const APIFY_TOKEN = process.env.APIFY_API_TOKEN;
  if (!APIFY_TOKEN) return res.status(500).json({ error: 'APIFY_API_TOKEN not configured' });

  const min = parseInt(minReviews) || 20;
  const max = parseInt(maxReviews) || 500;
  const target = parseInt(maxResults) || 20;

  // Pull 3x the target so enough survive the review filter
  const scrapeCount = Math.min(target * 3, 100);

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
        })
      }
    );

    if (!runRes.ok) {
      const err = await runRes.json();
      return res.status(runRes.status).json({ error: err.error?.message || 'Apify run failed' });
    }

    const runData = await runRes.json();
    const runId = runData.data?.id;
    if (!runId) return res.status(500).json({ error: 'No run ID from Apify' });

    // Poll for completion — max 120 seconds
    let attempts = 0;
    let status = 'RUNNING';
    while (status === 'RUNNING' || status === 'READY') {
      await sleep(4000);
      attempts++;
      if (attempts > 30) return res.status(504).json({ error: 'Apify timed out — try fewer results or retry' });

      const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`);
      const statusData = await statusRes.json();
      status = statusData.data?.status;
    }

    if (status !== 'SUCCEEDED') {
      return res.status(500).json({ error: `Apify run ended with status: ${status}` });
    }

    // Get dataset ID
    const runInfoRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`);
    const runInfo = await runInfoRes.json();
    const datasetId = runInfo.data?.defaultDatasetId;

    // Fetch all items
    const itemsRes = await fetch(
      `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}&clean=true&format=json&limit=200`
    );
    const items = await itemsRes.json();

    // Deduplicate by place name + address
    const seen = new Set();
    const deduped = items.filter(p => {
      const key = `${p.title || p.name}-${p.address}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Filter by review count
    const filtered = deduped
      .filter(p => {
        const rc = p.reviewsCount || p.totalScore || 0;
        // Also exclude if name contains franchise signals
        const name = (p.title || p.name || '').toLowerCase();
        const isFranchise = ['one hour', 'mr. ', 'mr ', 'aire serv', 'comfort systems', 'lennox', 'carrier', 'trane'].some(f => name.includes(f));
        return rc >= min && rc <= max && !isFranchise;
      })
      .map(p => ({
        name: p.title || p.name || '',
        address: p.address || p.street || '',
        phone: p.phone || p.phoneUnformatted || '',
        website: p.website || '',
        reviewCount: p.reviewsCount || 0,
        rating: p.totalScore || p.rating || '',
        category: p.categoryName || p.category || '',
        mapsUrl: p.url || p.googleMapsUrl || '',
        placeId: p.placeId || '',
      }))
      .slice(0, target);

    return res.status(200).json({
      results: filtered,
      total: filtered.length,
      scraped: deduped.length,
      debug: `Scraped ${deduped.length} → filtered to ${filtered.length} (review range ${min}–${max})`
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
