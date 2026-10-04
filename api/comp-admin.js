// Admin-gated proxy for Naba Quran competition management.
// The frontend admin panel sends the admin key it holds; this
// endpoint verifies it against the Vercel env var ADMIN_KEY
// (same model as api/daily-ayah-push.js) and only then forwards
// the createCompetition call to the Solas backend with the same
// verified key — so the backend never sees an unverified request.
//
// POST { action: 'createCompetition', title, description,
//        fromSurah, toSurah, durationDays, createdBy, announce? }
// Header: x-admin-key (or ?key= param)
//
// Also supports action 'ensureWeekly' (used by the daily cron,
// which is trusted as admin via the cron header) — see
// api/daily-ayah-push.js.
const BASE = 'https://solas-39a02ff5.base44.app/functions/nabaCompetition';
const ADMIN_KEY = process.env.ADMIN_KEY || '';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'POST only' });
    return;
  }
  const isCron = req.headers['x-vercel-cron'] || req.headers['x-vercel-ip'] === '1';
  const key = req.headers['x-admin-key'] || '';
  const adminOk = ADMIN_KEY && (key === ADMIN_KEY || (new URL(req.url, 'https://juz-amma-pro-max.vercel.app').searchParams.get('key') === ADMIN_KEY));
  if (!adminOk && !isCron) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const action = body.action;
    if (action !== 'createCompetition' && action !== 'ensureWeekly' && action !== 'closeExpired') {
      res.status(400).json({ ok: false, error: 'unknown action' });
      return;
    }
    const r = await fetch(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, adminKey: ADMIN_KEY }),
    });
    const text = await r.text();
    res.status(r.status);
    try { res.json(JSON.parse(text)); } catch { res.send(text); }
  } catch (e) {
    res.status(502).json({ ok: false, error: 'upstream fetch failed' });
  }
}
