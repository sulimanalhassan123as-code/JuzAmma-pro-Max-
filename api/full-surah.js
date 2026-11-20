// Same-origin proxy for full-surah audio (mp3quran.net).
// Two reasons: carriers here (MTN/AYC) throttle or block mp3quran, and the
// standing rule is that third-party media goes through the app's own domain.
// Range requests are passed through so seeking and resume-after-reconnect work.
const SERVERS = new Set(['server7.mp3quran.net','server8.mp3quran.net','server10.mp3quran.net','server12.mp3quran.net']);
const CODE = /^[a-z]{2,10}$/;

export default async function handler(req, res) {
  const r = String(req.query.r || '');
  const s = String(req.query.s || '');
  const srv = String(req.query.srv || '');
  if (!CODE.test(r) || !/^\d{3}$/.test(s) || !SERVERS.has(srv)) {
    res.status(400).json({ ok: false, error: 'bad request' });
    return;
  }
  const url = `https://${srv}/${r}/${s}.mp3`;
  const headers = {};
  if (req.headers.range) headers.range = req.headers.range;
  try {
    const up = await fetch(url, { headers });
    res.status(up.status);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=604800');
    const cr = up.headers.get('content-range');
    if (cr) res.setHeader('Content-Range', cr);
    const cl = up.headers.get('content-length');
    if (cl) res.setHeader('Content-Length', cl);
    const buf = Buffer.from(await up.arrayBuffer());
    res.send(buf);
  } catch (e) {
    res.status(502).json({ ok: false, error: 'upstream failed' });
  }
}
