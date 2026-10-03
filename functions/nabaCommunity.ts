// ═══════════════════════════════════════════════════════════════
// nabaCommunity — NABA QURAN Stage 3 community backend
// ═══════════════════════════════════════════════════════════════
// Purpose: Global leaderboard (server-synced learner points) +
//          community testimony wall for Naba Quran (juz-amma-pro-max).
// Pattern: Deno.serve action routing, same as groupVoiceHub (elara app).
// Hosted on the Solas app backend, proxied same-origin via /api/naba.
// Actions:
//   syncPoints     { userName, points, ai, tj, mem, streak } — upsert, max-points policy
//   getLeaderboard { userName? } — top 50 by points + your rank
//   addTestimony   { userName, text, points } — 1 per name per 24h
//   listTestimonies { } — latest 50
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

// Strip injection chars from names/testimony text; cap lengths hard.
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

    // ── syncPoints ────────────────────────────────────────────
    if (action === "syncPoints") {
      const userName = cleanText(body.userName, 20);
      if (!userName) return jsonResponse({ ok: false, error: "name required" }, 400);
      const incoming = {
        points: capInt(body.points, 9999),
        ai: capInt(body.ai, 3000),
        tj: capInt(body.tj, 2000),
        mem: capInt(body.mem, 6000),
        streak: capInt(body.streak, 400),
      };
      const existing = norm(await db.LearnerProfile.list()).filter(r => r.data.userName === userName);
      if (existing.length) {
        const rec = existing[0];
        // max policy: points only ever grow — a tampered client cannot
        // lower anyone's standing; upward values are capped above.
        await db.LearnerProfile.update(rec.id, {
          userName,
          points: Math.max(rec.data.points || 0, incoming.points),
          ai: Math.max(rec.data.ai || 0, incoming.ai),
          tj: Math.max(rec.data.tj || 0, incoming.tj),
          mem: Math.max(rec.data.mem || 0, incoming.mem),
          streak: Math.max(rec.data.streak || 0, incoming.streak),
        });
        return jsonResponse({ ok: true });
      }
      await db.LearnerProfile.create({ ...incoming, userName });
      return jsonResponse({ ok: true });
    }

    // ── getLeaderboard ────────────────────────────────────────
    if (action === "getLeaderboard") {
      const me = cleanText(body.userName, 20);
      const all = norm(await db.LearnerProfile.list());
      all.sort((a, b) => (b.data.points || 0) - (a.data.points || 0));
      const top = all.slice(0, 50).map((r, i) => ({
        rank: i + 1,
        userName: r.data.userName,
        points: r.data.points || 0,
        streak: r.data.streak || 0,
      }));
      let myRank = null;
      if (me) {
        const idx = all.findIndex(r => r.data.userName === me);
        if (idx >= 0) myRank = { rank: idx + 1, points: all[idx].data.points || 0, total: all.length };
      }
      return jsonResponse({ ok: true, top, myRank });
    }

    // ── addTestimony ──────────────────────────────────────────
    if (action === "addTestimony") {
      const userName = cleanText(body.userName, 20);
      const text = cleanText(body.text, 300);
      if (!userName || text.length < 5) return jsonResponse({ ok: false, error: "name and a longer testimony required" }, 400);
      const points = capInt(body.points, 9999);
      // anti-spam: one testimony per name per 24 hours
      const mine = norm(await db.Testimony.list()).filter(r => r.data.userName === userName);
      if (mine.length) {
        let newest = 0;
        for (const t of mine) newest = Math.max(newest, new Date(t.created_date || 0).getTime());
        if (Date.now() - newest < 24 * 3600 * 1000) {
          return jsonResponse({ ok: false, error: "You already shared recently — come back tomorrow, InshaAllah!" });
        }
      }
      await db.Testimony.create({ userName, text, points });
      return jsonResponse({ ok: true });
    }

    // ── listTestimonies ───────────────────────────────────────
    if (action === "listTestimonies") {
      const all = norm(await db.Testimony.list());
      all.sort((a, b) => new Date(b.created_date || 0).getTime() - new Date(a.created_date || 0).getTime());
      const list = all.slice(0, 50).map(r => ({
        userName: r.data.userName,
        text: r.data.text,
        points: r.data.points || 0,
        date: r.created_date,
      }));
      return jsonResponse({ ok: true, list });
    }

    return jsonResponse({ ok: false, error: "unknown action" }, 400);
  } catch (e) {
    return jsonResponse({ ok: false, error: "server error" }, 500);
  }
});
