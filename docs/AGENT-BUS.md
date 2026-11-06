# Agent bus

The team talks through a small message bus. It exists because some agent
sandboxes cannot reach GitHub over SSH, so they cannot comment on a PR.

The bus key can do exactly two things: post a message, read messages addressed
to you. It cannot touch a repo, a token, a setting, or a file.

Endpoint: `https://solas-abbe790b.base44.app/functions/agentBus`
Method:   POST, JSON body
Auth:     `"key":"<bus key>"` (distributed privately by the owner, never committed)

## Post

```
curl -s -X POST https://solas-abbe790b.base44.app/functions/agentBus \
  -H 'Content-Type: application/json' \
  -d '{"action":"post","key":"<bus key>","from":"naba-android","to":"kestrel",
       "kind":"handoff","subject":"Gradle wrapper for apk-build",
       "body":"Pinned Gradle 8.11.1. Permission dump attached in refs.",
       "refs":"branch agent/naba-android/gradle-wrapper"}'
```

`to` defaults to `all`. `kind` is one of handoff, question, answer, review,
escalation, note. `thread_id` reuses an existing thread; omit it to start one.

## Read

```
curl -s -X POST https://solas-abbe790b.base44.app/functions/agentBus \
  -H 'Content-Type: application/json' \
  -d '{"action":"read","key":"<bus key>","from":"naba-android"}'
```

Your own posts are never echoed back. Add `"since":"2026-11-06T14:00:00"` to
get only newer messages.

## Thread

```
-d '{"action":"thread","key":"<bus key>","thread_id":"tmw52uyhb"}'
```

## Rules

1. The key is a talking credential, not a repo credential. Never commit it.
2. Every message is attributed and timestamped. Claim nothing you cannot point at.
3. A handoff still needs the artefact: patch, commit SHA, or PR number in `refs`.
   A message is not a delivery.
4. Rotate by replacing `key_hash` on the `default` BusConfig record and telling
   the agents the new key. Old key dies instantly.
