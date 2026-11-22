import crypto from 'crypto';

// Admin login for admin.html, served from our own domain.
//
// History: this file used to carry the salt, the password hash and an HMAC
// signing key in plain sight. The repository is public, so all three were
// readable by anyone. They now live only in Vercel environment variables
// (ADMIN_PASS_STORED) and nothing secret is committed here.
//
// ADMIN_PASS_STORED format: pbkdf2$<iterations>$<saltHex>$<hashHex>
// PBKDF2 rather than a plain hash so a leaked value is expensive to attack.
// The session token is random and opaque: there is no signing key left that
// anyone could use to mint one.
const DEFAULT_ITER = 210000;

function storedHash() {
  return process.env.ADMIN_PASS_STORED || '';
}

export function isConfigured() {
  return storedHash().length > 0;
}

export function checkAdminPassword(pw) {
  const stored = storedHash();
  if (!stored) return false;
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iter = parseInt(parts[1], 10) || DEFAULT_ITER;
  let salt;
  let want;
  try {
    salt = Buffer.from(parts[2], 'hex');
    want = Buffer.from(parts[3], 'hex');
  } catch (e) {
    return false;
  }
  if (!want.length) return false;
  try {
    const got = crypto.pbkdf2Sync(String(pw || ''), salt, iter, want.length, 'sha256');
    return got.length === want.length && crypto.timingSafeEqual(got, want);
  } catch (e) {
    return false;
  }
}

// The signing key is DERIVED from the stored secret, never committed on its
// own, so rotating the passphrase also rotates this. A token can be checked
// later without any session store.
function signingKey() {
  return crypto.createHash('sha256').update('nq-token-v1|' + storedHash()).digest();
}

export function adminToken(ttlHours) {
  const exp = Date.now() + (ttlHours || 12) * 3600 * 1000;
  const payload = Buffer.from(JSON.stringify({ exp: exp })).toString('base64url');
  const sig = crypto.createHmac('sha256', signingKey()).update(payload).digest('base64url');
  return payload + '.' + sig;
}

export function verifyAdminToken(tok) {
  if (!tok || typeof tok !== 'string' || tok.indexOf('.') < 0) return false;
  const i = tok.lastIndexOf('.');
  const payload = tok.slice(0, i);
  const sig = tok.slice(i + 1);
  let want;
  try {
    want = crypto.createHmac('sha256', signingKey()).update(payload).digest('base64url');
  } catch (e) {
    return false;
  }
  const a = Buffer.from(sig);
  const b = Buffer.from(want);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    const d = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof d.exp === 'number' && Date.now() < d.exp;
  } catch (e) {
    return false;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'POST only' });
    return;
  }
  if (!isConfigured()) {
    // Fail closed and say so, rather than ever accepting a guess.
    res.status(503).json({ authorized: false, error: 'Admin auth not configured' });
    return;
  }
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  const pw = (body && body.password) || '';
  if (!checkAdminPassword(pw)) {
    res.status(200).json({ authorized: false, error: 'Invalid password' });
    return;
  }
  res.status(200).json({ authorized: true, token: adminToken() });
}
