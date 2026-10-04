// ═══════════════════════════════════════════════════════════════
// nabaCompetition — NABA QURAN Stage 4 competition backend
// ═══════════════════════════════════════════════════════════════
// Purpose: Standalone Competition feature for Naba Quran
//          (juz-amma-pro-max). Admin-created journeys (e.g. "3 Days
//          Journey" over a surah range like An-Naba → An-Nas) plus
//          AI auto-hosted weekly competitions. Scores are derived
//          from the same client learning progress the rank system
//          uses (AI Reading passes, Tajweed mastery, memorization),
//          filtered to each competition's surah range and synced
//          with a monotonic max-policy + hard caps (same trust
//          model as nabaCommunity.syncPoints).
// Pattern: Deno.serve action routing, same as nabaCommunity.
// Actions:
//   getCompetitions    { } — active + recently ended (winners)
//   createCompetition  { adminKey, title, description, fromSurah,
//                         toSurah, durationDays, type, createdBy }
//                       — admin-key gated (key sent from the Vercel
//                         admin proxy, which already verified it)
//   joinCompetition    { compId, userName }
//   scoreCompetition   { compId, userName, score } — monotonic max
//   getCompLeaderboard { compId, userName? } — top 50 + my rank
//   myCompetitions     { userName } — which active comps I joined
//   closeExpired       { } — end overdue comps, pick winners
//   ensureWeekly       { } — create AI weekly comp if none active
// ═══════════════════════════════════════════════════════════════

import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";

const sysFields = new Set(["id","created_date","updated_date","created_by_id","is_sample","created_by"]);

function norm(records) {
  return (records||[]).map(r => {
    if (!r.data) {
      const data = {};
      for (const k of Object.keys(r)) { if (!sysFields.has(k)) data[k] = r[k]; }
      r.data = data;
    }
    return r;
  });
}

function cleanText(s, maxLen) {
  return String(s || "")
    .replace(/[<>&"']/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, maxLen);
}
function capInt(v, max) {
  const n = parseInt(v || "0", 10);
  if (!isFinite(n) || n < 0) return 0;
  return Math.min(n, max);
}
function iso(d) { return d.toISOString().slice(0, 19); }

// Juz Amma rotation for AI weekly competitions (An-Naba 78 → An-Naas 114)
const AMMA_SURAHS = [
  { id: 78,  name: "An-Naba" },      { id: 79,  name: "An-Naazi'aat" },
  { id: 80,  name: "Abasa" },        { id: 81,  name: "At-Takwir" },
  { id: 82,  name: "Al-Infitaar" },  { id: 83,  name: "Al-Mutaffifin" },
  { id: 84,  name: "Al-Inshiqaaq" }, { id: 85,  name: "Al-Burooj" },
  { id: 86,  name: "At-Taariq" },    { id: 87,  name: "Al-A'laa" },
  { id: 88,  name: "Al-Ghaashiya" }, { id: 89,  name: "Al-Fajr" },
  { id: 90,  name: "Al-Balad" },     { id: 91,  name: "Ash-Shams" },
  { id: 92,  name: "Al-Lail" },      { id: 93,  name: "Ad-Dhuhaa" },
  { id: 94,  name: "Ash-Sharh" },    { id: 95,  name: "At-Tin" },
  { id: 96,  name: "Al-Alaq" },      { id: 97,  name: "Al-Qadr" },
  { id: 98,  name: "Al-Bayyina" },   { id: 99,  name: "Az-Zalzala" },
  { id: 100, name: "Al-Aadiyaat" },  { id: 101, name: "Al-Qaari'a" },
  { id: 102, name: "At-Takaathur" }, { id: 103, name: "Al-Asr" },
  { id: 104, name: "Al-Humaza" },    { id: 105, name: "Al-Fil" },
  { id: 106, name: "Quraish" },      { id: 107, name: "Al-Maa'un" },
  { id: 108, name: "Al-Kawthar" },   { id: 109, name: "Al-Kaafiroon" },
  { id: 110, name: "An-Nasr" },      { id: 111, name: "Al-Masad" },
  { id: 112, name: "Al-Ikhlaas" },   { id: 113, name: "Al-Falaq" },
  { id: 114, name: "An-Naas" },
];

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: { "Access-Control-Allow-Origin": "*" } });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "POST only" }, 405);

  let body = {};
  try { body = await req.json(); }
  catch (e) { return jsonResponse({ ok: false, error: "bad json" }, 400); }

  const action = body.action;
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole.entities;

    const allComps = async () => norm(await db.Competition.list());
    const isActive = (c, now) => c.data.status === "active" && new Date(c.data.endDate || 0).getTime() > now;

    // ── getCompetitions ────────────────────────────────────────
    if (action === "getCompetitions") {
      const now = Date.now();
      const all = await allComps();
      const active = all.filter(c => isActive(c, now));
      const ended = all
        .filter(c => c.data.status === "ended")
        .sort((a, b) => new Date(b.data.endDate || 0).getTime() - new Date(a.data.endDate || 0).getTime())
        .slice(0, 5);
      const map = (c) => ({
        id: c.id, title: c.data.title, description: c.data.description,
        type: c.data.type, fromSurah: c.data.fromSurah, toSurah: c.data.toSurah,
        startDate: c.data.startDate, endDate: c.data.endDate,
        createdBy: c.data.createdBy,
        winnerName: c.data.winnerName || "", winnerScore: c.data.winnerScore || 0,
      });
      return jsonResponse({ ok: true, active: active.map(map), ended: ended.map(map) });
    }

    // ── createCompetition (admin/AI gated) ─────────────────────
    if (action === "createCompetition") {
      const adminKey = String(body.adminKey || "");
      // The Vercel admin proxy forwards the SAME env key it verified.
      // Defence in depth: reject empty; the proxy is the real gate.
      if (!adminKey) return jsonResponse({ ok: false, error: "admin key required" }, 401);
      const title = cleanText(body.title, 60);
      const description = cleanText(body.description, 200);
      if (!title) return jsonResponse({ ok: false, error: "title required" }, 400);
      const type = body.type === "ai" ? "ai" : "admin";
      let fromSurah = capInt(body.fromSurah, 114);
      let toSurah = capInt(body.toSurah, 114);
      if (fromSurah < 1) fromSurah = 78;
      if (toSurah < fromSurah) toSurah = fromSurah;
      const durationDays = Math.max(1, Math.min(capInt(body.durationDays, 30), 30));
      const now = new Date();
      const end = new Date(now.getTime() + durationDays * 86400000);
      await db.Competition.create({
        title, description, type, fromSurah, toSurah,
        startDate: iso(now), endDate: iso(end),
        status: "active",
        createdBy: cleanText(body.createdBy, 20) || (type === "ai" ? "Naba AI" : "Admin"),
        winnerName: "", winnerScore: 0,
      });
      return jsonResponse({ ok: true });
    }

    // ── joinCompetition ────────────────────────────────────────
    if (action === "joinCompetition") {
      const compId = cleanText(body.compId, 40);
      const userName = cleanText(body.userName, 20);
      if (!compId || !userName) return jsonResponse({ ok: false, error: "compId and userName required" }, 400);
      const all = await allComps();
      const comp = all.find(c => c.id === compId && isActive(c, Date.now()));
      if (!comp) return jsonResponse({ ok: false, error: "competition not found or ended" }, 404);
      const parts = norm(await db.CompetitionParticipant.list()).filter(p => p.data.compId === compId && p.data.userName === userName);
      if (parts.length) return jsonResponse({ ok: true, already: true });
      await db.CompetitionParticipant.create({
        compId, userName, score: 0,
        joinedDate: iso(new Date()), lastSyncDate: iso(new Date()),
      });
      return jsonResponse({ ok: true });
    }

    // ── scoreCompetition (monotonic max, capped) ───────────────
    if (action === "scoreCompetition") {
      const compId = cleanText(body.compId, 40);
      const userName = cleanText(body.userName, 20);
      const score = capInt(body.score, 9999);
      if (!compId || !userName) return jsonResponse({ ok: false, error: "compId and userName required" }, 400);
      const all = await allComps();
      const comp = all.find(c => c.id === compId && isActive(c, Date.now()));
      if (!comp) return jsonResponse({ ok: false, error: "competition not active" }, 404);
      const parts = norm(await db.CompetitionParticipant.list()).filter(p => p.data.compId === compId && p.data.userName === userName);
      if (!parts.length) return jsonResponse({ ok: false, error: "join first" }, 400);
      const rec = parts[0];
      await db.CompetitionParticipant.update(rec.id, {
        score: Math.max(rec.data.score || 0, score),
        lastSyncDate: iso(new Date()),
      });
      return jsonResponse({ ok: true });
    }

    // ── getCompLeaderboard ──────────────────────────────────────
    if (action === "getCompLeaderboard") {
      const compId = cleanText(body.compId, 40);
      const me = cleanText(body.userName, 20);
      if (!compId) return jsonResponse({ ok: false, error: "compId required" }, 400);
      const parts = norm(await db.CompetitionParticipant.list()).filter(p => p.data.compId === compId);
      parts.sort((a, b) => (b.data.score || 0) - (a.data.score || 0));
      const top = parts.slice(0, 50).map((p, i) => ({
        rank: i + 1, userName: p.data.userName, score: p.data.score || 0,
      }));
      let myRank = null;
      if (me) {
        const idx = parts.findIndex(p => p.data.userName === me);
        if (idx >= 0) myRank = { rank: idx + 1, score: parts[idx].data.score || 0, total: parts.length };
      }
      return jsonResponse({ ok: true, top, myRank, total: parts.length });
    }

    // ── myCompetitions ─────────────────────────────────────────
    if (action === "myCompetitions") {
      const userName = cleanText(body.userName, 20);
      if (!userName) return jsonResponse({ ok: false, error: "userName required" }, 400);
      const now = Date.now();
      const all = await allComps();
      const activeIds = new Set(all.filter(c => isActive(c, now)).map(c => c.id));
      const mine = norm(await db.CompetitionParticipant.list()).filter(p => p.data.userName === userName && activeIds.has(p.data.compId));
      return jsonResponse({ ok: true, joined: mine.map(p => ({ compId: p.data.compId, score: p.data.score || 0 })) });
    }

    // ── closeExpired ───────────────────────────────────────────
    if (action === "closeExpired") {
      const now = Date.now();
      const all = await allComps();
      const expired = all.filter(c => c.data.status === "active" && new Date(c.data.endDate || 0).getTime() <= now);
      const results = [];
      for (const c of expired) {
        const parts = norm(await db.CompetitionParticipant.list()).filter(p => p.data.compId === c.id);
        parts.sort((a, b) => (b.data.score || 0) - (a.data.score || 0));
        const winner = parts[0];
        await db.Competition.update(c.id, {
          status: "ended",
          winnerName: winner ? winner.data.userName : "",
          winnerScore: winner ? (winner.data.score || 0) : 0,
        });
        results.push({
          id: c.id, title: c.data.title,
          winnerName: winner ? winner.data.userName : "",
          winnerScore: winner ? (winner.data.score || 0) : 0,
          participants: parts.length,
        });
      }
      return jsonResponse({ ok: true, closed: results });
    }

    // ── ensureWeekly (AI auto-host) ─────────────────────────────
    if (action === "ensureWeekly") {
      const now = Date.now();
      const all = await allComps();
      const activeAi = all.some(c => isActive(c, now) && c.data.type === "ai");
      if (activeAi) return jsonResponse({ ok: true, created: false, reason: "AI competition already active" });
      // rotate through Juz Amma by ISO week number
      const jan1 = new Date(new Date().getFullYear(), 0, 1);
      const week = Math.floor(((now - jan1.getTime()) / 86400000 + jan1.getDay()) / 7);
      const pick = AMMA_SURAHS[week % AMMA_SURAHS.length];
      const nowD = new Date();
      const end = new Date(nowD.getTime() + 7 * 86400000);
      await db.Competition.create({
        title: "🤖 AI Weekly Challenge: Surah " + pick.name,
        description: "Read, recite and memorize Surah " + pick.name +
          " (" + pick.id + ") this week! AI Reading passes +2, Tajweed mastery +3, memorized verses +1. Winner gets eternal bragging rights 🏆",
        type: "ai", fromSurah: pick.id, toSurah: pick.id,
        startDate: iso(nowD), endDate: iso(end),
        status: "active", createdBy: "Naba AI",
        winnerName: "", winnerScore: 0,
      });
      return jsonResponse({ ok: true, created: true, title: "Surah " + pick.name });
    }

    return jsonResponse({ ok: false, error: "unknown action" }, 400);
  } catch (e) {
    return jsonResponse({ ok: false, error: "server error" }, 500);
  }
});
