// tajweedAsrProxy — NABA QURAN Tajweed Checker (real ASR version)
// ═══════════════════════════════════════════════════════════════
// Accepts: { audio: <base64 webm/mp4 blob>, mime, reference (Arabic verse),
//            surahName, verseNum, dur }
// Pipeline:
//   1. Groq Whisper (whisper-large-v3) transcribes the actual recitation
//   2. Two-pass diff (rasm letters, then harakat) vs the reference verse
//   3. LLM turns the detected errors into teacher-style feedback
// Returns: { ok, transcript, score, words:[{t,h,c}], errors, feedbackText }
// Env required: GROQ_API_KEY
// ═══════════════════════════════════════════════════════════════

export const maxDuration = 60;

const HARAKAT_RE = /[\u064b-\u065f\u0670]/g;

function normalizeT(t) {
  let s = (t || '').normalize('NFC');
  s = s.replace(/\ufeff/g, '').replace(/ٱ/g, 'ا').replace(/ٰ/g, '');
  s = s.replace(/[\u06d6-\u06ed]/g, '');   // Quranic annotation / small marks
  s = s.replace(/\u0640/g, '');           // tatweel
  return s.trim();
}
function rasm(t) { return t.replace(HARAKAT_RE, ''); }

// Word-level alignment (LCS on rasm forms), then harakat comparison.
function wordDiff(asrText, refText) {
  const a = normalizeT(asrText).split(/\s+/).filter(Boolean);
  const r = normalizeT(refText).split(/\s+/).filter(Boolean);
  const ra = a.map(w => rasm(w)), rr = r.map(w => rasm(w));

  // LCS opcodes via DP
  const n = a.length, m = r.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = ra[i] === rr[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);

  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (ra[i] === rr[j]) {
      out.push({ t: a[i] === r[j] ? 'OK' : 'HARAKAT_ERROR', h: a[i], c: r[j] });
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ t: 'INSERTION', h: a[i], c: null });   // extra word
      i++;
    } else {
      out.push({ t: 'DELETION', h: null, c: r[j] });   // missed word
      j++;
    }
  }
  while (i < n) { out.push({ t: 'INSERTION', h: a[i], c: null }); i++; }
  while (j < m) { out.push({ t: 'DELETION', h: null, c: r[j] }); j++; }
  return out;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'POST only' }); return; }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ ok: false, error: 'missing GROQ_API_KEY env' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const audioB64 = body.audio, mime = body.mime || 'audio/webm';
    const reference = body.reference || '', surahName = body.surahName || '', verseNum = body.verseNum || 0, dur = body.dur || 0;

    if (!audioB64) return res.status(400).json({ ok: false, error: 'no audio' });
    const buf = Buffer.from(audioB64, 'base64');
    if (!buf.length || buf.length > 4 * 1024 * 1024)
      return res.status(400).json({ ok: false, error: 'bad audio size' });

    // ── 1. ASR: actual transcription of the recording ──
    const fd = new FormData();
    fd.append('file', new Blob([buf], { type: mime }), 'recitation.' + (mime.includes('mp4') ? 'mp4' : 'webm'));
    fd.append('model', 'whisper-large-v3');
    fd.append('language', 'ar');
    fd.append('temperature', '0');
    fd.append('response_format', 'json');
    fd.append('prompt', 'القرآن الكريم بالتشكيل الكامل، آيات قرآنية عربية: ' + reference);

    const asrRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: fd
    });
    if (!asrRes.ok) {
      const t = await asrRes.text();
      console.error('whisper error', asrRes.status, t.slice(0, 300));
      return res.status(502).json({ ok: false, error: 'transcription failed' });
    }
    const asr = await asrRes.json();
    const transcript = (asr.text || '').trim();

    if (!transcript) {
      return res.status(200).json({
        ok: true, transcript: '', score: null, words: [], errors: [], feedbackText: '',
        note: 'NO_SPEECH'
      });
    }

    // ── 2. Diff vs reference ──
    const words = wordDiff(transcript, reference);
    const counts = { OK: 0, HARAKAT_ERROR: 0, SUBSTITUTION: 0, DELETION: 0, INSERTION: 0 };
    for (const w of words) counts[w.t] = (counts[w.t] || 0) + 1;
    const score = Math.round(
      ((counts.OK + 0.75 * counts.HARAKAT_ERROR) / Math.max(1, counts.OK + counts.HARAKAT_ERROR + counts.DELETION + counts.SUBSTITUTION + counts.INSERTION)) * 100
    );

    const errors = words.filter(w => w.t !== 'OK').map(w => ({
      type: w.t,
      heard: w.h, correct: w.c
    }));

    // ── 3. LLM teacher feedback from the REAL recitation ──
    let feedbackText = '';
    try {
      const errLines = errors.length
        ? errors.map(e => `- ${e.type}: heard "${e.heard || '(nothing)'}" vs correct "${e.correct || '(extra word)'}"`).join('\n')
        : '- none: every word matched the reference';
      const prompt =
        'You are an expert Quran Tajweed teacher. A student recited Surah ' + surahName + ' verse ' + verseNum +
        ' (recording length ' + dur + ' seconds).\n' +
        'Speech recognition heard them recite: ' + transcript + '\n' +
        'Correct verse text: ' + reference + '\n' +
        'Word-level comparison result:\n' + errLines + '\n\n' +
        'Respond ONLY in this exact plain-text format, no markdown, no asterisks, no extra commentary:\n' +
        'PACE: <one short sentence on their pace based on ' + dur + 's and the verse length>\n' +
        'RULES: <rule name>: <short tip> | <rule name>: <short tip>\n' +
        'WORDS: <arabic word they got wrong or should focus on>: <short tip> | <arabic word>: <short tip>\n' +
        'TIP: <one short practice tip tied to their actual mistakes>\n' +
        'Keep every line short (max 18 words). Warm, encouraging tone. If the recitation matched perfectly, praise them in PACE and make WORDS about words worth perfecting. Use the pipe character | to separate multiple items.';

      const chatRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'openai/gpt-oss-120b',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.6,
          max_tokens: 600
        })
      });
      if (chatRes.ok) {
        const cd = await chatRes.json();
        feedbackText = cd.choices?.[0]?.message?.content || '';
      } else {
        console.error('chat error', chatRes.status);
      }
    } catch (e) { console.error('chat fail', e); }

    res.status(200).json({ ok: true, transcript, score, words, errors, feedbackText, note: '' });
  } catch (e) {
    console.error('tajweed error', e);
    res.status(500).json({ ok: false, error: 'server error' });
  }
}
