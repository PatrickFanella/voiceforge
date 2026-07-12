# VoiceForge Release Guide

## Profiles

`eas.json` defines development, internal preview, and production profiles. Production uses remote app-version management and auto-increment. No production credential is stored in the repository.

## Preflight

```bash
bun install --frozen-lockfile
bun run verify
bunx expo install --check
bunx expo-doctor
```

Confirm the working tree is clean, review dependency changes, and complete the native manual matrix in `docs/TESTING.md`.

## Build

```bash
eas build --profile preview --platform all
eas build --profile production --platform ios
eas build --profile production --platform android
```

Store submission additionally requires Apple/Google developer enrollment, verified bundle/package ownership, screenshots, privacy disclosures, support URLs, content ratings, signing credentials, and a deliberate final version. These are external release prerequisites and are not represented as completed by a successful source build.

## Transcription deployment

For automatic transcription, deploy an organization-controlled HTTPS endpoint matching the documented response contract. Keep provider secrets on the server. Validate authentication, size limits, timeout behavior, logs, deletion, regional processing, and retention before setting `EXPO_PUBLIC_TRANSCRIPTION_API_URL` in an EAS environment.

## Rollback

Do not roll back the SQLite database file independently of the application. Release migrations are forward-only. If a candidate fails before store promotion, retain the prior binary/channel. For a shipped regression, issue a forward fix that can read the current schema and preserve user exports.
