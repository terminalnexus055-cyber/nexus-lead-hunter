// pages/api/debug.js
// Diagnostic endpoint — tests Groq + Apify connections
// Visit /api/debug in your browser to see full results

export default async function handler(req, res) {
  const GROQ_KEY = process.env.GROK_API_KEY;
  const APIFY_TOKEN = process.env.APIFY_API_TOKEN;

  const results = {
    timestamp: new Date().toISOString(),
    env: {
      groqKeySet: !!GROQ_KEY,
      groqKeyPrefix: GROQ_KEY ? GROQ_KEY.slice(0, 8) + '...' : 'NOT SET',
      groqKeyLength: GROQ_KEY ? GROQ_KEY.length : 0,
      apifyKeySet: !!APIFY_TOKEN,
      apifyKeyPrefix: APIFY_TOKEN ? APIFY_TOKEN.slice(0, 12) + '...' : 'NOT SET',
    },
    groqModels: null,
    groqTestCall: null,
    apifyTest: null,
  };

  // Test 1: Groq models list
  try {
    const r = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { 'Authorization': `Bearer ${GROQ_KEY}` }
    });
    const body = await r.text();
    const parsed = JSON.parse(body);
    results.groqModels = {
      status: r.status,
      ok: r.ok,
      models: parsed.data?.map(m => m.id) || [],
    };
  } catch (e) {
    results.groqModels = { error: e.message };
  }

  // Test 2: Groq simple completion
  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 20,
        messages: [{ role: 'user', content: 'Say HELLO only.' }]
      })
    });
    const body = await r.text();
    const parsed = JSON.parse(body);
    results.groqTestCall = {
      status: r.status,
      ok: r.ok,
      response: parsed.choices?.[0]?.message?.content || body.slice(0, 200),
    };
  } catch (e) {
    results.groqTestCall = { error: e.message };
  }

  // Test 3: Apify account
  try {
    const r = await fetch(`https://api.apify.com/v2/users/me?token=${APIFY_TOKEN}`);
    const body = await r.text();
    const parsed = JSON.parse(body);
    results.apifyTest = {
      status: r.status,
      ok: r.ok,
      username: parsed.data?.username,
      plan: parsed.data?.plan?.id,
    };
  } catch (e) {
    results.apifyTest = { error: e.message };
  }

  return res.status(200).json(results);
}
