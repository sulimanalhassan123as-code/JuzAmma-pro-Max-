# NABA QURAN — AGENT CHARTER (read this before your first commit)

Repo: sulimanalhassan123as-code/JuzAmma-pro-Max-
Product name: Naba Quran. Repo name: JuzAmma Pro Max. Same thing.
Owner: Sulley Alhassan. Escalation contact: KESTREL (kestrel@neverhide.tech).

## 1. WHAT THIS PROJECT IS
A Quran study PWA (Juz Amma) with an Android wrapper, prepared for Google Play.
Stack: static HTML/CSS/JS (index.html), service worker (sw.js), manifest.json,
quran-full.json (verse data), audio/ (recitations), apk-build/ (Android wrapper),
api/ and functions/ (serverless).

## 2. HOW YOU GET ACCESS (no master token, never expires)
You MUST NOT be given the owner's personal access token. Do not ask for one.
Use a DEPLOY KEY instead:

  You generate a keypair locally, email the PUBLIC key only:
    ssh-keygen -t ed25519 -C "<your-agent-id>@naba-quran.app" -f ~/.ssh/naba
    cat ~/.ssh/naba.pub          # send THIS, never the private key

  The owner registers it with WRITE access on this repo only. Revoking it later
  affects nobody else. Deploy keys do not expire.

  Then clone:
    GIT_SSH_COMMAND="ssh -i ~/.ssh/naba" git clone git@github.com:sulimanalhassan123as-code/JuzAmma-pro-Max-.git

If you cannot hold a key, work locally and hand your change to KESTREL as a
patch (git format-patch) plus your identity. KESTREL commits it under your name.

## 3. YOUR IDENTITY (already registered, do not invent a new one)
  naba-ui       ui@naba-quran.app        prefix "ui:"       owns index.html, assets/, icons/, pages/, sw.js, manifest.json
  naba-core     core@naba-quran.app      prefix "core:"     owns audio/, quran-full.json, data/, api/, functions/
  naba-android  android@naba-quran.app   prefix "android:"  owns apk-build/, AndroidManifest.xml, android/
  kestrel       kestrel@neverhide.tech   prefix "sec:"      owns .github/, docs/, registry
  owner         sulimanalhassan.123.as@gmail.com                            everything

Set your git identity before committing:
  git config user.name  "Naba UI Agent"
  git config user.email "ui@naba-quran.app"

## 4. HOW TO COMMIT (mandatory format)
  <prefix> <what changed>

  Agent-ID: <your id>

Example:
  ui: fix verse highlight drift on surah 78

  Agent-ID: naba-ui

Branches: agent/<your-id>/<topic>          e.g. agent/naba-ui/verse-sync
Never commit to main. Never force-push. Never rewrite history.

## 5. WHAT THE GUARD WILL DO TO YOU
`Identity and Scope Guard` runs on every pull request. It FAILS if:
  - your author email is not in AGENT-IDENTITIES.json
  - your message lacks the "Agent-ID:" trailer or the right prefix
  - you touched a file outside your scope
  - you added malformed JSON (the app loads these files directly)
  - you added credential patterns, eval(atob, curl|sh, child_process
  - you committed .jks/.keystore/.p12, local.properties, or an APK

Read the failure, fix it, push again. Do not bypass. Do not edit the workflow,
the registry, or branch protection - those belong to KESTREL.

## 6. HARD RULES
1. Stay inside your scope. Two agents editing one file loses work.
2. Never commit signing material, keystores, passwords, tokens or .env files.
3. Never commit build output: no .apk, .zip, .aab in git. Releases only.
4. Never add a new identity or a new workflow without KESTREL's approval.
5. Never alter quran-full.json text. Verse text is scripture: byte-exact.
   Changing so much as a diacritic is a defect, not a fix.
6. Audio files: do not re-encode or "optimise" existing tracks.
7. Report honestly. If a test fails, say it failed. No success you did not see.
8. Free rail: no paid API calls, no backend functions. bash, curl, git only.

## 7. CURRENT STATE / KNOWN DEBT (do not make it worse)
- index.html is ~0.9 MB in ONE file. Split it, never add to the monolith.
- 15 BACKUP_*.html files sit in the repo root. Do not add more backups; git is the backup.
- Two signed APKs are committed (5 MB each) and should move to Releases.
- Repo is one of six Juz Amma variants. This one is the source of truth.
- Actions was disabled until 2026-11-06; the guard is new. Do not weaken it.

## 8. WHAT TO DO IF YOU ARE BLOCKED
Blocked on access, scope, or a rule that seems wrong: stop and escalate to
KESTREL or the owner. Do not work around the guard. An honest block is fine;
a silent bypass is not.

Reviewed-by: KESTREL (Never Hide)
