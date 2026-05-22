// pages/api/enrich.js
// Uses Groq API (groq.com) — key starts with gsk_

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { business, niche, city } = req.body;
  if (!business) return res.status(400).json({ error: 'business object required' });

  const GROQ_KEY = process.env.GROK_API_KEY; // reusing same env var name so you don't have to change Vercel
  if (!GROQ_KEY) return res.status(500).json({ error: 'GROK_API_KEY not configured' });

  const domain = business.website
    ? business.website.replace(/https?:\/\//,'').replace(/www\./,'').split('/')[0]
    : '';

  const prompt = `You are a B2B lead researcher helping identify owner-operated ${niche} businesses for sales outreach.

Business: ${business.name}
City: ${city}
Phone: ${business.phone || 'unknown'}
Website: ${business.website || 'none'}
Google Reviews: ${business.reviewCount || '?'} reviews, ${business.rating || '?'} stars
Category: ${business.category || niche}

Based on this information, do the following:
1. Determine if this is likely owner-operated (NOT a franchise or large chain)
2. Guess the owner's name based on the business name if possible (e.g. "Berry Best" might be owned by someone named Berry)
3. Generate a best-guess email: try owner@${domain || 'domain.com'} or info@${domain || 'domain.com'} or firstname@${domain || 'domain.com'}
4. Assess if they likely spend on ads or lead platforms (Angi, HomeAdvisor, Thumbtack) given their review count and rating
5. Score their ICP fit: HOT = small owner-run team + growth-minded + high ticket. WARM = partial fit. COLD = franchise or chain.
6. Write a cold email selling missed-call follow-up infrastructure

Return ONLY a raw JSON object, no markdown, no backticks, no explanation:
{
  "ownerName": "First Last or Owner",
  "email": "${domain ? 'owner@' + domain : 'owner@theirdomain.com'}",
  "emailSource": "pattern guess from domain",
  "emailConfidence": "MEDIUM",
  "icpScore": "HOT or WARM or COLD",
  "icpReason": "one sentence why",
  "angiListed": false,
  "activeAds": false,
  "teamSize": "1-5 or 5-15 or 15-25",
  "painHook": "specific reason ${business.name} loses revenue from missed calls",
  "coldEmail": "5 sentences. Start with their business name. Reference the cost of one missed ${niche} job ($3k-$15k). Pitch speed-to-lead follow-up so they stop losing jobs to competitors who answer faster. CTA: 15-min call this week. Sign off: [Your name]."
}`;

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 800,
        temperature: 0.3,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const rawText = await groqRes.text();

    if (!groqRes.ok) {
      console.log('Groq error:', groqRes.status, rawText.slice(0, 300));
      return res.status(200).json(fallback(business, niche, domain, `Groq ${groqRes.status}`));
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
    return res.status(200).json({ ...enriched, modelUsed: 'llama-3.3-70b-versatile' });

  } catch (err) {
    console.log('Enrich error:', err.message);
    return res.status(200).json(fallback(business, niche, domain, err.message));
  }
}

function fallback(business, niche, domain, reason) {
  return {
    ownerName: 'Owner',
    email: domain ? `owner@${domain}` : '',
    emailSource: `pattern guess (note: ${reason})`,
    emailConfidence: 'LOW',
    icpScore: 'WARM',
    icpReason: 'Manual research needed — AI enrichment unavailable',
    angiListed: false,
    activeAds: false,
    teamSize: 'unknown',
    painHook: `${business.name} likely loses $3k–$15k per missed call during peak season`,
    coldEmail: `Hi,\n\nI came across ${business.name} while researching ${niche} businesses in the area — your reviews stand out.\n\nIn ${niche}, one missed call during peak season typically means a $5,000–$15,000 job going to whoever picks up first.\n\nWe help owner-operated businesses set up instant lead follow-up so every missed call gets a text back within 60 seconds — keeping jobs from slipping to competitors.\n\nWould a 15-minute call this week make sense?\n\n[Your name]`
  };
}
