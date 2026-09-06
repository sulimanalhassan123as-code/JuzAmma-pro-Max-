// Same-origin proxy for api.aladhan.com prayer times.
// Why: if the carrier blocks/struggles with the external API, prayer
// times never load. Also used as fallback when direct fetch fails.
export default async function handler(req, res) {
  const lat = req.query.lat || '';
  const lon = req.query.lon || '';
  if (!/^-?\d{1,2}(\.\d+)?$/.test(lat) || !/^-?\d{1,3}(\.\d+)?$/.test(lon)) {
    res.status(400).json({ error: 'bad coords' });
    return;
  }
  const method = ['1','2','3','4','5','8','9','10','11','12','13','14','15','16','20','21','22'].includes(String(req.query.method)) ? req.query.method : '3';
  const url = 'https://api.aladhan.com/v1/timings?latitude=' + lat + '&longitude=' + lon + '&method=' + method;
  try {
    const r = await fetch(url);
    const j = await r.json();
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json(j);
  } catch (e) {
    res.status(502).json({ error: 'upstream fetch failed' });
  }
}
