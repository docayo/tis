const AI_GATEWAY_URL = 'https://ai-gateway.vercel.sh/v1/chat/completions';
const MODEL = 'deepseek/deepseek-v4.1-flash-fast';

const ALLOWED_ORIGINS = [
  'https://tis-tan.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173'
];

function setCors(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-tis-dev-key');
  }
}

function safeStr(v, max) {
  if (v == null) return '';
  var s = String(v);
  if (s.length > max) s = s.slice(0, max);
  return s;
}

module.exports = async function handler(req, res) {
  setCors(req, res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  const gate = process.env.DEV_AI_KEY || '';
  if (!gate) {
    res.status(500).json({ ok: false, error: 'DEV_AI_KEY not configured on server' });
    return;
  }
  const supplied = req.headers['x-tis-dev-key'] || '';
  if (supplied !== gate) {
    res.status(401).json({ ok: false, error: 'Unauthorized' });
    return;
  }

  const apiKey = process.env.AI_GATEWAY_API_KEY || '';
  if (!apiKey) {
    res.status(500).json({ ok: false, error: 'AI_GATEWAY_API_KEY not configured on server' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { body = {}; }
  }
  body = body || {};

  const prompt = safeStr(body.prompt, 12000).trim();
  if (!prompt) {
    res.status(400).json({ ok: false, error: 'prompt is required' });
    return;
  }

  const system = safeStr(body.system, 4000).trim() ||
    'You are a senior full-stack engineer assisting Dr Ayoola on The Ideal Schools (TIS) codebase. Give complete, copy-paste-ready answers. Prefer full-file replacements over inline patches. Match the existing conventions: PowerShell here-strings for file writes, ESM in api/*.js, Supabase client in supabase-client.js, offline CBT in C:\\TIS-CBT. Never truncate code. If a block is long, split as Part 1 of N.';

  const maxTokens = Math.min(Math.max(parseInt(body.max_tokens, 10) || 4096, 256), 8192);
  const temperature = Math.min(Math.max(parseFloat(body.temperature) || 0.3, 0), 1.5);

  const payload = {
    model: MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user',   content: prompt }
    ],
    max_tokens: maxTokens,
    temperature: temperature
  };

  try {
    const upstream = await fetch(AI_GATEWAY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify(payload)
    });

    const raw = await upstream.text();
    let data = null;
    try { data = JSON.parse(raw); } catch (_) { data = null; }

    if (!upstream.ok) {
      const msg = (data && data.error && (data.error.message || data.error)) || raw || ('Upstream HTTP ' + upstream.status);
      res.status(upstream.status).json({ ok: false, error: String(msg) });
      return;
    }

    const text =
      (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) ||
      '';

    res.status(200).json({
      ok: true,
      model: MODEL,
      text: text,
      usage: (data && data.usage) || null
    });
  } catch (err) {
    res.status(502).json({ ok: false, error: 'AI Gateway error: ' + (err && err.message ? err.message : String(err)) });
  }
};
