// pages/api/enrich.js
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { business, niche, city } = req.body;
  if (!business) return res.status(400).json({ error: 'business object required' });

  const GROK_KEY = process.env.GROK_API_KEY;
  if (!GROK_KEY) return res.status(500).json({ error: 'GROK_API_KEY not configured' });

  const prompt = `You are a B2B lead researcher. Research this ${niche} business and return structured data.

Business: ${business.name}
Address: ${business.address || city}
Phone: ${business.phone || 'unknown'}
Website: ${business.website || 'not found'}
Google rating: ${business.rating || '?'} stars (${business.reviewCount || '?'} reviews)

YOUR TASKS:
1. Find the owner name from website About page, reviews, or any public source
2. Find their direct email or generate best guess pattern: firstname@domain.com or owner@domain.com
3. Check if listed on Angi or HomeAdvisor
4. Check if they run Google Ads
5. Confirm owner-operated and NOT a franchise

ICP: HOT = owner hands-on + spending on ads + NOT franchise. WARM = partial fit. COLD = franchise or too large.

Return ONLY a raw JSON object, no markdown, no backticks:
{"ownerName":"First Last or Owner","email":"email or guess","emailSource":"where found or pattern guess","emailConfidence":"HIGH or MEDIUM or LOW","icpScore":"HOT or WARM or COLD","icpReason":"one sentence","angiListed":true,"activeAds":false,"teamSize":"1-5","painHook":"specific missed-call pain for this business","coldEmail":"5 sentence cold email referencing their business name and the cost of one missed HVAC call. Pitch speed-to-lead follow-up. CTA is 15-min call. Sign off as [Your name]."}`;

  // Try models in order of likelihood
  const models = ['grok-3-latest', 'grok-2-latest', 'grok-beta', 'grok-2', 'grok-1'];

  for (const model of models) {
    try {
      const grokRes = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROK_KEY}`
        },
        body: JSON.stringify({
          model,
          max_tokens: 1000,
          messages: [{ role: 'user', content: prompt }]
        })
      });

      // If 400 or 404, try next model
      if (grokRes.status === 400 || grokRes.status === 404) {
        const errData = await grokRes.json().catch(() => ({}));
        console.log(`Model ${model} failed: ${errData.error?.message || grokRes.status}`);
        continue;
      }

      if (!grokRes.ok) {
        const err = await grokRes.json().catch(() => ({}));
        return res.status(grokRes.status).json({ 
          error: err.error?.message || `Grok API error ${grokRes.status}`,
          modelTried: model
        });
      }

      const data = await grokRes.json();
      const text = data.choices?.[0]?.message?.content || '';
      const clean = text.replace(/```json|```/g, '').trim();
      const start = clean.indexOf('{');
      const end = clean.lastIndexOf('}');

      if (start === -1) {
        return res.status(500).json({ error: 'Grok returned no JSON', raw: text.slice(0, 200) });
      }

      const enriched = JSON.parse(clean.slice(start, end + 1));
      return res.status(200).json({ ...enriched, modelUsed: model });

    } catch (err) {
      console.log(`Model ${model} threw: ${err.message}`);
      continue;
    }
  }

  // All models failed — return what we know from Apify so lead still shows
  return res.status(200).json({
    ownerName: 'Owner',
    email: business.website ? `owner@${business.website.replace(/https?:\/\//,'').split('/')[0]}` : '',
    emailSource: 'pattern guess — Grok unavailable',
    emailConfidence: 'LOW',
    icpScore: 'WARM',
    icpReason: 'Grok enrichment failed — manual research needed',
    angiListed: false,
    activeAds: false,
    teamSize: 'unknown',
    painHook: `${business.name} likely loses revenue on missed calls during peak season`,
    coldEmail: `Hi,\n\nI came across ${business.name} and noticed you have strong reviews in the Dallas market.\n\nIn the HVAC space, one missed call during summer can mean a $5,000+ job going to a competitor who picked up.\n\nWe help owner-operated HVAC businesses set up speed-to-lead follow-up so every missed call gets a text back within 60 seconds.\n\nWould a 15-minute call this week make sense?\n\n[Your name]`
  });
}
