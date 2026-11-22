// GET /api/turn — relay (TURN) credentials for the Group Study Live voice layer.
//
// A phone-to-phone voice link works on most networks, but some carriers
// (MTN/Airtel CGNAT) block direct media. When a TURN server is configured,
// live-rtc.js picks these credentials up automatically and audio relays
// through it instead of failing.
//
// Configure any one of these in Vercel → Settings → Environment Variables:
//   TURN_URLS   comma-separated, e.g. turn:turn.example.com:3478,turns:turn.example.com:443
//   TURN_USER   username
//   TURN_PASS   password
//   TURN_SECRET optional (coturn "use-auth-secret" mode): when set, short-lived
//               credentials are generated per request instead of static ones.
//
// With nothing configured this returns an empty list — the client then runs
// STUN-only, exactly as before. Nothing breaks.

import crypto from 'crypto';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=60');

  const urls = (process.env.TURN_URLS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!urls.length) {
    return res.status(200).json({ iceServers: [], note: 'no TURN configured' });
  }

  // coturn time-limited credentials (RFC 5766 TURN REST API)
  if (process.env.TURN_SECRET) {
    const ttl = 3600;
    const username = String(Math.floor(Date.now() / 1000) + ttl);
    const credential = crypto
      .createHmac('sha1', process.env.TURN_SECRET)
      .update(username)
      .digest('base64');
    return res.status(200).json({
      iceServers: [{ urls, username, credential }],
      ttl
    });
  }

  if (!process.env.TURN_USER || !process.env.TURN_PASS) {
    return res.status(200).json({ iceServers: [], note: 'TURN urls set without credentials' });
  }

  return res.status(200).json({
    iceServers: [{ urls, username: process.env.TURN_USER, credential: process.env.TURN_PASS }]
  });
}
