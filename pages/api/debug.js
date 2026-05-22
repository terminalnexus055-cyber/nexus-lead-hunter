// pages/api/debug.js
// Diagnostic endpoint — tests Grok connection and returns full raw response
// Visit /api/debug in browser to see exactly what's happening

export default async function handler(req, res) {
  const GROK_KEY = process.env.GROK_API_KEY;
  const APIFY_TOKEN = process.env.APIFY_API_TOKEN;

  const results = {
    timestamp: new Date().toISOString(),
    env: {
      grokKeySet: !!GROK_KEY,
      grokKeyPrefix: GROK_KEY ? GROK_KEY.slice(0, 8) + '...' : 'NOT SET',
      grokKeyLength: GROK_KEY ? GROK_KEY.length : 0,
      apifyKeySet: !!APIFY_TOKEN,
      apifyKeyPrefix: APIFY_TOKEN ? APIFY_TOKEN.slice(0, 12) + '...' : 'NOT SET',
    },
    grokModels: null,
    grokTestCall: null,
    apifyTest: null,
  };

  // Test 1: Grok models list
  try {
    const r = await fetch('https://api.x.ai/v1/models', {
      headers: { 'Authorization': `Bearer ${GROK_KEY}` }
    });
    const body = await r.text();
    results.grokModels = {
      status: r.status,
      ok: r.ok,
      body: JSON.parse(body),
    };
  } catch (e) {
    results.grokModels = { error: e.message };
  }

  // Pick first available model
  const availableModels = results.grokModels?.body?.data?.map(m => m.id) || [];
  const modelToTest = availableModels[0] || 'grok-beta';

  // Test 2: Grok simple completion
  try {
    const r = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROK_KEY}`
      },
      body: JSON.stringify({
        model: modelToTest,
        max_tokens: 20,
        messages: [{ role: 'user', content: 'Say HELLO only.' }]
      })
    });
    const body = await r.text();
    results.grokTestCall = {
      status: r.status,
      ok: r.ok,
      modelUsed: modelToTest,
      availableModels,
      rawBody: body.slice(0, 500),
    };
  } catch (e) {
    results.grokTestCall = { error: e.message };
  }

  // Test 3: Apify account check
  try {
    const r = await fetch(`https://api.apify.com/v2/users/me?token=${APIFY_TOKEN}`);
    const body = await r.text();
    const parsed = JSON.parse(body);
    results.apifyTest = {
      status: r.status,
      ok: r.ok,
      username: parsed.data?.username,
      plan: parsed.data?.plan?.id,
      monthlyUsage: parsed.data?.monthlyUsage,
    };
  } catch (e) {
    results.apifyTest = { error: e.message };
  }

  return res.status(200).json(results);
}
