// ═══════════════════════════════════════════════════════════════
// groupVoiceHub — NABA QURAN Group Study Backend
// ═══════════════════════════════════════════════════════════════
// Author: Elara (Senior Engineer) for Safa Glass
// Created: 2026-08-22
// Version: 2 (fixed filter issue — list without SDK filter, filter in code)
// Purpose: Full classroom + community study room backend
// All 25 actions documented in docs/BACKEND_SPEC.md
// ═══════════════════════════════════════════════════════════════

import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";

// ── Static Hub Categories ──────────────────────────────────────
const HUB_CATEGORIES = [
  { id: "teacher",     icon: "🕌", name: "Teacher Classrooms" },
  { id: "quran_study", icon: "📖", name: "Quran Study" },
  { id: "recitation",  icon: "🎙️", name: "Quran Recitation" },
  { id: "discussion",  icon: "🧠", name: "Islamic Knowledge" },
  { id: "hadith",      icon: "📚", name: "Hadith Study" },
  { id: "ramadan",      icon: "🌙", name: "Ramadan" },
  { id: "dua",         icon: "🤲", name: "Du'a & Adhkar" },
  { id: "salah",       icon: "🕌", name: "Salah Learning" },
  { id: "community",   icon: "👥", name: "Community Study" },
  { id: "general",     icon: "💬", name: "General Discussion" },
];

// ── Question Bank for Teacher Qualification ───────────────────
const QUESTION_BANK = [
  { category: "quran_knowledge", question: "How many surahs are in the Quran?", options: ["114","110","120","100"], correctIndex: 0 },
  { category: "quran_knowledge", question: "Which surah is known as 'The Opening'?", options: ["An-Naba","Al-Fatihah","Al-Ikhlaas","Al-Baqarah"], correctIndex: 1 },
  { category: "quran_knowledge", question: "How many verses are in Surah Al-Fatihah?", options: ["5","6","7","8"], correctIndex: 2 },
  { category: "quran_knowledge", question: "Which surah is known as 'The Heart of the Quran'?", options: ["Ya-Sin","Ar-Rahman","Al-Ikhlaas","Al-Kahf"], correctIndex: 0 },
  { category: "quran_knowledge", question: "In which surah is Ayat al-Kursi found?", options: ["Al-Baqarah","Al-Imran","An-Nisa","Al-Ma'idah"], correctIndex: 0 },
  { category: "quran_knowledge", question: "How many juz (parts) is the Quran divided into?", options: ["20","25","30","40"], correctIndex: 2 },
  { category: "quran_knowledge", question: "Which surah does NOT start with Bismillah?", options: ["At-Tawbah","Al-Anfal","An-Naml","Al-Furqan"], correctIndex: 0 },
  { category: "quran_knowledge", question: "What is the longest surah in the Quran?", options: ["Al-Imran","Al-Baqarah","An-Nisa","Al-Ma'idah"], correctIndex: 1 },
  { category: "tajweed", question: "What does 'Madd' mean in Tajweed?", options: ["Stopping","Elongation","Merging","Hiding"], correctIndex: 1 },
  { category: "tajweed", question: "How many counts is mandatory elongation (Madd Laazim)?", options: ["2","4","6","8"], correctIndex: 2 },
  { category: "tajweed", question: "Which letters produce Qalqalah (echo)?", options: ["ق ط ب ج د","س ش ص ض","ا و ي","ن م و"], correctIndex: 0 },
  { category: "tajweed", question: "What is Idgham in Tajweed?", options: ["Hiding a sound","Merging two sounds","Stopping on a letter","Elongating a vowel"], correctIndex: 1 },
  { category: "tajweed", question: "What does Ikhfa mean?", options: ["Complete merging","Clear pronunciation","Hiding with nasal tone","Echo effect"], correctIndex: 2 },
  { category: "tajweed", question: "Which is NOT a Madd letter?", options: ["ا (Alif)","و (Waw)","ي (Yaa)","ن (Noon)"], correctIndex: 3 },
  { category: "tajweed", question: "What is Ghunnah?", options: ["Echo on qalqalah letters","Nasal sound held for 2 counts","Elongation of vowels","Stopping at end of verse"], correctIndex: 1 },
  { category: "tajweed", question: "What does Sukoon (ْ) indicate?", options: ["Double the consonant","No vowel sound","Nasal tone","Elongation"], correctIndex: 1 },
  { category: "islamic_studies", question: "How many pillars of Islam are there?", options: ["3","4","5","6"], correctIndex: 2 },
  { category: "islamic_studies", question: "What is the minimum Zakat rate?", options: ["1%","2.5%","5%","10%"], correctIndex: 1 },
  { category: "islamic_studies", question: "How many obligatory prayers are there daily?", options: ["3","4","5","6"], correctIndex: 2 },
  { category: "islamic_studies", question: "During which month is Ramadan fasting observed?", options: ["Rajab","Sha'ban","Ramadan","Shawwal"], correctIndex: 2 },
  { category: "islamic_studies", question: "How many Tawaf circuits are required in Umrah?", options: ["5","7","10","12"], correctIndex: 1 },
  { category: "islamic_studies", question: "What is the Nisab for Zakat in gold?", options: ["50 grams","85 grams","100 grams","140 grams"], correctIndex: 1 },
  { category: "islamic_studies", question: "How many days is the Hajj pilgrimage?", options: ["3 days","5 days","6 days","8 days"], correctIndex: 2 },
  { category: "islamic_studies", question: "What does 'Wudu' mean?", options: ["Prayer","Fasting","Ablution/cleansing","Charity"], correctIndex: 2 },
  { category: "teaching", question: "What is the best approach when a student struggles with Tajweed?", options: ["Skip the rule and move on","Be patient and repeat with examples","Tell them to learn alone","Give a different surah"], correctIndex: 1 },
  { category: "teaching", question: "How should a teacher handle students of different levels?", options: ["Teach only the advanced ones","Ignore struggling students","Adapt pace and give individual attention","Make everyone learn at the same speed"], correctIndex: 2 },
  { category: "teaching", question: "What should a teacher do before starting a lesson?", options: ["Start immediately without preparation","Recite Bismillah and review the lesson plan","Wait for students to ask questions","Give a test first"], correctIndex: 1 },
  { category: "teaching", question: "How should corrections be given to students?", options: ["Publicly shame the student","Correct gently with encouragement","Ignore mistakes completely","Only correct at the end"], correctIndex: 1 },
  { category: "teaching", question: "What is important when teaching Quran recitation?", options: ["Speed over accuracy","Accuracy and proper Tajweed rules","Memorization only","Reading without understanding"], correctIndex: 1 },
  { category: "conduct", question: "What should a teacher do if they don't know an answer?", options: ["Make up an answer","Say 'I don't know' and research it","Change the subject","Guess confidently"], correctIndex: 1 },
  { category: "conduct", question: "How should a teacher interact with students?", options: ["Strictly and harshly","With patience, respect, and kindness","Indifferently","Only when asked questions"], correctIndex: 1 },
  { category: "conduct", question: "What is prohibited in a teaching environment?", options: ["Asking questions","Respectful disagreement","Inappropriate language and behavior","Taking breaks"], correctIndex: 2 },
  { category: "conduct", question: "What should a teacher's intention be when teaching?", options: ["To show off knowledge","To earn money only","To please Allah and help students learn","To gain followers"], correctIndex: 2 },
  { category: "conduct", question: "How should disputes between students be handled?", options: ["Ignore them","Take sides with the majority","Mediate fairly and encourage respect","Expel both students"], correctIndex: 2 },
];

// ── Helpers ───────────────────────────────────────────────────
const pickRandom = (arr, n) => [...arr].sort(() => Math.random() - 0.5).slice(0, n);
const genCode = () => { const c="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"; let s=""; for(let i=0;i<6;i++) s+=c[Math.floor(Math.random()*c.length)]; return s; };
const genQualId = () => "qual_" + Date.now() + "_" + Math.random().toString(36).substring(2,8);
const sanitizeName = (n) => (n||"Anonymous").substring(0,30).trim() || "Anonymous";
const sysFields = new Set(["id","created_date","updated_date","created_by_id","is_sample","created_by"]);

// Normalize record: ensure r.data exists with user fields
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

// List all records (no SDK filter) and filter in code
async function q(db, entity, filters = {}, opts = {}) {
  const { sortField, sortDir = 1, limitN = 500 } = opts;
  let records = norm(await db[entity].list());
  for (const [k, v] of Object.entries(filters)) {
    records = records.filter(r => r.data[k] === v);
  }
  if (sortField) {
    records.sort((a, b) => {
      const av = a[sortField] || (a.data && a.data[sortField]) || "";
      const bv = b[sortField] || (b.data && b.data[sortField]) || "";
      if (av < bv) return -sortDir;
      if (av > bv) return sortDir;
      return 0;
    });
  }
  return records.slice(0, limitN);
}

// Shape helpers
const roomSummary = r => ({
  roomCode: r.data.roomCode, roomName: r.data.roomName, roomType: r.data.roomType,
  category: r.data.category||"", description: r.data.description||"",
  owner: r.data.owner, memberCount: r.data.memberCount||0, msgCount: r.data.msgCount||0,
  created_date: r.created_date,
});
const messageShape = r => ({
  id: r.id, userName: r.data.userName, messageType: r.data.messageType,
  text: r.data.text||"", audioBase64: r.data.audioBase64||"",
  durationSec: r.data.durationSec||0, reactions: r.data.reactions||"[]",
  replyTo: r.data.replyTo||"", edited: r.data.edited||false,
  pinned: r.data.pinned||false, archived: r.data.archived||false,
  created_date: r.created_date,
});
const homeworkShape = r => ({
  id: r.id, title: r.data.title, description: r.data.description||"",
  assignedBy: r.data.assignedBy, dueDate: r.data.dueDate||"", completedBy: r.data.completedBy||"[]",
});
const memberShape = r => ({
  userName: r.data.userName, role: r.data.role, muted: r.data.muted||false, banned: r.data.banned||false,
});

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

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// ═══════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  const base44 = createClientFromRequest(req);
  const db = base44.asServiceRole.entities;

  try {
    const body = await req.json();
    const action = body.action;
    const userName = sanitizeName(body.userName);

    // ── 1. CHECK QUALIFICATION ──────────────────────────────
    if (action === "checkQualification") {
      const quals = await q(db, "GroupVoiceQualification", { userName, passed: true }, { limitN: 1 });
      return jsonResponse({ ok: true, qualified: quals.length > 0 });
    }

    // ── 2. START QUALIFICATION ──────────────────────────────
    if (action === "startQualification") {
      const existing = await q(db, "GroupVoiceQualification", { userName, passed: true }, { limitN: 1 });
      if (existing.length > 0) return jsonResponse({ alreadyQualified: true });

      const recent = await q(db, "GroupVoiceQualification", { userName }, { sortField: "created_date", sortDir: -1, limitN: 1 });
      if (recent.length > 0) {
        const lastAttempt = new Date(recent[0].created_date);
        const daysSince = (Date.now() - lastAttempt.getTime()) / (1000*60*60*24);
        if (daysSince < 3 && !recent[0].data.passed) {
          return jsonResponse({ cooldown: true, message: `Please wait ${Math.ceil(3-daysSince)} more day(s) before retrying.` });
        }
      }

      const selected = pickRandom(QUESTION_BANK, 21);
      const questions = selected.map(qq => ({ category: qq.category, question: qq.question, options: qq.options }));
      const qualId = genQualId();
      const correctAnswers = selected.map(qq => qq.correctIndex);

      await db.GroupVoiceQualification.create({
        userName, qualificationId: qualId, answers: JSON.stringify(correctAnswers),
        score: 0, passed: false, correct: 0, total: 21,
      });

      return jsonResponse({ ok: true, qualificationId: qualId, questions });
    }

    // ── 3. SUBMIT QUALIFICATION ─────────────────────────────
    if (action === "submitQualification") {
      const quals = await q(db, "GroupVoiceQualification", { qualificationId: body.qualificationId }, { limitN: 1 });
      if (quals.length === 0) return jsonResponse({ ok: false, error: "Qualification not found" });

      const qual = quals[0];
      const correctAnswers = JSON.parse(qual.data.answers || "[]");
      let correct = 0;
      for (let i = 0; i < correctAnswers.length; i++) {
        if ((body.answers||[])[i] === correctAnswers[i]) correct++;
      }
      const total = correctAnswers.length;
      const score = Math.round((correct / total) * 100);
      const minimumScore = 70;
      const passed = score >= minimumScore;
      const feedback = passed
        ? `MashaAllah! You scored ${score}% (${correct}/${total}). You are qualified to create Teacher Classrooms. Remember: this certifies knowledge, not religious authority (ijazah). Always consult qualified scholars for fatwa.`
        : `You scored ${score}% (${correct}/${total}). You need ${minimumScore}% to pass. Please review Quran knowledge, Tajweed rules, and Islamic studies, then try again after 3 days.`;

      await db.GroupVoiceQualification.update(qual.id, { score, passed, correct, answers: qual.data.answers });
      return jsonResponse({ ok: true, passed, score, correct, total, minimumScore, feedback });
    }

    // ── 4. CREATE ROOM ───────────────────────────────────────
    if (action === "createRoom") {
      if (body.roomType === "teacher") {
        const quals = await q(db, "GroupVoiceQualification", { userName, passed: true }, { limitN: 1 });
        if (quals.length === 0) return jsonResponse({ ok: false, error: "Not qualified to create teacher rooms" });
      }
      const roomName = (body.roomName || "Study Room").substring(0, 80).trim();
      const description = (body.description || "").substring(0, 400).trim();
      let roomCode = genCode();
      let existing = await q(db, "GroupVoiceRoom", { roomCode }, { limitN: 1 });
      while (existing.length > 0) { roomCode = genCode(); existing = await q(db, "GroupVoiceRoom", { roomCode }, { limitN: 1 }); }

      await db.GroupVoiceRoom.create({
        roomCode, roomName, roomType: body.roomType || "student", category: body.category || "general",
        description, owner: userName, isPublic: body.isPublic !== false,
        currentSurah: 78, currentVerse: 1, pinnedVerses: "[]", completedSurahs: "[]",
        raisedHands: "[]", classNotes: "", roomRules: "", announcement: "", memberCount: 1, msgCount: 0,
      });
      await db.GroupVoiceMember.create({ roomCode, userName, role: "owner", muted: false, banned: false });
      return jsonResponse({ ok: true, roomCode });
    }

    // ── 5. GET ROOM ─────────────────────────────────────────
    if (action === "getRoom") {
      const roomCode = (body.roomCode || "").toUpperCase();
      const rooms = await q(db, "GroupVoiceRoom", { roomCode }, { limitN: 1 });
      if (rooms.length === 0) return jsonResponse({ ok: false, error: "Room not found" });
      const r = rooms[0];

      const members = await q(db, "GroupVoiceMember", { roomCode });
      const member = members.find(m => m.data.userName === userName);
      if (member && member.data.banned) return jsonResponse({ ok: false, error: "Access denied — you are banned from this room" });

      const isTeacher = member ? (member.data.role === "owner" || member.data.role === "moderator") : false;
      const room = {
        isTeacher, currentSurah: r.data.currentSurah || 78, currentVerse: r.data.currentVerse || 1,
        pinnedVerses: r.data.pinnedVerses || "[]", completedSurahs: r.data.completedSurahs || "[]",
        raisedHands: r.data.raisedHands || "[]", roomType: r.data.roomType, teacherName: r.data.owner,
        memberCount: r.data.memberCount || members.length, classNotes: r.data.classNotes || "",
        roomRules: r.data.roomRules || "", announcement: r.data.announcement || "",
      };
      const hwRecords = await q(db, "GroupVoiceHomework", { roomCode }, { sortField: "created_date", sortDir: -1 });
      return jsonResponse({ ok: true, room, homework: hwRecords.map(homeworkShape) });
    }

    // ── 6. JOIN ROOM ────────────────────────────────────────
    if (action === "joinRoom") {
      const roomCode = (body.roomCode || "").toUpperCase();
      const rooms = await q(db, "GroupVoiceRoom", { roomCode }, { limitN: 1 });
      if (rooms.length === 0) return jsonResponse({ ok: false, error: "Room not found" });

      const existing = await q(db, "GroupVoiceMember", { roomCode, userName }, { limitN: 1 });
      if (existing.length > 0) {
        if (existing[0].data.banned) return jsonResponse({ ok: false, error: "Access denied — you are banned from this room" });
        return jsonResponse({ ok: true, alreadyMember: true });
      }

      await db.GroupVoiceMember.create({ roomCode, userName, role: "member", muted: false, banned: false });
      const count = await q(db, "GroupVoiceMember", { roomCode });
      await db.GroupVoiceRoom.update(rooms[0].id, { memberCount: count.length });
      return jsonResponse({ ok: true });
    }

    // ── 7. GET HUB ──────────────────────────────────────────
    if (action === "getHub") {
      const allRooms = await q(db, "GroupVoiceRoom", { isPublic: true }, { sortField: "created_date", sortDir: -1, limitN: 100 });
      const summaries = allRooms.map(roomSummary);
      const active = [...summaries].sort((a,b) => b.msgCount - a.msgCount).slice(0, 20);
      const newest = [...summaries].slice(0, 20);
      return jsonResponse({ ok: true, categories: HUB_CATEGORIES, rooms: summaries, active, newest });
    }

    // ── 8. SEARCH ROOMS ─────────────────────────────────────
    if (action === "searchRooms") {
      const search = (body.search || "").toLowerCase().trim();
      if (!search) return jsonResponse({ ok: true, rooms: [] });
      const allRooms = await q(db, "GroupVoiceRoom", { isPublic: true }, { limitN: 200 });
      const results = allRooms.filter(r => {
        const name = (r.data.roomName||"").toLowerCase();
        const desc = (r.data.description||"").toLowerCase();
        const cat = (r.data.category||"").toLowerCase();
        return name.includes(search) || desc.includes(search) || cat.includes(search);
      }).map(roomSummary);
      return jsonResponse({ ok: true, rooms: results });
    }

    // ── 9. MY ROOMS ─────────────────────────────────────────
    if (action === "myRooms") {
      const ownedRooms = await q(db, "GroupVoiceRoom", { owner: userName }, { sortField: "created_date", sortDir: -1 });
      const memberRecords = await q(db, "GroupVoiceMember", { userName });
      const joinedCodes = memberRecords.filter(m => m.data.role !== "owner").map(m => m.data.roomCode);
      let joined = [];
      for (const code of joinedCodes) {
        const r = await q(db, "GroupVoiceRoom", { roomCode: code }, { limitN: 1 });
        if (r.length > 0) joined.push(r[0]);
      }
      return jsonResponse({ ok: true, owned: ownedRooms.map(roomSummary), joined: joined.map(roomSummary) });
    }

    // ── 10. MANAGE MEMBER ───────────────────────────────────
    if (action === "manageMember") {
      const roomCode = (body.roomCode || "").toUpperCase();
      const targetUser = sanitizeName(body.targetUser);
      const op = body.op;

      const requester = await q(db, "GroupVoiceMember", { roomCode, userName }, { limitN: 1 });
      if (requester.length === 0 || (requester[0].data.role !== "owner" && requester[0].data.role !== "moderator"))
        return jsonResponse({ ok: false, error: "Only teachers can manage members" });

      const targets = await q(db, "GroupVoiceMember", { roomCode, userName: targetUser }, { limitN: 1 });
      if (targets.length === 0) return jsonResponse({ ok: false, error: "Member not found" });
      const target = targets[0];
      if (target.data.role === "owner") return jsonResponse({ ok: false, error: "Cannot modify the room owner" });

      const update = {};
      switch (op) {
        case "mute": update.muted = true; break;
        case "unmute": update.muted = false; break;
        case "ban": update.banned = true; break;
        case "unban": update.banned = false; break;
        case "promote": update.role = "moderator"; break;
        case "demote": update.role = "member"; break;
        case "remove":
          await db.GroupVoiceMember.delete(target.id);
          { const rooms = await q(db, "GroupVoiceRoom", { roomCode }, { limitN: 1 });
            if (rooms.length > 0) { const count = await q(db, "GroupVoiceMember", { roomCode }); await db.GroupVoiceRoom.update(rooms[0].id, { memberCount: count.length }); } }
          return jsonResponse({ ok: true });
        default: return jsonResponse({ ok: false, error: "Unknown operation" });
      }
      await db.GroupVoiceMember.update(target.id, update);
      return jsonResponse({ ok: true });
    }

    // ── 11. UPDATE ROOM ─────────────────────────────────────
    if (action === "updateRoom") {
      const roomCode = (body.roomCode || "").toUpperCase();
      const rooms = await q(db, "GroupVoiceRoom", { roomCode }, { limitN: 1 });
      if (rooms.length === 0) return jsonResponse({ ok: false, error: "Room not found" });

      const members = await q(db, "GroupVoiceMember", { roomCode, userName }, { limitN: 1 });
      if (members.length === 0 || (members[0].data.role !== "owner" && members[0].data.role !== "moderator"))
        return jsonResponse({ ok: false, error: "Only teachers can update the room" });

      const update = {};
      for (const f of ["currentSurah","currentVerse","pinnedVerses","completedSurahs","raisedHands","classNotes","roomRules","announcement"]) {
        if (body[f] !== undefined) update[f] = body[f];
      }
      if (Object.keys(update).length > 0) await db.GroupVoiceRoom.update(rooms[0].id, update);
      return jsonResponse({ ok: true });
    }

    // ── 12. RAISE HAND ───────────────────────────────────────
    if (action === "raiseHand") {
      const roomCode = (body.roomCode || "").toUpperCase();
      const rooms = await q(db, "GroupVoiceRoom", { roomCode }, { limitN: 1 });
      if (rooms.length === 0) return jsonResponse({ ok: false, error: "Room not found" });

      let raisedHands = [];
      try { raisedHands = JSON.parse(rooms[0].data.raisedHands || "[]"); } catch(e) {}
      if (body.lower) { raisedHands = raisedHands.filter(h => h !== userName); }
      else { if (!raisedHands.includes(userName)) raisedHands.push(userName); }
      await db.GroupVoiceRoom.update(rooms[0].id, { raisedHands: JSON.stringify(raisedHands) });
      return jsonResponse({ ok: true });
    }

    // ── 13. ASSIGN HOMEWORK ─────────────────────────────────
    if (action === "assignHomework") {
      const roomCode = (body.roomCode || "").toUpperCase();
      const title = (body.title || "").substring(0, 200).trim();
      if (!title) return jsonResponse({ ok: false, error: "Title required" });

      const members = await q(db, "GroupVoiceMember", { roomCode, userName }, { limitN: 1 });
      if (members.length === 0 || (members[0].data.role !== "owner" && members[0].data.role !== "moderator"))
        return jsonResponse({ ok: false, error: "Only teachers can assign homework" });

      await db.GroupVoiceHomework.create({
        roomCode, title, description: (body.description||"").substring(0,1000).trim(),
        assignedBy: userName, dueDate: body.dueDate || "", completedBy: "[]",
      });
      return jsonResponse({ ok: true });
    }

    // ── 14. TOGGLE HOMEWORK ─────────────────────────────────
    if (action === "toggleHomework") {
      const roomCode = (body.roomCode || "").toUpperCase();
      const hw = await q(db, "GroupVoiceHomework", { roomCode }, { limitN: 100 });
      const item = hw.find(h => h.id === body.homeworkId);
      if (!item) return jsonResponse({ ok: false, error: "Homework not found" });

      let completedBy = [];
      try { completedBy = JSON.parse(item.data.completedBy || "[]"); } catch(e) {}
      if (completedBy.includes(userName)) completedBy = completedBy.filter(u => u !== userName);
      else completedBy.push(userName);
      await db.GroupVoiceHomework.update(item.id, { completedBy: JSON.stringify(completedBy) });
      return jsonResponse({ ok: true });
    }

    // ── 15. DELETE HOMEWORK ─────────────────────────────────
    if (action === "deleteHomework") {
      const roomCode = (body.roomCode || "").toUpperCase();
      const members = await q(db, "GroupVoiceMember", { roomCode, userName }, { limitN: 1 });
      if (members.length === 0 || (members[0].data.role !== "owner" && members[0].data.role !== "moderator"))
        return jsonResponse({ ok: false, error: "Only teachers can delete homework" });
      await db.GroupVoiceHomework.delete(body.homeworkId);
      return jsonResponse({ ok: true });
    }

    // ── 16. GET MEMBERS ─────────────────────────────────────
    if (action === "getMembers") {
      const roomCode = (body.roomCode || "").toUpperCase();
      const members = await q(db, "GroupVoiceMember", { roomCode });
      return jsonResponse({ ok: true, members: members.map(memberShape) });
    }

    // ── 17. LIST (recent messages) ──────────────────────────
    if (action === "list") {
      const roomCode = (body.roomCode || "").toUpperCase();
      const limit = Math.min(body.limit || 50, 100);

      const memberRecords = await q(db, "GroupVoiceMember", { roomCode, userName }, { limitN: 1 });
      if (memberRecords.length > 0 && memberRecords[0].data.banned)
        return jsonResponse({ ok: false, error: "Access denied — you are banned from this room" });

      const messages = await q(db, "GroupVoiceMessage", { roomCode }, { sortField: "created_date", sortDir: -1, limitN: limit });
      return jsonResponse({ ok: true, messages: messages.map(messageShape), hasMore: messages.length === limit });
    }

    // ── 18. LIST ARCHIVED ────────────────────────────────────
    if (action === "listArchived") {
      const roomCode = (body.roomCode || "").toUpperCase();
      const limit = Math.min(body.limit || 50, 100);
      const all = await q(db, "GroupVoiceMessage", { roomCode }, { sortField: "created_date", sortDir: -1, limitN: 200 });
      const archived = all.slice(limit);
      return jsonResponse({ ok: true, messages: archived.map(messageShape), hasMore: archived.length === limit });
    }

    // ── 19. SEND (voice) ────────────────────────────────────
    if (action === "send") {
      const roomCode = (body.roomCode || "").toUpperCase();
      if (!body.audioBase64 || body.audioBase64.length < 10) return jsonResponse({ ok: false, error: "No audio data" });

      const members = await q(db, "GroupVoiceMember", { roomCode, userName }, { limitN: 1 });
      if (members.length > 0 && members[0].data.muted) return jsonResponse({ ok: false, error: "You are muted in this room" });

      await db.GroupVoiceMessage.create({
        roomCode, userName, messageType: "voice", text: "",
        audioBase64: body.audioBase64, durationSec: body.durationSec || 0,
        reactions: "[]", replyTo: "", edited: false, pinned: false, archived: false,
      });
      const rooms = await q(db, "GroupVoiceRoom", { roomCode }, { limitN: 1 });
      if (rooms.length > 0) await db.GroupVoiceRoom.update(rooms[0].id, { msgCount: (rooms[0].data.msgCount||0) + 1 });
      return jsonResponse({ ok: true });
    }

    // ── 20. SEND TEXT ───────────────────────────────────────
    if (action === "sendText") {
      const roomCode = (body.roomCode || "").toUpperCase();
      const text = (body.text || "").substring(0, 1000).trim();
      if (!text) return jsonResponse({ ok: false, error: "Empty message" });

      const members = await q(db, "GroupVoiceMember", { roomCode, userName }, { limitN: 1 });
      if (members.length > 0 && members[0].data.muted) return jsonResponse({ ok: false, error: "You are muted in this room" });

      await db.GroupVoiceMessage.create({
        roomCode, userName, messageType: "text", text,
        audioBase64: "", durationSec: 0, reactions: "[]",
        replyTo: body.replyTo || "", edited: false, pinned: false, archived: false,
      });
      const rooms = await q(db, "GroupVoiceRoom", { roomCode }, { limitN: 1 });
      if (rooms.length > 0) await db.GroupVoiceRoom.update(rooms[0].id, { msgCount: (rooms[0].data.msgCount||0) + 1 });
      return jsonResponse({ ok: true });
    }

    // ── 21. ADD REACTION ────────────────────────────────────
    if (action === "addReaction") {
      const roomCode = (body.roomCode || "").toUpperCase();
      const emoji = (body.emoji || "").substring(0, 10);
      const messages = await q(db, "GroupVoiceMessage", { roomCode }, { limitN: 200 });
      const msg = messages.find(m => m.id === body.messageId);
      if (!msg) return jsonResponse({ ok: false, error: "Message not found" });

      let reactions = [];
      try { reactions = JSON.parse(msg.data.reactions || "[]"); } catch(e) {}
      let existing = reactions.find(r => r.emoji === emoji);
      if (existing) {
        if (existing.users.includes(userName)) { existing.users = existing.users.filter(u => u !== userName); if (existing.users.length === 0) reactions = reactions.filter(r => r.emoji !== emoji); }
        else existing.users.push(userName);
      } else { reactions.push({ emoji, users: [userName] }); }
      await db.GroupVoiceMessage.update(msg.id, { reactions: JSON.stringify(reactions) });
      return jsonResponse({ ok: true });
    }

    // ── 22. EDIT MESSAGE ────────────────────────────────────
    if (action === "editMessage") {
      const roomCode = (body.roomCode || "").toUpperCase();
      const newText = (body.text || "").substring(0, 1000).trim();
      if (!newText) return jsonResponse({ ok: false, error: "Empty message" });
      const messages = await q(db, "GroupVoiceMessage", { roomCode }, { limitN: 200 });
      const msg = messages.find(m => m.id === body.messageId);
      if (!msg) return jsonResponse({ ok: false, error: "Message not found" });
      if (msg.data.userName !== userName) return jsonResponse({ ok: false, error: "You can only edit your own messages" });
      await db.GroupVoiceMessage.update(msg.id, { text: newText, edited: true });
      return jsonResponse({ ok: true });
    }

    // ── 23. TOGGLE PIN ──────────────────────────────────────
    if (action === "togglePin") {
      const roomCode = (body.roomCode || "").toUpperCase();
      const members = await q(db, "GroupVoiceMember", { roomCode, userName }, { limitN: 1 });
      if (members.length === 0 || (members[0].data.role !== "owner" && members[0].data.role !== "moderator"))
        return jsonResponse({ ok: false, error: "Only teachers can pin messages" });
      const messages = await q(db, "GroupVoiceMessage", { roomCode }, { limitN: 200 });
      const msg = messages.find(m => m.id === body.messageId);
      if (!msg) return jsonResponse({ ok: false, error: "Message not found" });
      const newPinned = !(msg.data.pinned || false);
      await db.GroupVoiceMessage.update(msg.id, { pinned: newPinned });
      return jsonResponse({ ok: true, pinned: newPinned });
    }

    // ── 24. DELETE MESSAGE ─────────────────────────────────
    if (action === "deleteMessage") {
      const roomCode = (body.roomCode || "").toUpperCase();
      const messages = await q(db, "GroupVoiceMessage", { roomCode }, { limitN: 200 });
      const msg = messages.find(m => m.id === body.messageId);
      if (!msg) return jsonResponse({ ok: false, error: "Message not found" });
      const isAuthor = msg.data.userName === userName;
      const members = await q(db, "GroupVoiceMember", { roomCode, userName }, { limitN: 1 });
      const isTeacher = members.length > 0 && (members[0].data.role === "owner" || members[0].data.role === "moderator");
      if (!isAuthor && !isTeacher) return jsonResponse({ ok: false, error: "You can only delete your own messages" });
      await db.GroupVoiceMessage.delete(msg.id);
      const rooms = await q(db, "GroupVoiceRoom", { roomCode }, { limitN: 1 });
      if (rooms.length > 0) await db.GroupVoiceRoom.update(rooms[0].id, { msgCount: Math.max(0, (rooms[0].data.msgCount||0) - 1) });
      return jsonResponse({ ok: true });
    }

    // ── 25. SEARCH MESSAGES ─────────────────────────────────
    if (action === "searchMessages") {
      const roomCode = (body.roomCode || "").toUpperCase();
      const query = (body.query || "").toLowerCase().trim();
      if (!query) return jsonResponse({ ok: true, results: [] });
      const messages = await q(db, "GroupVoiceMessage", { roomCode }, { sortField: "created_date", sortDir: -1, limitN: 200 });
      const results = messages.filter(m => m.data.messageType === "text" && (m.data.text||"").toLowerCase().includes(query));
      return jsonResponse({ ok: true, results: results.map(messageShape) });
    }

    // ── UNKNOWN ─────────────────────────────────────────────
    return jsonResponse({ ok: false, error: "Unknown action: " + action });

  } catch (e) {
    console.error("groupVoiceHub error:", e);
    return jsonResponse({ ok: false, error: String(e.message || e) });
  }
});