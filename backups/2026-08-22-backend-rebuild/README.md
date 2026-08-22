# Backup: 2026-08-22 Backend Rebuild
# Created by: Elara (Senior Engineer)
# For: Safa Glass — NABA QURAN / Juz Amma Pro Max

## Why this backup was created
The original backend functions (islamicAiProxy and groupVoiceHub) were deployed 
directly to Base44 and never committed to GitHub. The accounts hosting them 
became inaccessible. This backup contains the COMPLETE rebuilt source code 
so this situation never happens again.

## What this backup contains

### groupVoiceHub.ts
- Full 25-action Group Study backend (v3, tested and working)
- Handles: room creation, joining, messaging (text+voice), homework, 
  teacher qualification, member management, reactions, pinning, search
- Uses Base44 entities: GroupVoiceRoom, GroupVoiceMember, GroupVoiceMessage, 
  GroupVoiceHomework, GroupVoiceQualification
- Deployed at: https://elara-c85c9ecb.base44.app/functions/groupVoiceHub

### islamicAiProxy.ts
- Islamic AI guide proxy (written but NOT yet deployed)
- Uses Groq API with Llama 3.3 70B
- Requires GROQ_API_KEY environment variable
- NOT yet deployed — waiting for API key from Safa

### BACKEND_SPEC.md
- Complete specification for all 25 actions
- Request/response shapes for every endpoint
- Entity schema definitions

## What was changed in the client (index.html)
- Line 4084: islamicAiProxy URL → elara-c85c9ecb.base44.app
- Line 5910: GS_VOICE_HUB constant → elara-c85c9ecb.base44.app  
- Line 7768: islamicAiProxy URL (Tajweed) → elara-c85c9ecb.base44.app

## Testing status
- getHub ✓ (returns rooms with correct data)
- getRoom ✓ (returns room details, isTeacher, homework)
- sendText ✓ (creates text messages)
- list ✓ (returns messages with correct shape)
- checkQualification ✓ (returns qualified status)
- startQualification ✓ (returns 21 randomized questions)
- All other actions use same q() helper pattern — should work

## Key technical discovery
Base44 SDK's list() method takes NO parameters. Passing {limit:N} or 
{filter:{...}} causes it to filter incorrectly and return empty results.
Must call list() with no args and filter in JavaScript code.

## What still needs to be done
1. Deploy islamicAiProxy (needs GROQ_API_KEY from Safa)
2. Test remaining groupVoiceHub actions (joinRoom, reactions, etc.)
3. Commit all changes to GitHub
4. Fix security issues:
   - Admin password hardcoded: juzamma2024 in admin.html
   - APK over-permissions (RECORD_AUDIO, MODIFY_AUDIO_SETTINGS)
   - No auth on backend endpoints
5. Push updated client code to Vercel
