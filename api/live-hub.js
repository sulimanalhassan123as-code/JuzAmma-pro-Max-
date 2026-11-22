// Same-origin proxy for the liveHub backend function (Live Recitation
// Classroom — chunks of live PCM audio between Group Study room members).
// liveHub is deployed on the Superagent backend (superagent-7ce6afb1),
// NOT on the elara app, so it needs its own route here. Same-origin keeps
// it carrier-proof (MTN/AYC block some base44.app domains) per the
// standing rule: route third-party media/data through the app's own domain.
import crypto from 'crypto';

const BASE = 'https://superagent-7ce6afb1.base44.app/functions/liveHub';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method === 'GET' && (req.query && req.query.turn)) {
    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.status(200).json(turnPayload());
  }
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

// ── TURN credentials for the Group Study voice layer ──────────────
// Lives here instead of its own file because the Hobby plan allows only 12
// serverless functions and all of them are in use.
//   GET /api/live-hub?turn=1  → { iceServers: [...] }
// Configure in Vercel env: TURN_URLS, TURN_USER, TURN_PASS (or TURN_SECRET).
function turnPayload() {
  const urls = (process.env.TURN_URLS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!urls.length) return { iceServers: [], note: 'no TURN configured' };
  if (process.env.TURN_SECRET) {
    const ttl = 3600;
    const username = String(Math.floor(Date.now() / 1000) + ttl);
    const credential = crypto.createHmac('sha1', process.env.TURN_SECRET).update(username).digest('base64');
    return { iceServers: [{ urls, username, credential }], ttl };
  }
  if (!process.env.TURN_USER || !process.env.TURN_PASS) return { iceServers: [], note: 'TURN urls set without credentials' };
  return { iceServers: [{ urls, username: process.env.TURN_USER, credential: process.env.TURN_PASS }] };
}
