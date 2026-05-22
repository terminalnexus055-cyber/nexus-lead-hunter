// pages/api/enrich.js
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { business, niche, city } = req.body;
  if (!business) return res.status(400).json({ error: 'business object required' });

  const GROK_KEY = process.env.GROK_API_KEY;
  if (!GROK_KEY) return res.status(500).json({ error: 'GROK_API_KEY not configured' });

  // First fetch available models so we use the right one
  let modelToUse = 'grok-beta';
  try {
    const modelsRes = await fetch('https://api.x.ai/v1/models', {
      headers: { 'Authorization': `Bearer ${GROK_KEY}` }
    });
    if (modelsRes.ok) {
      const modelsData = await modelsRes.json();
      const available = (modelsData.data || []).map(m => m.id);
      console.log('Available Grok models:', available);
      // Pick best available model
      const preferred = ['grok-3', 'grok-3-latest', 'grok-2', 'grok-2-latest', 'grok-beta', 'grok-1'];
      modelToUse = preferred.find(m => available.includes(m)) || available[0] || 'grok-beta';
    }
  } catch (e) {
    console.log('Could not fetch models list, defaulting to grok-beta');
  }

  console.log('Using model:', modelToUse);

  const domain = business.website
    ? business.website.replace(/https?:\/\//,'').replace(/www\./,'').split('/')[0]
    : '';

  const prompt = `Research this ${niche} business. Return ONLY a JSON object with no markdown or backticks.

Business name: ${business.name}
City: ${city}
Phone: ${business.phone || 'unknown'}
Website: ${business.website || 'none'}
Reviews: ${business.reviewCount || '?'} on Google

Find: owner name, email, whether they are on Angi/HomeAdvisor, whether they run Google Ads.
If no email found, guess: owner@${domain || 'theirdomain.com'} or firstname@${domain || 'theirdomain.com'}

Return this exact JSON structure:
{"ownerName":"First Last or Owner","email":"email@domain.com","emailSource":"website or pattern guess","emailConfidence":"HIGH or MEDIUM or LOW","icpScore":"HOT or WARM or COLD","icpReason":"one sentence","angiListed":false,"activeAds":false,"teamSize":"1-5","painHook":"why this business loses money from missed calls","coldEmail":"5 sentence email. Reference ${business.name}. Mention cost of missed ${niche} call. Pitch speed-to-lead follow-up. CTA 15-min call. Sign off [Your name]."}`;

  try {
    const grokRes = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROK_KEY}`
      },
      body: JSON.stringify({
        model: modelToUse,
        max_tokens: 800,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const rawText = await grokRes.text();
    console.log('Grok response status:', grokRes.status);
    console.log('Grok response body:', rawText.slice(0, 500));

    if (!grokRes.ok) {
      // Return graceful fallback so lead still populates
      return res.status(200).json(fallback(business, niche, domain, `Grok ${grokRes.status}: ${rawText.slice(0,100)}`));
    }

    const data = JSON.parse(rawText);
    const text = data.choices?.[0]?.message?.content || '';
    const clean = text.replace(/```json|```/g, '').trim();
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');

    if (start === -1) {
      return res.status(200).json(fallback(business, niche, domain, 'No JSON in response'));
    }

    const enriched = JSON.parse(clean.slice(start, end + 1));
    return res.status(200).json({ ...enriched, modelUsed: modelToUse });

  } catch (err) {
    return res.status(200).json(fallback(business, niche, domain, err.message));
  }
}

function fallback(business, niche, domain, reason) {
  return {
    ownerName: 'Owner',
    email: domain ? `owner@${domain}` : '',
    emailSource: `pattern guess (enrichment note: ${reason})`,
    emailConfidence: 'LOW',
    icpScore: 'WARM',
    icpReason: 'Manual research needed — AI enrichment unavailable',
    angiListed: false,
    activeAds: false,
    teamSize: 'unknown',
    painHook: `${business.name} likely loses $3k–$10k per missed call during peak season`,
    coldEmail: `Hi,\n\nI came across ${business.name} while researching ${niche} businesses in the area — your reviews stand out.\n\nIn ${niche}, one missed call during peak season can mean a $5,000+ job going to whoever picks up first.\n\nWe help owner-operated businesses set up instant follow-up so every missed call gets a text back within 60 seconds — keeping jobs from slipping to competitors.\n\nWould a 15-minute call this week make sense?\n\n[Your name]`
  };
}
