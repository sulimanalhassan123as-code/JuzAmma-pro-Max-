# NABA QURAN — Backend Functions Specification
# Created: 2026-08-22 by Elara (Senior Engineer)
# Purpose: Complete spec for rebuilding islamicAiProxy + groupVoiceHub from scratch
# Reason: Original deployed code was never committed to GitHub and is now inaccessible

══════════════════════════════════════════════════════════════════
FUNCTION 1: islamicAiProxy
══════════════════════════════════════════════════════════════════

PURPOSE: Proxy between client and LLM (originally Groq) for Islamic AI guidance
ENDPOINT: POST /functions/islamicAiProxy

REQUEST:
  { message: string }  — The user's question or structured prompt

RESPONSE:
  { reply: string }  — The LLM's response text

USAGE LOCATIONS IN CLIENT:
  1. AI Guide chat (line 4084) — Islamic Q&A with local KB fallback
  2. Tajweed checker (line 7768) — Structured prompt expecting PACE/RULES/WORDS/TIP format

BEHAVIOR:
  - Receives a message string
  - Forwards to LLM with an Islamic-focused system prompt
  - Returns the LLM's reply
  - On error, returns { reply: "I could not generate a response. Please try again." }

CURRENT STATUS: Endpoint is live but returns error response — likely API key exhausted

══════════════════════════════════════════════════════════════════
FUNCTION 2: groupVoiceHub
══════════════════════════════════════════════════════════════════

PURPOSE: Full Group Study / Classroom backend
ENDPOINT: POST /functions/groupVoiceHub
PATTERN: Single function with action-based routing (action field determines handler)

──────────────────────────────────────────────────────────────────
ACTION 1: checkQualification
──────────────────────────────────────────────────────────────────
REQUEST:  { action:'checkQualification', userName: string }
RESPONSE: { ok: boolean, qualified: boolean }

──────────────────────────────────────────────────────────────────
ACTION 2: startQualification
──────────────────────────────────────────────────────────────────
REQUEST:  { action:'startQualification', userName: string }
RESPONSE (already qualified): { alreadyQualified: true }
RESPONSE (cooldown active):   { cooldown: true, message: string }
RESPONSE (success): {
  ok: true,
  qualificationId: string,
  questions: [
    { category: string, question: string, options: string[] }
  ]
}
NOTES: Questions are randomized from a question bank. Minimum 70% to pass.
       Cooldown of 3 days if failed.

──────────────────────────────────────────────────────────────────
ACTION 3: submitQualification
──────────────────────────────────────────────────────────────────
REQUEST:  { action:'submitQualification', qualificationId: string, userName: string, answers: number[] }
RESPONSE: {
  ok: boolean,
  passed: boolean,
  score: number,       — percentage
  correct: number,
  total: number,
  minimumScore: number, — 70
  feedback: string
}

──────────────────────────────────────────────────────────────────
ACTION 4: createRoom
──────────────────────────────────────────────────────────────────
REQUEST: {
  action:'createRoom',
  userName: string,
  roomType: 'teacher' | 'student',
  category: string,
  roomName: string,
  description: string,
  isPublic: boolean
}
RESPONSE: { ok: boolean, roomCode: string, error?: string }
NOTES: roomCode is a 6-character alphanumeric code

──────────────────────────────────────────────────────────────────
ACTION 5: getRoom
──────────────────────────────────────────────────────────────────
REQUEST:  { action:'getRoom', roomCode: string, userName: string }
RESPONSE: {
  ok: boolean,
  room: {
    isTeacher: boolean,       — whether THIS user is the teacher
    currentSurah: number,     — default 78
    currentVerse: number,     — default 1
    pinnedVerses: string,     — JSON array of {surah, verse}
    completedSurahs: string,  — JSON array of surah numbers
    raisedHands: string,      — JSON array of usernames
    roomType: 'teacher' | 'student',
    teacherName: string,
    memberCount: number,
    classNotes: string,
    roomRules: string,
    announcement: string
  },
  homework: [
    {
      id: string,
      title: string,
      description: string,
      assignedBy: string,
      dueDate: string,
      completedBy: string  — JSON array of usernames
    }
  ],
  error?: string
}

──────────────────────────────────────────────────────────────────
ACTION 6: joinRoom
──────────────────────────────────────────────────────────────────
REQUEST:  { action:'joinRoom', roomCode: string, userName: string }
RESPONSE: { ok: boolean, alreadyMember?: boolean, error?: string }

──────────────────────────────────────────────────────────────────
ACTION 7: getHub
──────────────────────────────────────────────────────────────────
REQUEST:  { action:'getHub', userName: string }
RESPONSE: {
  ok: boolean,
  categories: [{ id: string, icon: string, name: string }],
  rooms: [RoomSummary],
  active: [RoomSummary],
  newest: [RoomSummary]
}
RoomSummary = {
  roomCode: string,
  roomName: string,
  roomType: 'teacher' | 'student',
  category: string,
  description: string,
  owner: string,
  memberCount: number,
  msgCount: number,
  created_date: string
}

──────────────────────────────────────────────────────────────────
ACTION 8: searchRooms
──────────────────────────────────────────────────────────────────
REQUEST:  { action:'searchRooms', search: string }
RESPONSE: { ok: boolean, rooms: [RoomSummary] }

──────────────────────────────────────────────────────────────────
ACTION 9: myRooms
──────────────────────────────────────────────────────────────────
REQUEST:  { action:'myRooms', userName: string }
RESPONSE: { ok: boolean, owned: [RoomSummary], joined: [RoomSummary] }

──────────────────────────────────────────────────────────────────
ACTION 10: manageMember
──────────────────────────────────────────────────────────────────
REQUEST: {
  action:'manageMember',
  roomCode: string,
  userName: string,    — requester (must be teacher/owner)
  targetUser: string,
  op: 'mute' | 'unmute' | 'ban' | 'unban' | 'promote' | 'demote' | 'remove'
}
RESPONSE: { ok: boolean, error?: string }

──────────────────────────────────────────────────────────────────
ACTION 11: updateRoom
──────────────────────────────────────────────────────────────────
REQUEST: {
  action:'updateRoom',
  roomCode: string,
  userName: string,
  currentSurah?: number,
  currentVerse?: number,
  pinnedVerses?: string,    — JSON array
  completedSurahs?: string,  — JSON array
  raisedHands?: string,      — JSON array
  classNotes?: string,
  roomRules?: string,
  announcement?: string
}
RESPONSE: { ok: boolean }
NOTES: Only teacher/owner can update. Fields are optional — only provided fields are updated.

──────────────────────────────────────────────────────────────────
ACTION 12: raiseHand
──────────────────────────────────────────────────────────────────
REQUEST: {
  action:'raiseHand',
  roomCode: string,
  userName: string,
  lower: boolean  — true to lower hand, false to raise
}
RESPONSE: (implied ok)

──────────────────────────────────────────────────────────────────
ACTION 13: assignHomework
──────────────────────────────────────────────────────────────────
REQUEST: {
  action:'assignHomework',
  roomCode: string,
  userName: string,  — teacher
  title: string,
  description: string,
  dueDate: string
}
RESPONSE: (implied ok)

──────────────────────────────────────────────────────────────────
ACTION 14: toggleHomework
──────────────────────────────────────────────────────────────────
REQUEST: {
  action:'toggleHomework',
  roomCode: string,
  userName: string,
  homeworkId: string
}
RESPONSE: (implied ok)
NOTES: Toggles the userName in the completedBy array for this homework

──────────────────────────────────────────────────────────────────
ACTION 15: deleteHomework
──────────────────────────────────────────────────────────────────
REQUEST: {
  action:'deleteHomework',
  roomCode: string,
  userName: string,  — teacher
  homeworkId: string
}
RESPONSE: (implied ok)

──────────────────────────────────────────────────────────────────
ACTION 16: getMembers
──────────────────────────────────────────────────────────────────
REQUEST:  { action:'getMembers', roomCode: string, userName: string }
RESPONSE: {
  ok: boolean,
  members: [
    {
      userName: string,
      role: 'owner' | 'moderator' | 'member',
      muted: boolean,
      banned: boolean
    }
  ]
}

──────────────────────────────────────────────────────────────────
ACTION 17: list (messages)
──────────────────────────────────────────────────────────────────
REQUEST:  { action:'list', roomCode: string, userName: string, limit: number }
RESPONSE: {
  ok: boolean,
  messages: [Message],
  hasMore: boolean,
  error?: string
}
Message = {
  id: string,
  userName: string,
  messageType: 'voice' | 'text',
  created_date: string,  — ISO datetime
  text: string,          — for text messages
  audioBase64: string,   — for voice messages
  durationSec: number,    — for voice messages
  reactions: string,      — JSON array of {emoji, users[]}
  replyTo: string,        — message ID or empty
  edited: boolean,
  pinned: boolean,
  archived: boolean
}
NOTES: Returns most recent messages first. If user is banned, returns
       { ok: false, error: "Access denied..." }

──────────────────────────────────────────────────────────────────
ACTION 18: listArchived
──────────────────────────────────────────────────────────────────
REQUEST:  { action:'listArchived', roomCode: string, userName: string, limit: number }
RESPONSE: Same as list, but returns older/archived messages
NOTES: Cursor-based pagination for loading older messages

──────────────────────────────────────────────────────────────────
ACTION 19: send (voice message)
──────────────────────────────────────────────────────────────────
REQUEST: {
  action:'send',
  roomCode: string,
  userName: string,
  audioBase64: string,  — raw base64 (no data: prefix)
  durationSec: number
}
RESPONSE: { ok: boolean, error?: string }

──────────────────────────────────────────────────────────────────
ACTION 20: sendText
──────────────────────────────────────────────────────────────────
REQUEST: {
  action:'sendText',
  roomCode: string,
  userName: string,
  text: string,
  replyTo: string  — message ID or empty
}
RESPONSE: (implied ok)

──────────────────────────────────────────────────────────────────
ACTION 21: addReaction
──────────────────────────────────────────────────────────────────
REQUEST: {
  action:'addReaction',
  roomCode: string,
  userName: string,
  messageId: string,
  emoji: string
}
RESPONSE: { ok: boolean }
NOTES: Toggles the user's reaction on the message (add if not present, remove if present)

──────────────────────────────────────────────────────────────────
ACTION 22: editMessage
──────────────────────────────────────────────────────────────────
REQUEST: {
  action:'editMessage',
  roomCode: string,
  userName: string,  — must be message author
  messageId: string,
  text: string
}
RESPONSE: { ok: boolean, error?: string }

──────────────────────────────────────────────────────────────────
ACTION 23: togglePin
──────────────────────────────────────────────────────────────────
REQUEST: {
  action:'togglePin',
  roomCode: string,
  userName: string,  — must be teacher
  messageId: string
}
RESPONSE: { ok: boolean, pinned: boolean }

──────────────────────────────────────────────────────────────────
ACTION 24: deleteMessage
──────────────────────────────────────────────────────────────────
REQUEST: {
  action:'deleteMessage',
  roomCode: string,
  userName: string,  — author or teacher
  messageId: string
}
RESPONSE: { ok: boolean, error?: string }

──────────────────────────────────────────────────────────────────
ACTION 25: searchMessages
──────────────────────────────────────────────────────────────────
REQUEST: {
  action:'searchMessages',
  roomCode: string,
  userName: string,
  query: string
}
RESPONSE: { ok: boolean, results: [Message] }

══════════════════════════════════════════════════════════════════
ENTITY SCHEMAS NEEDED
══════════════════════════════════════════════════════════════════

1. GroupVoiceRoom
   - roomCode: string (unique, 6 chars)
   - roomName: string
   - roomType: 'teacher' | 'student'
   - category: string
   - description: string
   - owner: string (userName)
   - isPublic: boolean
   - currentSurah: number (default 78)
   - currentVerse: number (default 1)
   - pinnedVerses: string (JSON array)
   - completedSurahs: string (JSON array)
   - raisedHands: string (JSON array)
   - classNotes: string
   - roomRules: string
   - announcement: string
   - memberCount: number (cached)
   - msgCount: number (cached)

2. GroupVoiceMember
   - roomCode: string
   - userName: string
   - role: 'owner' | 'moderator' | 'member'
   - muted: boolean
   - banned: boolean

3. GroupVoiceMessage
   - roomCode: string
   - userName: string
   - messageType: 'voice' | 'text'
   - text: string
   - audioBase64: string
   - durationSec: number
   - reactions: string (JSON array of {emoji, users[]})
   - replyTo: string
   - edited: boolean
   - pinned: boolean
   - archived: boolean

4. GroupVoiceHomework
   - roomCode: string
   - title: string
   - description: string
   - assignedBy: string
   - dueDate: string
   - completedBy: string (JSON array of usernames)

5. GroupVoiceQualification
   - userName: string
   - score: number
   - passed: boolean
   - qualificationId: string

══════════════════════════════════════════════════════════════════
HUB CATEGORIES (static)
══════════════════════════════════════════════════════════════════
teacher    🕌  Teacher Classrooms
quran_study 📖  Quran Study
recitation 🎙️  Quran Recitation
discussion 🧠  Islamic Knowledge
hadith     📚  Hadith Study
ramadan    🌙  Ramadan
dua        🤲  Du'a & Adhkar
salah      🕌  Salah Learning
community  👥  Community Study
general    💬  General Discussion
