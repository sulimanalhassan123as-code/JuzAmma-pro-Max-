# Where build output lives

Build output is never stored in git. It lives in GitHub Releases.

Archive: `apk-archive-v14-v15`
- JuzAmmaProMax-v14-signed.apk
- JuzAmmaProMax-v15-signed.apk
- JuzAmmaProMax-v7-tts-fixed.zip

## Rules
- Push APKs, AABs, AARs and zips to a Release, never to a branch.
- The Identity and Scope Guard rejects `.apk .aab .aar .zip .jks .keystore .p12 .pfx`
  and any `local.properties` or `keystore.properties`.
- Signing material never enters the repository in any form.

Why: a 5MB binary in git stays in history forever, bloats every clone, and
cannot be revoked. A release asset can be deleted.
