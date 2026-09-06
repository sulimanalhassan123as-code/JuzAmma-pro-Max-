// Same-origin proxy for this app's Base44 backend functions
// (getAppConfig, islamicAiProxy, groupVoiceHub — Group Study rooms/chat).
// Why: some carriers fail to reach elara-c85c9ecb.base44.app directly,
// causing "Failed to fetch" on Room Hub / My Rooms / Join Room / AI chat
// even though the device has a working connection. Routing through the
// app's own domain fixes it — same pattern as the audio/text fixes.
const ALLOWED = new Set(['getAppConfig', 'islamicAiProxy', 'groupVoiceHub']);
const BASE = 'https://elara-c85c9ecb.base44.app/functions/';

export default async function handler(req, res) {
  const name = req.query.name;
  if (!ALLOWED.has(name)) {
    res.status(400).json({ ok: false, error: 'unknown function' });
    return;
  }
  try {
    const init = { method: req.method, headers: { 'Content-Type': 'application/json' } };
    if (req.method === 'POST') {
      init.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    }
    const r = await fetch(BASE + name, init);
    const text = await r.text();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(r.status);
    try { res.json(JSON.parse(text)); } catch { res.send(text); }
  } catch (e) {
    res.status(502).json({ ok: false, error: 'upstream fetch failed' });
  }
}
