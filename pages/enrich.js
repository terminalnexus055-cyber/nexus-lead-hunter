// pages/api/enrich.js
// Server-side: calls Grok xAI to research each business
// Finds owner name, email, ICP score, pain hook, cold email

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { business, niche, city } = req.body;
  if (!business) return res.status(400).json({ error: 'business object required' });

  const GROK_KEY = process.env.GROK_API_KEY;
  if (!GROK_KEY) return res.status(500).json({ error: 'GROK_API_KEY not configured in environment variables' });

  const prompt = `You are a B2B lead researcher. Use web search to research this ${niche} business and return structured data.

Business: ${business.name}
Address: ${business.address || city}
Phone: ${business.phone || 'unknown'}
Website: ${business.website || 'not found'}
Google rating: ${business.rating || '?'} stars (${business.reviewCount || '?'} reviews)
Category: ${business.category || niche}

YOUR TASKS:
1. Search the web for this exact business — find the owner's name from About page, reviews, LinkedIn, Facebook, or any mention
2. Find their direct email from website contact/about page, Facebook, or any public source
3. If no email found, generate best pattern guess: firstname@domain.com or owner@domain.com using their website domain
4. Check if they are listed on Angi, HomeAdvisor, or Thumbtack
5. Check if they run Google Ads (look for Ad labels in search results for their business name)
6. Confirm they are owner-operated and NOT a franchise

ICP SCORING:
- HOT: owner hands-on + spending on ads/lead platforms + NOT franchise + high-ticket niche
- WARM: fits most criteria but missing 1-2 signals
- COLD: franchise, chain, or too large (25+ employees)

Return ONLY a raw JSON object with no markdown, no backticks, no explanation:
{
  "ownerName": "First Last — or 'Owner' if not found",
  "email": "direct email or pattern guess",
  "emailSource": "website contact page / Facebook / pattern guess from domain / etc",
  "emailConfidence": "HIGH if found directly, MEDIUM if pattern guess with confirmed domain, LOW if unknown domain",
  "icpScore": "HOT or WARM or COLD",
  "icpReason": "one sentence max",
  "angiListed": true or false,
  "activeAds": true or false,
  "teamSize": "e.g. 1-5 or 5-15 or 15-25",
  "painHook": "specific reason this business loses revenue from missed calls — reference their niche and situation",
  "coldEmail": "5 sentences. Open with their business name and a specific observation about their situation. Reference the financial cost of one missed call in ${niche}. Pitch speed-to-lead follow-up infrastructure so they stop losing jobs to competitors who answer faster. CTA: 15-min call this week. Sign off: [Your name]. No subject line. No placeholders except [Your name]."
}`;

  try {
    const grokRes = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROK_KEY}`
      },
      body: JSON.stringify({
        model: 'grok-3-latest',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!grokRes.ok) {
      const err = await grokRes.json().catch(() => ({}));
      return res.status(grokRes.status).json({ error: err.error?.message || `Grok API error ${grokRes.status}` });
    }

    const data = await grokRes.json();
    const text = data.choices?.[0]?.message?.content || '';
    const clean = text.replace(/```json|```/g, '').trim();
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');

    if (start === -1) return res.status(500).json({ error: 'Grok returned no JSON', raw: text.slice(0, 200) });

    const enriched = JSON.parse(clean.slice(start, end + 1));
    return res.status(200).json(enriched);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
