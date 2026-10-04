// Same-origin public proxy for Naba Quran's competition backend
// (nabaCompetition, Solas app) — same carrier-proof pattern as
// api/naba.js. Client calls /api/comp (same-origin, CSP-safe),
// this forwards to the backend function server-side.
// Admin-gated actions (createCompetition) go through api/comp-admin.js.
const ALLOWED = new Set(['getCompetitions', 'joinCompetition', 'scoreCompetition', 'getCompLeaderboard', 'myCompetitions']);
const BASE = 'https://solas-39a02ff5.base44.app/functions/nabaCompetition';

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
