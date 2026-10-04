// ═══════════════════════════════════════════════════════════
// QURAN COMPANIONS (v115) — AI hifz coach with adaptive lines
// ═══════════════════════════════════════════════════════════
// Pick a section → recite daily → the AI scores every word and
// adapts tomorrow's line count to how well you read (95%+ grows
// the plan, below 90% shrinks it). Reuses the proven /api/tajweed
// backend (Groq Whisper + word diff) from AI Reading Mode, and
// every passed verse flows through gsRmSaveVerse so points, rank
// badges and competitions all update automatically.

const QC_PASS = 90, QC_MASTER = 95;
let qcScreen = 'dash';
let qcSes = null;   // active session
let qcQuiz = null;  // active quiz
let qcAlphaQ = null;
let qcAlphaOpen = -1;
let qcRec = null, qcChunks = [], qcRecOn = false, qcRecSec = 0, qcRecInt = null, qcBusy = false;
let qcAudio = null;

function qcLoad() { try { return JSON.parse(localStorage.getItem('qc_journey') || 'null'); } catch (e) { return null; } }
function qcSave(j) { try { localStorage.setItem('qc_journey', JSON.stringify(j)); } catch (e) {} }
function qcSurah(j) { return qData.find(function(s){ return s.id === j.surah; }) || qData[0]; }
function qcVerseText(j, n) { const s = qcSurah(j); const v = s.verses[n-1]; return v ? v.a : ''; }
function qcVerseEn(j, n) { const s = qcSurah(j); const v = s.verses[n-1]; return (v && v.e) ? v.e : ''; }
function qcToday() { return new Date().toISOString().slice(0,10); }
function qcPad(n) { return ('00' + n).slice(-3); }
function qcPlayedVerses(j) {
  // verses in range with a stored AI Reading score (shared with Group Study)
  const p = gsRmLoadProg()[j.surah] || {};
  const out = [];
  for (let n = j.fromV; n <= j.toV; n++) if (p[n] || p[String(n)]) out.push(n);
  return out;
}
function qcPassedVerses(j) {
  const p = gsRmLoadProg()[j.surah] || {};
  const out = [];
  for (let n = j.fromV; n <= j.toV; n++) { const s = p[n] || p[String(n)]; if (s && s >= QC_PASS) out.push(n); }
  return out;
}

function qcInit() {
  qcScreen = 'dash';
  qcRender();
}
function qcRender() {
  const body = document.getElementById('qc-body');
  if (!body) return;
  const j = qcLoad();
  if (qcScreen === 'session' && qcSes) { qcRenderSession(); return; }
  if (qcScreen === 'results' && qcSes) { qcRenderResults(); return; }
  if (qcScreen === 'quiz') { qcRenderQuiz(); return; }
  if (!j) { qcRenderSetup(); return; }
  qcRenderDash(j);
}

// ── Setup screen ────────────────────────────────────────────
function qcRenderSetup() {
  const body = document.getElementById('qc-body');
  let opts = '';
  try {
    qData.forEach(function(s){ opts += '<option value="' + s.id + '">' + s.name + ' (' + s.verses.length + ' verses)</option>'; });
  } catch (e) {}
  body.innerHTML =
    '<div class="qc-card">' +
      '<div class="qc-coach">🧑‍🏫 <b>Your Companion is ready!</b><br>Pick a section of the Quran and I will walk with you, line by line, every single day. I listen to your recitation, correct every word, and adjust your daily lines to match your pace. You will finish your section, InshaAllah.</div>' +
    '</div>' +
    '<div class="qc-card">' +
      '<div class="qc-sec">1 · Your name</div>' +
      '<input class="qc-in" id="qc-name" maxlength="20" placeholder="e.g. Sulley">' +
      '<div class="qc-sec" style="margin-top:16px">2 · Choose your section</div>' +
      '<select class="qc-in qc-sel" id="qc-surah">' + opts + '</select>' +
      '<div class="qc-row2">' +
        '<div class="qc-cell"><div class="qc-lbl">From verse</div><input class="qc-in" id="qc-from" type="number" min="1" value="1" inputmode="numeric"></div>' +
        '<div class="qc-cell"><div class="qc-lbl">To verse</div><input class="qc-in" id="qc-to" type="number" min="1" value="10" inputmode="numeric"></div>' +
      '</div>' +
      '<div class="qc-sec" style="margin-top:16px">3 · Your daily pace</div>' +
      '<div class="qc-row2">' +
        '<div class="qc-cell"><div class="qc-lbl">Lines per day (start)</div><input class="qc-in" id="qc-lines" type="number" min="1" max="30" value="3" inputmode="numeric"></div>' +
        '<div class="qc-cell"><div class="qc-lbl">Max lines per day</div><input class="qc-in" id="qc-max" type="number" min="1" max="30" value="10" inputmode="numeric"></div>' +
      '</div>' +
      '<div class="qc-note">The AI grows or shrinks your daily lines based on how accurately you recite.</div>' +
      '<button class="qc-go" onclick="qcStartJourney()">🚀 Start My Journey</button>' +
    '</div>';
}

function qcStartJourney() {
  const name = (document.getElementById('qc-name').value || '').trim().slice(0, 20);
  const sid = parseInt(document.getElementById('qc-surah').value, 10);
  const from = parseInt(document.getElementById('qc-from').value, 10);
  const to = parseInt(document.getElementById('qc-to').value, 10);
  const lines = Math.max(1, Math.min(30, parseInt(document.getElementById('qc-lines').value, 10) || 3));
  const max = Math.max(lines, Math.min(30, parseInt(document.getElementById('qc-max').value, 10) || 10));
  const s = qData.find(function(x){ return x.id === sid; });
  if (!name) { toast('Please enter your name first'); return; }
  if (!s) { toast('Choose a surah'); return; }
  const vf = isFinite(from) ? from : 1, vt = isFinite(to) ? to : Math.min(10, s.verses.length);
  if (vf < 1 || vt < vf || vt > s.verses.length) { toast('Verse range: 1 to ' + s.verses.length + ', and To must be ≥ From'); return; }
  try { gsUserName = name; localStorage.setItem('nqUserName', name); } catch (e) {}
  qcSave({
    name: name, surah: sid, fromV: vf, toV: vt,
    lines: lines, maxLines: max,
    day: 1, lastDate: null, nextV: vf,
    streakClean: 0, struggle: 0,
    sessions: [], weak: {}, hw: null, quizzes: [], badges: [], done: false
  });
  toast('🚀 Journey started — ' + s.name + ' ' + vf + '–' + vt);
  qcRender();
}

// ── Dashboard ───────────────────────────────────────────────
function qcRenderDash(j) {
  const body = document.getElementById('qc-body');
  const s = qcSurah(j);
  const total = j.toV - j.fromV + 1;
  const passed = qcPassedVerses(j);
  const doneToday = j.lastDate === qcToday();
  const nextQ = [];
  for (let n = j.nextV; n <= Math.min(j.toV, j.nextV + j.lines - 1); n++) nextQ.push(n);
  const revN = (j.sessions && j.sessions.length) ? j.sessions[j.sessions.length-1].new : [];
  const weakList = Object.keys(j.weak || {}).filter(function(w){ return j.weak[w].until > Date.now(); });
  const avgAll = (j.sessions || []).length ? Math.round(j.sessions.reduce(function(a, x){ return a + (x.avg || 0); }, 0) / j.sessions.length) : 0;
  let hwHtml = '';
  if (j.hw && !j.hw.complete) {
    let dots = '';
    for (let i = 0; i < j.hw.reps; i++) dots += '<div class="qc-hw-dot' + (i < j.hw.done ? ' on' : '') + '" onclick="qcHwTap()">' + (i < j.hw.done ? '✓' : '') + '</div>';
    hwHtml =
      '<div class="qc-card">' +
        '<div class="qc-sec">📝 Homework — assigned by your Companion</div>' +
        '<div class="qc-desc">Recite verses <b>' + j.hw.from + '–' + j.hw.to + '</b> of ' + s.name + ' <b>' + (j.hw.reps - j.hw.done) + ' more time' + (j.hw.reps - j.hw.done > 1 ? 's' : '') + '</b> aloud (from memory if you can). Tap a circle each time you finish:</div>' +
        '<div class="qc-hw-row">' + dots + '</div>' +
      '</div>';
  }
  body.innerHTML =
    '<div class="qc-hero">' +
      '<div class="qc-hero-top"><span class="qc-hello">Assalamu Alaikum, <b>' + j.name + '</b> 👋</span><span class="qc-day-pill">Day ' + j.day + '</span></div>' +
      '<div class="qc-jtitle">📖 ' + s.name + ' · Verses ' + j.fromV + '–' + j.toV + '</div>' +
      '<div class="qc-prog-row"><div class="qc-prog"><div class="qc-prog-fill" style="width:' + Math.round(passed.length / total * 100) + '%"></div></div><span class="qc-prog-n">' + passed.length + '/' + total + '</span></div>' +
      '<div class="qc-mom-row">' +
        '<div class="qc-mom"><span class="qc-mom-n">' + j.lines + '</span><span class="qc-mom-l">lines/day</span></div>' +
        '<div class="qc-mom"><span class="qc-mom-n">' + (j.streakClean || 0) + '🔥</span><span class="qc-mom-l">clean streak</span></div>' +
        '<div class="qc-mom"><span class="qc-mom-n">' + avgAll + '%</span><span class="qc-mom-l">avg score</span></div>' +
      '</div>' +
    '</div>' +
    (j.done ?
      '<div class="qc-card"><div class="qc-coach">🎉 <b>' + j.name + ', you finished ' + s.name + ' verses ' + j.fromV + '–' + j.toV + '!</b><br>MashaAllah, incredible work. Your Companion is ready for the next section whenever you are.</div>' +
      '<button class="qc-go" onclick="qcReset()">➕ Start a New Journey</button></div>'
      :
      '<div class="qc-card">' +
        '<div class="qc-sec">' + (doneToday ? '✅ Today\u2019s session — completed' : '🎯 Today\u2019s plan') + '</div>' +
        (doneToday
          ? '<div class="qc-desc">You already trained today. Come back tomorrow — your Companion has planned <b>' + j.lines + ' new line' + (j.lines > 1 ? 's' : '') + '</b>.</div>'
          : '<div class="qc-desc">' + (revN.length ? 'Quick revision of <b>' + revN.length + ' line' + (revN.length > 1 ? 's' : '') + '</b> from last session, then <b>' + nextQ.length + ' new line' + (nextQ.length > 1 ? 's' : '') + '</b>' + (nextQ.length ? ' (verses ' + nextQ[0] + (nextQ.length > 1 ? '–' + nextQ[nextQ.length-1] : '') + ')' : '') + '. I will listen and correct you word by word.</div>' +
            '<button class="qc-go" onclick="qcStartSession()">🎤 Start Today\u2019s Session</button>') +
      '</div>') +
    hwHtml +
    (weakList.length ?
      '<div class="qc-card"><div class="qc-sec">⚠️ Words to watch (' + weakList.length + ')</div><div class="qc-weak-row">' +
      weakList.slice(0, 12).map(function(w){ return '<span class="qc-weak-chip">' + w + ' <s>' + (j.weak[w].n) + '</s></span>'; }).join('') +
      '</div><div class="qc-desc" style="margin-top:8px">These words tripped you recently — they stay in your revision until you read them clean 3 days in a row.</div></div>' : '') +
    '<div class="qc-grid2">' +
      '<div class="qc-mini" onclick="qcScreen=\'quiz\'; qcStartQuiz();"><div class="qc-mini-i">🧩</div><div class="qc-mini-t">Quiz</div><div class="qc-mini-s">Test your memory</div></div>' +
      '<div class="qc-mini" onclick="goToView(\'qcalpha\')"><div class="qc-mini-i">🔤</div><div class="qc-mini-t">Alphabet</div><div class="qc-mini-s">Letters & makhraj</div></div>' +
    '</div>' +
    ((j.quizzes || []).length ? '<div class="qc-card"><div class="qc-sec">🧩 Quiz history</div>' +
      j.quizzes.slice(-4).reverse().map(function(q){ return '<div class="qc-desc">• ' + q.d + ' — ' + q.score + '/' + q.total + (q.score === q.total ? ' 🌟' : '') + '</div>'; }).join('') + '</div>' : '') +
    ((j.badges || []).length ? '<div class="qc-card"><div class="qc-sec">🏅 Badges</div><div class="qc-badge-row">' + j.badges.map(function(b){ return '<span class="qc-badge">' + b + '</span>'; }).join('') + '</div></div>' : '') +
    '<div class="qc-foot"><span onclick="qcReset()" class="qc-link">↺ Reset / new journey</span></div>';
}

function qcHwTap() {
  const j = qcLoad(); if (!j || !j.hw || j.hw.complete) return;
  j.hw.done++;
  if (j.hw.done >= j.hw.reps) {
    j.hw.complete = true;
    if (j.badges.indexOf('Homework Hero') < 0) j.badges.push('Homework Hero');
    toast('🎉 Homework complete — well done!');
  } else toast('✓ ' + j.hw.done + '/' + j.hw.reps + ' — keep going');
  qcSave(j);
  qcRender();
}

function qcReset() {
  if (qcLoad() && !confirm('Reset your Quran Companions journey? Your saved verse passes and points stay — only the plan restarts.')) return;
  localStorage.removeItem('qc_journey');
  qcScreen = 'dash';
  qcRender();
}

// ── Session engine ──────────────────────────────────────────
function qcStartSession() {
  const j = qcLoad(); if (!j) return;
  const prevNew = (j.sessions && j.sessions.length) ? j.sessions[j.sessions.length-1].new : [];
  const newQ = [];
  for (let n = j.nextV; n <= Math.min(j.toV, j.nextV + j.lines - 1); n++) newQ.push(n);
  qcSes = { phase: prevNew.length ? 'rev' : 'new', revQueue: prevNew.slice(0, 5), newQueue: newQ, idx: 0, scores: {}, attempts: {}, results: [] };
  qcScreen = 'session';
  qcRender();
}

function qcSesVerses() {
  // remaining verses in current phase queue
  const q = qcSes.phase === 'rev' ? qcSes.revQueue : qcSes.newQueue;
  return q;
}
function qcCurVerse() {
  const q = qcSesVerses();
  return q[qcSes.idx] || null;
}
function qcIsLast() {
  const q = qcSesVerses();
  return qcSes.idx >= q.length - 1;
}

function qcRenderSession() {
  const body = document.getElementById('qc-body');
  const j = qcLoad();
  const n = qcCurVerse();
  if (n === null) {
    // phase done
    if (qcSes.phase === 'rev' && qcSes.newQueue.length) { qcSes.phase = 'new'; qcSes.idx = 0; qcRenderSession(); return; }
    qcSessionEnd(); return;
  }
  const phase = qcSes.phase === 'rev' ? '🔁 Revision' : '✨ New line';
  const q = qcSesVerses();
  const text = qcVerseText(j, n);
  const en = qcVerseEn(j, n);
  body.innerHTML =
    '<div class="qc-hero">' +
      '<div class="qc-hero-top"><span class="qc-hello">' + phase + '</span><span class="qc-day-pill">' + (qcSes.idx + 1) + '/' + q.length + '</span></div>' +
      '<div class="qc-jtitle">' + qcSurah(j).name + ' · Verse ' + n + (qcSes.phase === 'new' ? '' : ' (re-test)') + '</div>' +
    '</div>' +
    '<div class="qc-card qc-verse-card">' +
      '<div class="qc-big-ar" dir="rtl">' + text + '</div>' +
      (en ? '<div class="qc-big-en">' + en + '</div>' : '') +
      '<div class="qc-verse-btns">' +
        '<button class="qc-lite" onclick="qcListen(' + n + ')">🎧 Hear sheikh</button>' +
        '<button class="qc-mic' + (qcRecOn ? ' rec' : '') + '" onclick="qcMic()">' + (qcRecOn ? '⏹' : '🎤') + '</button>' +
        '<button class="qc-lite" onclick="qcSkip()">Skip →</button>' +
      '</div>' +
      '<div class="qc-mic-lbl" id="qc-mic-lbl">' + (qcRecOn ? 'Recording… tap to stop and analyze' : 'Tap the mic, then recite the verse') + '</div>' +
      '<div id="qc-fb"></div>' +
    '</div>' +
    '<div class="qc-foot"><span class="qc-link" onclick="qcAbandon()">← End session early</span></div>';
}

function qcListen(n) {
  const j = qcLoad();
  try {
    if (qcAudio) { qcAudio.pause(); qcAudio = null; }
    qcAudio = new Audio(eyUrl('Alafasy_128kbps', qcPad(j.surah), qcPad(n)));
    qcAudio.play().catch(function(){ toast('Audio unavailable — check connection'); });
  } catch (e) {}
}

function qcMic() {
  if (qcBusy) return;
  if (qcRecOn) { qcRecStop(); return; }
  qcChunks = []; qcRecSec = 0;
  try {
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function(stream) {
      qcRec = new MediaRecorder(stream);
      qcRec.ondataavailable = function(e) { if (e.data.size) qcChunks.push(e.data); };
      qcRec.onstop = function() {
        stream.getTracks().forEach(function(t){ t.stop(); });
        qcAnalyze();
      };
      qcRec.start();
      qcRecOn = true;
      qcRecInt = setInterval(function(){ qcRecSec++; if (qcRecSec >= 40) qcRecStop(); }, 1000);
      qcRender();
    }).catch(function(){ toast('🎤 Mic permission needed — allow microphone access'); });
  } catch (e) { toast('Mic not supported on this device'); }
}
function qcRecStop() {
  if (qcRec && qcRec.state !== 'inactive') { try { qcRec.stop(); } catch (e) {} }
  qcRecOn = false;
  if (qcRecInt) { clearInterval(qcRecInt); qcRecInt = null; }
  qcRender();
}

async function qcAnalyze() {
  const j = qcLoad();
  const n = qcCurVerse();
  const fb = document.getElementById('qc-fb');
  if (!n || !qcChunks.length) {
    if (fb) fb.innerHTML = '<div class="qc-fb-bad">⚠️ No recording captured — tap the mic and read again.</div>';
    return;
  }
  qcBusy = true;
  if (fb) fb.innerHTML = '<div class="qc-fb-wait">🧠 Listening back and checking every word…</div>';
  try {
    const blob = new Blob(qcChunks, { type: (qcRec && qcRec.mimeType) || 'audio/webm' });
    const b64 = await new Promise(function(res, rej) {
      const r = new FileReader();
      r.onload = function() { res(String(r.result).split(',')[1]); };
      r.onerror = rej;
      r.readAsDataURL(blob);
    });
    const r = await fetch('/api/tajweed', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio: b64, mime: blob.type, reference: qcVerseText(j, n), surahName: qcSurah(j).name, verseNum: n, dur: qcRecSec })
    });
    const d = await r.json();
    if (!d.ok) throw new Error(d.error || 'asr failed');
    if (d.note === 'NO_SPEECH') {
      if (fb) fb.innerHTML = '<div class="qc-fb-bad">⚠️ I could not hear you. Move somewhere quiet and try again.</div>';
      qcBusy = false; qcRenderMicBack(); return;
    }
    const score = d.score || 0;
    qcSes.scores[n] = Math.max(qcSes.scores[n] || 0, score);
    qcSes.attempts[n] = (qcSes.attempts[n] || 0) + 1;
    if (score >= QC_PASS) gsRmSaveVerse(j.surah, n, score);  // points/rank flow automatically
    if (score >= QC_PASS) qcWeakClean(j, n);
    else qcWeakAdd(j, d.words || []);
    // per-word diff (same proven rendering as AI Reading Mode)
    const wordsHtml = (d.words || []).map(function(w) {
      const cls = { SUBSTITUTION:'tj-w-bad', DELETION:'tj-w-miss', INSERTION:'tj-w-extra', HARAKAT_ERROR:'tj-w-har' }[w.t] || 'tj-w-ok';
      let inner = (w.h || '');
      if (w.t === 'DELETION') inner = (w.c || '') + ' (missed)';
      if (w.t === 'SUBSTITUTION') inner = w.h;
      const fix = (w.t === 'SUBSTITUTION' || w.t === 'HARAKAT_ERROR') && w.c ? ' <span class="tj-w-fix">✓ ' + w.c + '</span>' : '';
      return '<span class="tj-word ' + cls + '">' + inner + fix + '</span>';
    }).join('');
    const errHtml = (d.errors || []).length ? (d.errors || []).map(function(e) {
      const label = e.t === 'SUBSTITUTION' ? '❌ Wrong word' : e.t === 'DELETION' ? '❌ Missed word' : e.t === 'INSERTION' ? '❌ Extra word' : '⚠️ Tajweed mark slip';
      return '<div class="qc-err">' + label + ': ' + (e.heard || '') + (e.heard && e.correct ? ' → should be ' : '') + (e.correct || '') + '</div>';
    }).join('') : '<div class="qc-err-ok">✅ Every word matched — MashaAllah!</div>';
    const pass = score >= QC_PASS;
    const coach = pass
      ? (score >= QC_MASTER ? '🌟 Beautiful recitation, ' + j.name + '! Moving on.' : '🎉 Passed! Keep that focus, ' + j.name + '.')
      : '📖 Almost there — read again slowly. You need ' + QC_PASS + '%.';
    const ringColor = score >= 90 ? '#10b981' : (score >= 60 ? '#f59e0b' : '#ef4444');
    const fbWrap = document.getElementById('qc-fb');
    if (fbWrap) fbWrap.innerHTML =
      '<div class="qc-score-wrap">' +
        '<div class="qc-ring" style="background:conic-gradient(' + ringColor + ' ' + score + '%, var(--bdr) 0)"><span>' + score + '%</span></div>' +
        '<div class="qc-coach-mini">' + coach + '</div>' +
      '</div>' +
      '<div class="qc-words">' + wordsHtml + '</div>' +
      '<div style="margin-top:10px">' + errHtml + '</div>' +
      (pass || qcSes.attempts[n] >= 3
        ? '<button class="qc-go qc-next" onclick="qcNext()">' + (pass ? 'Next line →' : 'Move on (it will repeat tomorrow) →') + '</button>'
        : '<div class="qc-mic-lbl">Tap the mic and try again — attempt ' + qcSes.attempts[n] + '/3</div>');
    qcSes.results.push({ v: n, s: score, pass: pass, phase: qcSes.phase });
    toast(pass ? '✅ ' + score + '% — passed!' : '📖 ' + score + '% — try again');
  } catch (e) {
    if (fb) fb.innerHTML = '<div class="qc-fb-bad">⚠️ Analysis failed (' + (e.message || 'error') + '). Check connection.</div>';
  }
  qcBusy = false;
}
function qcRenderMicBack() { const m = document.getElementById('qc-mic'); if (m) { m.classList.remove('rec'); m.textContent = '🎤'; } }

function qcNext() {
  qcSes.idx++;
  const q = qcSesVerses();
  if (qcSes.idx >= q.length) {
    if (qcSes.phase === 'rev' && qcSes.newQueue.length) { qcSes.phase = 'new'; qcSes.idx = 0; }
    else { qcSessionEnd(); return; }
  }
  qcRender();
}
function qcSkip() { qcNext(); }
function qcAbandon() {
  if (!confirm('End the session early? Your passed lines are saved.')) return;
  qcSes = null; qcScreen = 'dash'; qcRender();
}

function qcWeakAdd(j, words) {
  j.weak = j.weak || {};
  (words || []).forEach(function(w) {
    if (!w.t || !w.c) return;
    j.weak[w.c] = { n: (j.weak[w.c] ? j.weak[w.c].n : 0) + 1, until: Date.now() + 3 * 86400000 };
  });
  qcSave(j);
}
function qcWeakClean(j, n) {
  // pass with 90+ cleans the weak markers for now (they age out in 3 days anyway)
  qcSave(j);
}

function qcSessionEnd() {
  const j = qcLoad();
  const newQ = qcSes.newQueue;
  const newScores = newQ.map(function(n){ return qcSes.scores[n]; }).filter(function(s){ return typeof s === 'number'; });
  const lastScore = {};
  newQ.forEach(function(n){ if (typeof qcSes.scores[n] === 'number') lastScore[n] = qcSes.scores[n]; });
  const passedNew = newQ.filter(function(n){ return (qcSes.scores[n] || 0) >= QC_PASS; });
  const failedNew = newQ.filter(function(n){ return (qcSes.scores[n] || 0) < QC_PASS; });
  const avg = newScores.length ? Math.round(newScores.reduce(function(a, b){ return a + b; }, 0) / newScores.length) : 0;
  const allPassed = failedNew.length === 0 && passedNew.length > 0;
  // adaptive engine
  let adj = 0, why = '';
  if (allPassed && avg >= QC_MASTER) {
    j.streakClean = (j.streakClean || 0) + 1;
    if (j.streakClean > 0 && j.streakClean % 3 === 0) { adj = 2; why = '3 clean sessions in a row — bonus line!'; }
    else { adj = 1; why = 'Excellent reading — tomorrow grows.'; }
  } else if (allPassed && avg >= QC_PASS) {
    why = 'Solid reading — same pace tomorrow.';
  } else if (newScores.length === 0) {
    why = 'No new lines attempted — same plan tomorrow.';
  } else {
    adj = -1;
    j.struggle = (j.struggle || 0) + 1;
    if (j.struggle >= 3) { adj = -2; j.struggle = 0; why = 'Tough few days — slowing down, you\u2019ve got this. 💪'; }
    else why = 'Tomorrow trims a line so you can master it.';
    j.streakClean = 0;
  }
  j.lines = Math.max(1, Math.min(j.maxLines, j.lines + adj));
  // advance the pointer only past passed lines
  let nv = j.nextV;
  while (nv <= j.toV && qcPassedVerses({ surah: j.surah, fromV: j.fromV, toV: j.toV }).indexOf(nv) >= 0) nv++;
  j.nextV = nv;
  j.day = (j.lastDate === qcToday()) ? j.day : j.day + 1;
  j.lastDate = qcToday();
  j.sessions = j.sessions || [];
  j.sessions.push({ d: qcToday(), new: newQ, scores: lastScore, avg: avg, passed: passedNew, failed: failedNew, adj: adj });
  // homework: recite today's new lines 5 times before tomorrow
  if (passedNew.length) j.hw = { from: passedNew[0], to: passedNew[passedNew.length-1], reps: 5, done: 0, complete: false };
  // badges
  j.badges = j.badges || [];
  if (j.sessions.length === 1 && j.badges.indexOf('First Session') < 0) j.badges.push('First Session');
  if (j.streakClean >= 3 && j.badges.indexOf('Momentum') < 0) j.badges.push('Momentum');
  const passedAll = qcPassedVerses(j);
  if (passedAll.length >= Math.ceil((j.toV - j.fromV + 1) / 2) && j.badges.indexOf('Halfway') < 0) j.badges.push('Halfway');
  if (passedAll.length >= (j.toV - j.fromV + 1)) {
    j.done = true;
    if (j.badges.indexOf('Surah Complete 🏆') < 0) j.badges.push('Surah Complete 🏆');
  }
  qcSave(j);
  qcSes.summary = { avg: avg, passed: passedNew, failed: failedNew, adj: adj, why: why, lines: j.lines };
  qcScreen = 'results';
  qcRender();
}

function qcRenderResults() {
  const body = document.getElementById('qc-body');
  const j = qcLoad();
  const u = qcSes.summary;
  body.innerHTML =
    '<div class="qc-card">' +
      '<div class="qc-res-emoji">' + (u.avg >= QC_MASTER ? '🌟' : u.avg >= QC_PASS ? '🎉' : '📖') + '</div>' +
      '<div class="qc-res-title">Session complete, ' + j.name + '!</div>' +
      '<div class="qc-mom-row">' +
        '<div class="qc-mom"><span class="qc-mom-n">' + u.avg + '%</span><span class="qc-mom-l">avg score</span></div>' +
        '<div class="qc-mom"><span class="qc-mom-n">' + u.passed.length + '</span><span class="qc-mom-l">lines passed</span></div>' +
        '<div class="qc-mom"><span class="qc-mom-n">' + (u.failed.length ? u.failed.length : 0) + '</span><span class="qc-mom-l">to revise</span></div>' +
      '</div>' +
      '<div class="qc-coach-mini">' + u.why + '</div>' +
      (u.failed.length ? '<div class="qc-desc">Verses ' + u.failed.join(', ') + ' will repeat in tomorrow\u2019s revision until clean.</div>' : '') +
      (j.hw && !j.hw.complete ? '<div class="qc-desc">📝 Homework: recite verses ' + j.hw.from + '–' + j.hw.to + ' five times today.</div>' : '') +
      '<div class="qc-tomorrow">Tomorrow: <b>' + u.lines + ' new line' + (u.lines > 1 ? 's' : '') + '</b></div>' +
      '<button class="qc-go" onclick="qcSes=null; qcScreen=\'dash\'; qcRender();">Back to Companion →</button>' +
    '</div>';
}

// ── Quiz engine ─────────────────────────────────────────────
function qcStartQuiz() {
  const j = qcLoad();
  if (!j) { toast('Start a journey first'); qcScreen = 'dash'; qcRender(); return; }
  const pool = qcPassedVerses(j);
  if (pool.length < 1) { toast('Pass at least one line first — quiz needs learned verses'); qcScreen = 'dash'; qcRender(); return; }
  const qs = [];
  const used = {};
  while (qs.length < Math.min(5, pool.length * 2)) {
    const n = pool[Math.floor(Math.random() * pool.length)];
    const words = qcVerseText(j, n).split(/\s+/).filter(function(w){ return w.length > 1; });
    if (!words.length || used[n]) continue;
    used[n] = 1;
    const type = Math.random() < 0.5 ? 'next' : 'fill';
    const wIdx = type === 'next' ? words.length - 1 : Math.floor(Math.random() * words.length);
    const answer = words[wIdx];
    // distractors from other verses
    const others = [];
    for (let m = j.fromV; m <= j.toV && others.length < 6; m++) {
      if (m === n) continue;
      const ow = qcVerseText(j, m).split(/\s+/).filter(function(w){ return w.length > 1 && w !== answer; });
      if (ow.length) others.push(ow[Math.floor(Math.random() * ow.length)]);
    }
    const opts = [answer];
    while (opts.length < Math.min(4, Math.max(2, others.length + 1)) && others.length) {
      const c = others.splice(Math.floor(Math.random() * others.length), 1)[0];
      if (opts.indexOf(c) < 0) opts.push(c);
    }
    for (let i = opts.length - 1; i > 0; i--) { const r = Math.floor(Math.random() * (i + 1)); const t = opts[i]; opts[i] = opts[r]; opts[r] = t; }
    const before = words.slice(0, wIdx).join(' ');
    const after = words.slice(wIdx + 1).join(' ');
    qs.push({ v: n, type: type, answer: answer, opts: opts, before: before, after: after });
  }
  qcQuiz = { qs: qs, i: 0, score: 0, picked: null };
  qcScreen = 'quiz';
  qcRender();
}

function qcRenderQuiz() {
  const body = document.getElementById('qc-body');
  const j = qcLoad();
  if (!qcQuiz) { qcScreen = 'dash'; qcRender(); return; }
  if (qcQuiz.i >= qcQuiz.qs.length) {
    const total = qcQuiz.qs.length;
    const score = qcQuiz.score;
    j.quizzes = j.quizzes || [];
    j.quizzes.push({ d: qcToday(), score: score, total: total });
    if (score === total && j.badges.indexOf('Quiz Master') < 0) j.badges.push('Quiz Master');
    qcSave(j);
    body.innerHTML =
      '<div class="qc-card"><div class="qc-res-emoji">' + (score === total ? '🌟' : score * 2 >= total ? '🎉' : '📖') + '</div>' +
      '<div class="qc-res-title">Quiz: ' + score + '/' + total + '</div>' +
      '<div class="qc-coach-mini">' + (score === total ? 'Perfect — your memory is strong!' : score * 2 >= total ? 'Good work — review the missed words.' : 'Keep reciting daily — it will stick.') + '</div>' +
      '<button class="qc-go" onclick="qcScreen=\'dash\'; qcQuiz=null; qcRender();">Back to Companion →</button></div>';
    return;
  }
  const q = qcQuiz.qs[qcQuiz.i];
  const picked = qcQuiz.picked;
  body.innerHTML =
    '<div class="qc-hero"><div class="qc-hero-top"><span class="qc-hello">🧩 Quiz — ' + qcSurah(j).name + '</span><span class="qc-day-pill">' + (qcQuiz.i + 1) + '/' + qcQuiz.qs.length + '</span></div></div>' +
    '<div class="qc-card">' +
      '<div class="qc-desc" style="margin-bottom:12px">' + (q.type === 'next' ? 'Which word completes verse ' + q.v + '?' : 'Which word is missing in verse ' + q.v + '?') + '</div>' +
      '<div class="qc-big-ar" dir="rtl">' + q.before + ' <span class="qc-blank">' + (picked ? q.answer : '…') + '</span>' + (q.after ? ' ' + q.after : '') + '</div>' +
      '<div class="qc-opts">' +
        q.opts.map(function(o, i) {
          let cls = 'qc-opt';
          if (picked !== null) {
            if (o === q.answer) cls += ' good';
            else if (i === picked) cls += ' bad';
          }
          return '<div class="' + cls + '" onclick="qcPick(' + i + ')">' + o + '</div>';
        }).join('') +
      '</div>' +
      (picked !== null
        ? '<button class="qc-go" onclick="qcQuizNext()">Next →</button>'
        : '') +
    '</div>';
}
function qcPick(i) { if (qcQuiz.picked === null) { qcQuiz.picked = i; if (qcQuiz.qs[qcQuiz.i].opts[i] === qcQuiz.qs[qcQuiz.i].answer) qcQuiz.score++; qcRender(); } }
function qcQuizNext() { qcQuiz.picked = null; qcQuiz.i++; qcRender(); }

// ═══════════════════════════════════════════════════════════
// ALPHABET ACADEMY — letters, makhraj, harakat, letter quiz
// ═══════════════════════════════════════════════════════════
const QC_ALPHA = [
  { l:'ا', n:'Alif', m:'Glottis — lowest part of the throat', d:'A straight standing letter. It often carries a hamza (أ) or lengthens a vowel.', f:['ا','ا','ا','ا'], w:'اَلله', tip:'Alif as a long vowel: hold the fatha sound for 2 counts.' },
  { l:'ب', n:'Ba', m:'Lips — press both lips together', d:'The first letter of the Quran (Bismillah). Full contact of the lips, then a clean pop.', f:['ب','بـ','ـبـ','ـب'], w:'بِسْمِ', tip:'Flatten the lips; say it with a light, crisp voice.' },
  { l:'ت', n:'Ta', m:'Tongue tip against the upper gum ridge', d:'Like English T but with the tongue tip a little further back on the ridge.', f:['ت','تـ','ـتـ','ـت'], w:'تَبَارَكَ', tip:'No aspiration: pure, short and dry.' },
  { l:'ث', n:'Tha', m:'Tongue tip between the front teeth', d:'Like "th" in "think". Let the air flow over the tongue tip.', f:['ث','ثـ','ـثـ','ـث'], w:'ثَلَاثَةٍ', tip:'Do not press hard — gentle flow, soft contact.' },
  { l:'ج', n:'Jim', m:'Middle of tongue against the palate', d:'Like English J in "jam", with the middle of the tongue rising to the roof of the mouth.', f:['ج','جـ','ـجـ','ـج'], w:'جَنَّةٍ', tip:'Complete contact, then release with voice.' },
  { l:'ح', n:'Ha', m:'Middle of the throat', d:'A breathy, warm H from deep in the throat. Different from the lighter هـ.', f:['ح','حـ','ـحـ','ـح'], w:'حَسَنَ', tip:'Open the throat wide; it should feel like warm air escaping.' },
  { l:'خ', n:'Kha', m:'Upper part of the throat', d:'Like the Scottish "ch" in "loch". A scraping sound from the top of the throat.', f:['خ','خـ','ـخـ','ـخ'], w:'خَالِدِينَ', tip:'Raise the back of the tongue slightly toward the soft palate.' },
  { l:'د', n:'Dal', m:'Tongue tip on the upper gum', d:'Like English D but further back, flat and short.', f:['د','د','ـد','ـد'], w:'دِينٍ', tip:'Non-connector: it never joins to the next letter.' },
  { l:'ذ', n:'Dhal', m:'Tongue tip on the upper gum, with voice', d:'Like "th" in "this" but with the tongue tip touching the gum ridge.', f:['ذ','ذ','ـذ','ـذ'], w:'ذِكْرٍ', tip:'Buzzing voice; the tongue tip vibrates lightly.' },
  { l:'ر', n:'Ra', m:'Tip of the tongue on the gum ridge', d:'One light tap of the tongue tip — never a full English R roll.', f:['ر','ر','ـر','ـر'], w:'رَبِّ', tip:'One bounce only. Heavy (رّ) in words like الرحمن.' },
  { l:'ز', n:'Zay', m:'Tongue tip near the teeth gaps', d:'Like English Z with the tongue tip close to the upper teeth.', f:['ز','ز','ـز','ـز'], w:'زَكَاةٍ', tip:'Continuous buzzing; do not stop the airflow.' },
  { l:'س', n:'Sin', m:'Air through the teeth gaps', d:'A clean hiss, like a long S. Teeth nearly closed.', f:['س','سـ','ـسـ','ـس'], w:'سَلَامٌ', tip:'Keep the hiss flowing evenly from start to end.' },
  { l:'ش', n:'Shin', m:'Middle of tongue, spread airflow', d:'Like English SH, with the tongue middle raised and air spread wide.', f:['ش','شـ','ـشـ','ـش'], w:'شَهْرٍ', tip:'Round the lips slightly and spread the sound.' },
  { l:'ص', n:'Sad', m:'Side of the tongue, heavy', d:'The heavy sister of س. Full mouth, rich sound — the tongue sides rise.', f:['ص','صـ','ـصـ','ـص'], w:'صَلَاةٍ', tip:'Fill the mouth with echo (tafkheem) — big, grand sound.' },
  { l:'ض', n:'Dad', m:'Side of the tongue against the upper molars', d:'The hardest letter in Arabic — a heavy D pressing the tongue side to the molars. The language is named "the language of ض".', f:['ض','ضـ','ـضـ','ـض'], w:'ضِيَاءً', tip:'Push the tongue edge against the top molars and release heavily.' },
  { l:'ط', n:'Ta (heavy)', m:'Tongue tip on the gum, emphatic', d:'The heavy sister of ت — deep and resonant from an empty mouth.', f:['ط','طـ','ـطـ','ـط'], w:'طُورٍ', tip:'Flat tongue, full echo, short and strong.' },
  { l:'ظ', n:'Dha (heavy)', m:'Tongue tip on the gum, emphatic with voice', d:'The heavy sister of ذ — deep buzzing TH.', f:['ظ','ظـ','ـظـ','ـظ'], w:'ظِلَٰلٍ', tip:'Heavy mouth echo plus continuous voice.' },
  { l:'ع', n:'Ayn', m:'Middle of the throat, voiced', d:'A deep, constricted sound from the throat — the twin of ح but with voice.', f:['ع','عـ','ـعـ','ـع'], w:'عِلْمٍ', tip:'Squeeze the throat gently while voicing — it should feel alive.' },
  { l:'غ', n:'Ghayn', m:'Upper throat, voiced', d:'The voiced twin of خ — like a French R from the top of the throat.', f:['غ','غـ','ـغـ','ـغ'], w:'غَيْبٍ', tip:'Scrape softly at the top of the throat with voice.' },
  { l:'ف', n:'Fa', m:'Lower lip against the upper front teeth', d:'Like English F — inner lower lip touches the upper teeth edge.', f:['ف','فـ','ـفـ','ـف'], w:'فَتْحٍ', tip:'Light contact; do not bite the lip hard.' },
  { l:'ق', n:'Qaf', m:'Back of the tongue against the uvula', d:'A deep K made far back in the mouth. The tongue back hits the softest part.', f:['ق','قـ','ـقـ','ـق'], w:'قُرْآنٍ', tip:'Say it from the very back — hollow, echoing mouth.' },
  { l:'ك', n:'Kaf', m:'Back of the tongue, further forward than ق', d:'Like English K, lighter and higher than deep ق.', f:['ك','كـ','ـكـ','ـك'], w:'كِتَابٍ', tip:'Crisp and light; keep ق and ك clearly different.' },
  { l:'ل', n:'Lam', m:'Tongue tip on the gum, sides open', d:'Like English L — tip up, air flows around the sides.', f:['ل','لـ','ـلـ','ـل'], w:'لَيْلٍ', tip:'Heavy in الله (Allah) when followed by a fatha or damma; light with kasra.' },
  { l:'م', n:'Mim', m:'Both lips closed', d:'Like English M with a humming nasal close.', f:['م','مـ','ـمـ','ـم'], w:'مُحَمَّدٍ', tip:'Keep the hum going; in idgham (hidden noon) it becomes a light M.' },
  { l:'ن', n:'Nun', m:'Tongue tip on the gum, nasal flow', d:'Like English N, but the sound travels through the nose.', f:['ن','نـ','ـنـ','ـن'], w:'نُورٍ', tip:'Full ghunna (nasalisation) when it carries no vowel.' },
  { l:'ه', n:'Ha (light)', m:'Lower throat, light breath', d:'The light H — like a soft exhale from the bottom of the throat.', f:['ه','هـ','ـهـ','ـه'], w:'هُدًى', tip:'Much lighter than deep ح — keep them distinct.' },
  { l:'و', n:'Waw', m:'Rounded lips', d:'Like English W as a consonant, or a long "oo" as a vowel.', f:['و','و','ـو','ـو'], w:'وَلِيٍّ', tip:'Round the lips fully; it never connects forward.' },
  { l:'ي', n:'Ya', m:'Middle of the tongue, palatal', d:'Like English Y as a consonant, or a long "ee" as a vowel.', f:['ي','يـ','ـيـ','ـي'], w:'يَوْمٍ', tip:'Raise the middle of the tongue high for the vowel version.' },
  { l:'ء', n:'Hamza', m:'Glottal stop in the throat', d:'A clean stop of air in the throat — the "catch" before a vowel.', f:['ء','أ','ئ','ؤ'], w:'أَنْعَمْتَ', tip:'A firm stop: close the throat then release sharply.' }
];
const QC_HARAKAT = [
  { s:'بَ', t:'Fatha', d:'A short "a" — a slash above the letter. Read it quick and sharp.' },
  { s:'بِ', t:'Kasra', d:'A short "i" — a slash below the letter.' },
  { s:'بُ', t:'Damma', d:'A short "u" — a tiny waw above the letter.' },
  { s:'بْ', t:'Sukun', d:'No vowel — a small circle. Stop the letter clean.' },
  { s:'بّ', t:'Shadda', d:'Doubling — the letter is held for two. Like saying "bb".' },
  { s:'بَا', t:'Madd (Alif)', d:'Long vowel — hold the fatha for 2 counts (or 4–6 in madd letters).' },
  { s:'بَٰ', t:'Maddah (dagger alif)', d:'A stretched fatha marked with a small vertical stroke.' },
  { s:'بٍ', t:'Tanween Kasratan', d:'Double kasra = "in" sound at the end.' },
  { s:'بٌ', t:'Tanween Dammatan', d:'Double damma = "un" sound at the end.' },
  { s:'بً', t:'Tanween Fathatan', d:'Double fatha = "an" sound at the end.' }
];

function qcAlphaInit() {
  qcAlphaOpen = -1;
  qcAlphaQ = null;
  qcAlphaRender();
}
function qcAlphaRender() {
  const body = document.getElementById('qcalpha-body');
  if (!body) return;
  if (qcAlphaQ) { qcAlphaQRender(); return; }
  if (qcAlphaOpen >= 0) { qcAlphaDetail(); return; }
  let letters = '';
  QC_ALPHA.forEach(function(a, i) {
    letters += '<div class="qa-l" onclick="qcAlphaOpen=' + i + '; qcAlphaRender()"><span class="qa-l-glyph">' + a.l + '</span><span class="qa-l-n">' + a.n + '</span></div>';
  });
  let har = '';
  QC_HARAKAT.forEach(function(h) {
    har += '<div class="qa-h"><span class="qa-h-s">' + h.s + '</span><div><div class="qa-h-t">' + h.t + '</div><div class="qa-h-d">' + h.d + '</div></div></div>';
  });
  body.innerHTML =
    '<div class="qc-card"><div class="qc-coach">🔤 <b>Alphabet Academy</b><br>Master every letter\u2019s makhraj (where it comes from in your mouth), its joined forms, and the harakat. Tap any letter.</div></div>' +
    '<div class="qa-grid">' + letters + '</div>' +
    '<div class="qc-card" style="margin-top:14px"><div class="qc-sec">✨ Harakat — the vowel marks</div>' + har + '</div>' +
    '<div class="qc-card"><button class="qc-go" onclick="qcAlphaQuizStart()">🎯 Take the Makhraj Quiz</button></div>' +
    '<div style="height:30px"></div>';
}
function qcAlphaDetail() {
  const body = document.getElementById('qcalpha-body');
  const a = QC_ALPHA[qcAlphaOpen];
  body.innerHTML =
    '<div class="qc-card qc-verse-card">' +
      '<div class="qa-big">' + a.l + '</div>' +
      '<div class="qa-n">' + a.n + '</div>' +
      '<div class="qa-forms">' +
        '<div class="qa-form"><span class="qa-f-g">' + a.f[0] + '</span><span class="qa-f-l">alone</span></div>' +
        '<div class="qa-form"><span class="qa-f-g">' + a.f[1] + '</span><span class="qa-f-l">start</span></div>' +
        '<div class="qa-form"><span class="qa-f-g">' + a.f[2] + '</span><span class="qa-f-l">middle</span></div>' +
        '<div class="qa-form"><span class="qa-f-g">' + a.f[3] + '</span><span class="qa-f-l">end</span></div>' +
      '</div>' +
      '<div class="qa-makh"><b>📍 Makhraj:</b> ' + a.m + '</div>' +
      '<div class="qa-desc">' + a.d + '</div>' +
      '<div class="qa-makh"><b>💡 Tip:</b> ' + a.tip + '</div>' +
      '<div class="qa-makh"><b>Quranic word:</b> <span class="qa-word">' + a.w + '</span></div>' +
      '<div class="qc-verse-btns">' +
        '<button class="qc-lite" onclick="qcAlphaOpen=-1; qcAlphaRender()">← All letters</button>' +
        '<button class="qc-lite" onclick="qcAlphaOpen=' + (qcAlphaOpen < QC_ALPHA.length - 1 ? qcAlphaOpen + 1 : 0) + '; qcAlphaRender()">Next ' + (qcAlphaOpen < QC_ALPHA.length - 1 ? QC_ALPHA[qcAlphaOpen+1].l : QC_ALPHA[0].l) + ' →</button>' +
      '</div>' +
    '</div>';
}
function qcAlphaQuizStart() {
  const order = QC_ALPHA.map(function(_, i){ return i; });
  for (let i = order.length - 1; i > 0; i--) { const r = Math.floor(Math.random() * (i + 1)); const t = order[i]; order[i] = order[r]; order[r] = t; }
  qcAlphaQ = { order: order.slice(0, 6), i: 0, score: 0, picked: null };
  qcAlphaRender();
}
function qcAlphaQRender() {
  const body = document.getElementById('qcalpha-body');
  const q = qcAlphaQ;
  if (q.i >= q.order.length) {
    body.innerHTML =
      '<div class="qc-card"><div class="qc-res-emoji">' + (q.score === q.order.length ? '🌟' : '📖') + '</div>' +
      '<div class="qc-res-title">Makhraj Quiz: ' + q.score + '/' + q.order.length + '</div>' +
      '<div class="qc-coach-mini">' + (q.score === q.order.length ? 'Perfect! You know your letters deeply.' : 'Review the letters you missed and try again.') + '</div>' +
      '<button class="qc-go" onclick="qcAlphaQ=null; qcAlphaRender()">Back to Academy →</button></div>';
    return;
  }
  const a = QC_ALPHA[q.order[q.i]];
  // options: correct makhraj + 3 random others
  const opts = [a.m];
  while (opts.length < 4) {
    const c = QC_ALPHA[Math.floor(Math.random() * QC_ALPHA.length)].m;
    if (opts.indexOf(c) < 0) opts.push(c);
  }
  for (let i = opts.length - 1; i > 0; i--) { const r = Math.floor(Math.random() * (i + 1)); const t = opts[i]; opts[i] = opts[r]; opts[r] = t; }
  q.opts = opts;
  body.innerHTML =
    '<div class="qc-hero"><div class="qc-hero-top"><span class="qc-hello">🎯 Makhraj Quiz</span><span class="qc-day-pill">' + (q.i + 1) + '/' + q.order.length + '</span></div></div>' +
    '<div class="qc-card">' +
      '<div class="qa-big">' + a.l + '</div>' +
      '<div class="qa-n">' + a.n + ' — where does it come from?</div>' +
      '<div class="qc-opts">' +
        opts.map(function(o, i) {
          let cls = 'qc-opt qc-opt-en';
          if (q.picked !== null) {
            if (o === a.m) cls += ' good';
            else if (i === q.picked) cls += ' bad';
          }
          return '<div class="' + cls + '" onclick="qcAlphaPick(' + i + ')">' + o + '</div>';
        }).join('') +
      '</div>' +
      (q.picked !== null ? '<button class="qc-go" onclick="qcAlphaNext()">Next →</button>' : '') +
    '</div>';
}
function qcAlphaPick(i) { const q = qcAlphaQ; if (q.picked !== null) return; q.picked = i; if (q.opts[i] === QC_ALPHA[q.order[q.i]].m) q.score++; qcAlphaRender(); }
function qcAlphaNext() { qcAlphaQ.picked = null; qcAlphaQ.i++; qcAlphaRender(); }
