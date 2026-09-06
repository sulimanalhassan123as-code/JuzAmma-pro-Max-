// Same-origin audio proxy for everyayah.com verse mp3s.
// Why: some mobile carriers (observed on MTN Ghana) fail to reach
// everyayah.com directly, so verse audio silently never plays.
// Serving audio from the app's own domain fixes it — same pattern
// that fixed "Couldn't load the Quran" (self-hosting the text data).
export default async function handler(req, res) {
  const p = req.query.p || '';
  // Strict whitelist: <reciter>/<6-digit>.mp3 (e.g. Alafasy_128kbps/001001.mp3)
  if (!/^[A-Za-z0-9_\-]{1,64}\/\d{6}\.mp3$/.test(p)) {
    res.status(400).json({ error: 'bad path' });
    return;
  }
  const upstream = 'https://everyayah.com/data/' + p;
  const headers = {};
  if (req.headers.range) headers.range = req.headers.range;
  try {
    const r = await fetch(upstream, { headers });
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=604800');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (r.headers.get('content-range')) {
      res.setHeader('Content-Range', r.headers.get('content-range'));
    }
    if (r.headers.get('content-length')) {
      res.setHeader('Content-Length', r.headers.get('content-length'));
    }
    const buf = Buffer.from(await r.arrayBuffer());
    res.status(r.status);
    res.end(buf);
  } catch (e) {
    res.status(502).json({ error: 'upstream fetch failed' });
  }
}
