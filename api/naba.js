// Same-origin proxy for Naba Quran's Stage 3 community backend
// (nabaCommunity — global leaderboard + testimony wall), hosted on
// the Solas app backend. Same carrier-proof pattern as api/fn.js:
// client calls /api/naba (same-origin, CSP-safe), this forwards to
// the backend function server-side.
const ALLOWED = new Set(['syncPoints', 'getLeaderboard', 'addTestimony', 'listTestimonies']);
const BASE = 'https://solas-39a02ff5.base44.app/functions/nabaCommunity';

export default async function handler(req, res) {
  try {
    const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    const parsed = JSON.parse(body);
    if (!ALLOWED.has(parsed.action)) {
      res.status(400).json({ ok: false, error: 'unknown action' });
      return;
    }
    const r = await fetch(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed),
    });
    const text = await r.text();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(r.status);
    try { res.json(JSON.parse(text)); } catch { res.send(text); }
  } catch (e) {
    res.status(502).json({ ok: false, error: 'upstream fetch failed' });
  }
}
