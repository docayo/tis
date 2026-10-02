// Vercel serverless function — proxies POST to the Supabase Edge Function.
// Placed at /api/verify-recovery-key.

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  const allowed = ['https://tis-tan.vercel.app'];
  if (allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  const SUPABASE_FN = 'https://ndsroviwrfjbgaucajri.supabase.co/functions/v1/verify-recovery-key';

  try {
    const upstream = await fetch(SUPABASE_FN, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': req.headers['user-agent'] || 'vercel-proxy',
        'X-Forwarded-For': (req.headers['x-forwarded-for'] || '').toString(),
      },
      body: JSON.stringify(req.body || {}),
    });

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', 'application/json');
    res.send(text);
  } catch (err) {
    res.status(502).json({ ok: false, error: 'Proxy error: ' + (err && err.message ? err.message : String(err)) });
  }
}
