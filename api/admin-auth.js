import crypto from 'crypto';

// Admin login for admin.html, served from our own domain.
//
// Why this exists: the old check lived in a Base44 function on another host
// (elara-*.base44.app) which is blocked on some carriers and whose password
// nobody can read or reset from this repo. Here the password is only ever a
// salted hash, never the text, and it is compared in constant time.
//
// The password itself is NOT in this file in readable form, and this file is
// never served to browsers.
const SALT = 'nq-admin-v1-8f3a';
const PASS_HASH = '07c10ad5016ff55b6012b974828ecb8d5aec21edaac2d5466d6c6515154bf12e';
const TOKEN_KEY = '3175486380985a8480615c9792cbf2e99446506477be2ec1d99e15f7ee5ba344';

export function checkAdminPassword(pw) {
  try {
    const got = crypto.createHash('sha256').update(SALT + String(pw || '')).digest();
    const want = Buffer.from(PASS_HASH, 'hex');
    return got.length === want.length && crypto.timingSafeEqual(got, want);
  } catch (e) {
    return false;
  }
}

export function adminToken() {
  return crypto.createHmac('sha256', TOKEN_KEY).update(String(Date.now())).digest('hex');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'POST only' });
    return;
  }
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  const pw = (body && body.password) || '';
  if (!checkAdminPassword(pw)) {
    // Deliberately identical shape to the old function so the page needs no change.
    res.status(200).json({ authorized: false, error: 'Invalid password' });
    return;
  }
  res.status(200).json({ authorized: true, token: adminToken() });
}
