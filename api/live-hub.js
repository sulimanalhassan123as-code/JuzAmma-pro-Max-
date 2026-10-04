// Same-origin proxy for the liveHub backend function (Live Recitation
// Classroom — chunks of live PCM audio between Group Study room members).
// liveHub is deployed on the Superagent backend (superagent-7ce6afb1),
// NOT on the elara app, so it needs its own route here. Same-origin keeps
// it carrier-proof (MTN/AYC block some base44.app domains) per the
// standing rule: route third-party media/data through the app's own domain.
const BASE = 'https://superagent-7ce6afb1.base44.app/functions/liveHub';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  try {
    const init = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {})
    };
    const r = await fetch(BASE, init);
    const text = await r.text();
    res.status(r.status);
    try { res.json(JSON.parse(text)); } catch { res.send(text); }
  } catch (e) {
    res.status(502).json({ ok: false, error: 'upstream fetch failed' });
  }
}
