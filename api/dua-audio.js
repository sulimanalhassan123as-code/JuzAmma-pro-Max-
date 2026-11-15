// Own-domain proxy for Hisn al-Muslim dua audio.
// Standing rule: third-party media goes through the app's own domain, because
// carriers here (MTN/AYC) throttle or block cross-origin media hosts and the
// APK WebView shows an opaque failure when they do. Only a numeric id is
// accepted, so this cannot be used to fetch arbitrary URLs.
export default async function handler(req, res) {
  const id = String((req.query && req.query.id) || '').replace(/[^0-9]/g, '');
  if (!id) { res.status(400).json({ ok: false, error: 'id required' }); return; }
  const src = 'https://www.hisnmuslim.com/audio/ar/' + id + '.mp3';
  try {
    const r = await fetch(src, { headers: { 'User-Agent': 'NabaQuran/1.0', 'Accept': 'audio/mpeg,*/*' } });
    if (!r.ok) { res.status(404).json({ ok: false, error: 'not found' }); return; }
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', String(buf.length));
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).send(buf);
  } catch (e) {
    res.status(502).json({ ok: false, error: 'upstream fetch failed' });
  }
}
