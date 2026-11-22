    // ── SIGNAL (offer / answer / ICE) ────────────────────────
    // Entity-backed on purpose: function instances are NOT sticky (measured —
    // consecutive calls returned different `inst` tags), so an in-memory
    // mailbox loses the handshake whenever the two phones land elsewhere.
    // This costs a handful of calls once per connection, not per audio frame.
    if (action === "signal") {
      const to = cleanName(body.to);
      const kind = String(body.kind || "").slice(0, 10);
      let dataStr = "";
      try { dataStr = JSON.stringify(body.data || {}); } catch (e) { dataStr = ""; }
      if (!to || !kind || !dataStr || dataStr.length > 24000) {
        return jsonResponse({ ok: false, error: "Bad signal" });
      }
      const rec = await db.LiveSignal.create({
        room_code: roomCode, from_user: userName, to_user: to,
        kind, data_json: dataStr, sent_at: Date.now(),
      });
      return jsonResponse({ ok: true, id: rec.id, inst: INSTANCE });
    }

    // ── SIGNALS (collect mine, then consume so the table cannot grow) ──
    if (action === "signals") {
      const since = parseInt(body.sinceMs, 10) || 0;
      const found = await db.LiveSignal.filter({ room_code: roomCode }, "sent_at", 60, 0);
      const rows = Array.isArray(found) ? found : (found && found.data ? found.data : []);
      const mine = rows.filter(r =>
        r && r.sent_at > since && r.from_user !== userName &&
        (r.to_user === userName || r.to_user === "*")
      );
      const out = mine.map(r => ({ id: r.id, from: r.from_user, kind: r.kind, data: r.data_json, at: r.sent_at }));
      // consume: delivered messages are deleted so old handshakes never replay
      for (const r of mine) { try { await db.LiveSignal.delete(r.id); } catch (e) {} }
      const lastAt = rows.length ? Math.max.apply(null, rows.map(r => r.sent_at || 0)) : since;
      return jsonResponse({ ok: true, signals: out, lastAt, inst: INSTANCE });
    }

// ═══════════════════════════════════════════════════════════════
// liveHub2 — Live Recitation Classroom, audio kept OFF the entity store
// ═══════════════════════════════════════════════════════════════
// Why this exists (measured, 2026-11-15):
// The old hub did entity reads/writes for every audio chunk and every poll.
// Base44 allows 70 entity calls per 60s *per caller*, and a backend function
// runs under one service identity — so every phone in every room shares that
// single budget. Two phones streaming hit the limit within seconds
// (24 chunks + 27 pulls in 40s produced 9 "Rate limit exceeded" replies, and
// even the closing "end" call was refused).
//
// This hub keeps the live session and the last ~45 seconds of audio in the
// function instance's memory. The hot path (chunk / pull) makes ZERO entity
// calls. Entities are touched only on start, verse change, floor change and
// end — a handful per session instead of dozens per minute, so the room no
// longer competes with chat and room polling.
//
// Memory is per instance. If the instance is recycled the session is
// rehydrated from the LiveSession record on the next pull, and audio resumes
// from the next chunk (sub-second gap) because the reciter keeps streaming
// into whichever instance is serving it.
// ═══════════════════════════════════════════════════════════════

import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";

const INSTANCE = Math.random().toString(36).slice(2, 8);
const MAX_ROOMS = 24;
const MAX_CHUNKS = 45;          // ~45s of audio per room
const CHUNK_TTL_MS = 25000;     // nobody needs audio older than this live
const ROOM_TTL_MS = 180000;     // give up on a room nobody has touched in 3m
const MAX_CHUNK_B64 = 400000;   // ~300KB of PCM; a 1s 16kHz chunk is ~43KB

const rooms = new Map();        // roomCode -> { session, chunks, savedAt, at }

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function cleanCode(v) {
  return String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
}
function cleanName(v) {
  return String(v || "").trim().replace(/[\u0000-\u001f<>]/g, "").slice(0, 24);
}

function pruneExpired() {
  const now = Date.now();
  for (const [code, room] of rooms) {
    room.chunks = room.chunks.filter(c => now - c.t < CHUNK_TTL_MS);
    if (now - room.at > ROOM_TTL_MS) rooms.delete(code);
  }
  while (rooms.size > MAX_ROOMS) {
    let oldest = null, oldestAt = Infinity;
    for (const [code, room] of rooms) if (room.at < oldestAt) { oldest = code; oldestAt = room.at; }
    if (oldest === null) break;
    rooms.delete(oldest);
  }
}

function sessionShape(s) {
  return {
    id: s.id || "",
    room_code: s.room_code,
    host_name: s.host_name,
    floor_user: s.floor_user,
    floor_mode: s.floor_mode,
    status: s.status,
    surah_num: s.surah_num,
    verse: s.verse,
    updated_seq: s.updated_seq || 0,
    events_json: s.events_json || "[]",
  };
}

function touch(room) { room.at = Date.now(); }

/* ── Peer-to-peer signalling (added v174) ───────────────────────
   Audio no longer has to travel through this function once two phones
   connect directly with WebRTC. All that is needed here is a tiny,
   memory-only mailbox for the offer/answer/ICE exchange and a presence
   heartbeat, so the entity store is still untouched. */
function ensureRoomFields(room) {
  if (!Array.isArray(room.signals)) room.signals = [];
  if (typeof room.sigSeq !== "number") room.sigSeq = 0;
  if (!room.peers || typeof room.peers !== "object") room.peers = {};
  return room;
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  let body;
  try { body = await req.json(); } catch { return jsonResponse({ ok: false, error: "Bad request" }, 400); }

  const action = body.action;
  const roomCode = cleanCode(body.roomCode);
  const userName = cleanName(body.userName);
  if (!roomCode) return jsonResponse({ ok: false, error: "roomCode required" });
  if (!userName) return jsonResponse({ ok: false, error: "userName required" });

  pruneExpired();
  const base44 = createClientFromRequest(req);
  const db = base44.asServiceRole.entities;

  try {
    // ── START ────────────────────────────────────────────────
    if (action === "start") {
      const surah = Math.max(1, Math.min(114, parseInt(body.surah, 10) || 78));
      const verse = Math.max(1, parseInt(body.verse, 10) || 1);
      const events = JSON.stringify([{ t: Date.now(), e: "start", by: userName }]);
      const rec = await db.LiveSession.create({
        room_code: roomCode, host_name: userName, floor_user: userName,
        floor_mode: "recite", status: "active", surah_num: surah, verse,
        updated_seq: Date.now(), events_json: events,
      });
      const session = {
        id: rec.id, room_code: roomCode, host_name: userName, floor_user: userName,
        floor_mode: "recite", status: "active", surah_num: surah, verse,
        updated_seq: Date.now(), events_json: events,
      };
      rooms.set(roomCode, { session, chunks: [], lastSeq: 0, at: Date.now(), dirty: 0 });
      return jsonResponse({ ok: true, session: sessionShape(session), inst: INSTANCE });
    }

    let room = rooms.get(roomCode);

    // ── STATE (also rehydrates after an instance recycle) ────
    if (action === "state") {
      if (room && room.session && room.session.status === "active") {
        touch(room);
        return jsonResponse({ ok: true, session: sessionShape(room.session), inst: INSTANCE });
      }
      const found = await db.LiveSession.filter({ room_code: roomCode, status: "active" }, "-created_date", 1, 0);
      const rec = Array.isArray(found) ? found[0] : (found && found.data ? found.data[0] : null);
      if (!rec) return jsonResponse({ ok: true, session: null, inst: INSTANCE });
      const s = {
        id: rec.id, room_code: rec.room_code, host_name: rec.host_name,
        floor_user: rec.floor_user, floor_mode: rec.floor_mode, status: rec.status,
        surah_num: rec.surah_num, verse: rec.verse, updated_seq: rec.updated_seq || 0,
        events_json: rec.events_json || "[]",
      };
      rooms.set(roomCode, { session: s, chunks: [], lastSeq: 0, at: Date.now(), dirty: 0 });
      return jsonResponse({ ok: true, session: sessionShape(s), inst: INSTANCE });
    }

    if (!room || !room.session) {
      // Anything else needs a live session; try one rehydrate, then refuse.
      const found = await db.LiveSession.filter({ room_code: roomCode, status: "active" }, "-created_date", 1, 0);
      const rec = Array.isArray(found) ? found[0] : (found && found.data ? found.data[0] : null);
      if (!rec) return jsonResponse({ ok: true, session: null, end: true, inst: INSTANCE });
      room = {
        session: {
          id: rec.id, room_code: rec.room_code, host_name: rec.host_name,
          floor_user: rec.floor_user, floor_mode: rec.floor_mode, status: rec.status,
          surah_num: rec.surah_num, verse: rec.verse, updated_seq: rec.updated_seq || 0,
          events_json: rec.events_json || "[]",
        },
        chunks: [], lastSeq: 0, at: Date.now(), dirty: 0,
      };
      rooms.set(roomCode, room);
    }
    touch(room);

    if (room.session.status !== "active") {
      return jsonResponse({ ok: true, session: sessionShape(room.session), end: true, inst: INSTANCE });
    }

    // ── CHUNK (memory only, no entity write) ─────────────────
    if (action === "chunk") {
      const b64 = String(body.audioBase64 || "");
      if (!b64 || b64.length > MAX_CHUNK_B64) return jsonResponse({ ok: false, error: "Bad audio chunk" });
      const seq = parseInt(body.seq, 10) || (room.lastSeq + 1);
      const durMs = Math.max(100, Math.min(5000, parseInt(body.durMs, 10) || 1000));
      room.chunks.push({ seq, userName, audioBase64: b64, durMs, t: Date.now() });
      if (room.chunks.length > MAX_CHUNKS) room.chunks.splice(0, room.chunks.length - MAX_CHUNKS);
      if (seq > room.lastSeq) room.lastSeq = seq;
      return jsonResponse({ ok: true, seq, inst: INSTANCE });
    }

    // ── PULL (memory only) ───────────────────────────────────
    if (action === "pull") {
      const since = parseInt(body.sinceSeq, 10) || 0;
      const chunks = room.chunks
        .filter(c => c.seq > since && c.userName !== userName)
        .map(c => ({ seq: c.seq, userName: c.userName, audioBase64: c.audioBase64, durMs: c.durMs }));
      return jsonResponse({
        ok: true, session: sessionShape(room.session), chunks,
        lastSeq: room.lastSeq, inst: INSTANCE,
      });
    }

    // ── PRESENCE (who is in the room right now) ──────────────
    if (action === "hello") {
      ensureRoomFields(room);
      room.peers[userName] = Date.now();
      const nowMs = Date.now();
      const peers = Object.keys(room.peers).filter(n => nowMs - room.peers[n] < 20000);
      return jsonResponse({ ok: true, peers, session: sessionShape(room.session), inst: INSTANCE });
    }

    // ── SIGNAL (offer / answer / ICE, memory only) ───────────
    if (action === "signal") {
      ensureRoomFields(room);
      const to = cleanName(body.to);
      const kind = String(body.kind || "").slice(0, 10);
      let dataStr = "";
      try { dataStr = JSON.stringify(body.data || {}); } catch (e) { dataStr = ""; }
      if (!to || !kind || !dataStr || dataStr.length > 24000) {
        return jsonResponse({ ok: false, error: "Bad signal" });
      }
      room.sigSeq += 1;
      room.signals.push({ id: room.sigSeq, from: userName, to, kind, data: dataStr, t: Date.now() });
      if (room.signals.length > 120) room.signals.splice(0, room.signals.length - 120);
      return jsonResponse({ ok: true, id: room.sigSeq, inst: INSTANCE });
    }

    // ── SIGNALS (collect what was addressed to me) ───────────
    if (action === "signals") {
      ensureRoomFields(room);
      const since = parseInt(body.sinceId, 10) || 0;
      const nowMs = Date.now();
      const out = room.signals
        .filter(s => s.to === userName && s.id > since && nowMs - s.t < 120000)
        .map(s => ({ id: s.id, from: s.from, kind: s.kind, data: s.data }));
      const lastId = room.signals.length ? room.signals[room.signals.length - 1].id : since;
      return jsonResponse({ ok: true, signals: out, lastId, inst: INSTANCE });
    }

    // ── VERSE ────────────────────────────────────────────────
    if (action === "setVerse") {
      const verse = Math.max(1, parseInt(body.verse, 10) || 1);
      room.session.verse = verse;
      room.session.updated_seq = Date.now();
      await db.LiveSession.update(room.session.id, { verse, updated_seq: room.session.updated_seq });
      return jsonResponse({ ok: true, session: sessionShape(room.session), inst: INSTANCE });
    }

    // ── FLOOR ────────────────────────────────────────────────
    if (action === "takeFloor") {
      room.session.floor_mode = "correct";
      room.session.floor_user = userName;
      room.session.updated_seq = Date.now();
      await db.LiveSession.update(room.session.id, {
        floor_mode: "correct", floor_user: userName, updated_seq: room.session.updated_seq,
      });
      return jsonResponse({ ok: true, session: sessionShape(room.session), inst: INSTANCE });
    }
    if (action === "releaseFloor") {
      room.session.floor_mode = "recite";
      room.session.floor_user = room.session.host_name;
      room.session.updated_seq = Date.now();
      await db.LiveSession.update(room.session.id, {
        floor_mode: "recite", floor_user: room.session.host_name, updated_seq: room.session.updated_seq,
      });
      return jsonResponse({ ok: true, session: sessionShape(room.session), inst: INSTANCE });
    }

    // ── END ──────────────────────────────────────────────────
    if (action === "end") {
      room.session.status = "ended";
      room.chunks = [];
      await db.LiveSession.update(room.session.id, { status: "ended", updated_seq: Date.now() });
      rooms.delete(roomCode);
      return jsonResponse({ ok: true, inst: INSTANCE });
    }

    return jsonResponse({ ok: false, error: "Unknown action: " + action });
  } catch (e) {
    console.error("liveHub2 error:", e);
    return jsonResponse({ ok: false, error: String((e && e.message) || e) });
  }
});
