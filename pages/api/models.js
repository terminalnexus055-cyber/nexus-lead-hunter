// pages/api/models.js
// Temporary diagnostic — tells you exactly which Grok models your key can access
// Add this file to pages/api/, deploy, then visit /api/models in your browser

export default async function handler(req, res) {
  const GROK_KEY = process.env.GROK_API_KEY;
  if (!GROK_KEY) return res.status(500).json({ error: 'GROK_API_KEY not set' });

  try {
    const r = await fetch('https://api.x.ai/v1/models', {
      headers: { 'Authorization': `Bearer ${GROK_KEY}` }
    });
    const data = await r.json();
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
