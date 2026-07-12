# VoiceForge

VoiceForge is an offline-first Expo application for tradespeople to capture field notes, review transcripts, and deliberately turn them into job, time, and safety records. Consequential records are never created from speech without explicit user confirmation.

This repository implements a production-ready **local-first MVP**. It does not include organizational accounts, supervisor approval, cloud synchronization, or a hosted transcription service.

## Current capabilities

- Dashboard with active job, clock state, current-day hours, safety count, and recent voice logs
- Job browsing, active-job selection, details, audited editing, and protected deletion
- Real microphone recording with permission, interruption, cancellation, and retention handling
- Optional HTTPS transcription endpoint with timeout and response validation
- Offline manual transcript review when automatic transcription is unavailable
- Deterministic, confidence-bearing intent suggestions for time, safety, materials, communication, and notes
- Explicit review screens before voice-derived time or safety records are created
- Reviewed clock-out with editable timestamps, entry type, notes, and cross-midnight support
- SQLite persistence, schema migrations, source provenance, and audit history
- Versioned JSON export, record-level deletion, clear-local-data confirmation, and configurable audio retention
- iOS, Android, and web builds through Expo Router

## Requirements

- Bun 1.3.14 or compatible
- Node.js supported by Expo SDK 54
- Xcode/Android Studio only when producing or testing native builds
- EAS CLI for cloud builds

## Setup

```bash
bun install --frozen-lockfile
cp .env.example .env.local
bun run start
```

`EXPO_PUBLIC_TRANSCRIPTION_API_URL` is optional. Leave it empty for local manual review. Never put a provider secret in an `EXPO_PUBLIC_` variable.

## Commands

```bash
bun run start          # Rork/Expo development server
bun run start-web      # web development server
bun run typecheck      # strict TypeScript check
bun run lint           # Expo ESLint configuration
bun run test           # deterministic unit/repository/component tests
bun run export:web     # production web export to dist/
bun run verify         # typecheck + lint + test + web export
bunx expo-doctor       # Expo/native dependency diagnostics
```

## Architecture

- `app/` contains Expo Router screens and route composition.
- `domain/` contains platform-independent time and confirmation rules.
- `features/voice/` contains recording, retention, transcription, and intent extraction.
- `db/` contains the SQLite migration and repository boundary.
- `providers/AppProvider.tsx` is the application facade consumed by screens.
- `tests/` covers pure rules, repository transactions, migrations, and shared component state.

See [Architecture](docs/ARCHITECTURE.md), [Product scope](docs/PRODUCT.md), [Testing](docs/TESTING.md), [Privacy](docs/PRIVACY.md), and [Release](docs/RELEASE.md).

## Data and transcription

SQLite and native recordings live in application-private device storage. Audio retention is selectable in Account. The versioned JSON export contains structured records and audit history, but does not embed audio files.

When configured, the transcription endpoint receives a multipart `audio` field and must return:

```json
{
  "transcript": "Safety check complete.",
  "confidence": 0.94,
  "provider": "organization-transcriber"
}
```

The mobile app intentionally contains no provider credential. Authentication and server-side retention belong at the organization-controlled endpoint.

## Important limitations

- Single-user and local-first; there is no authenticated synchronization service.
- Web audio uses a browser session blob and does not have the same durable-file semantics as native storage.
- The app assists record creation but is not a payroll authority, safety authority, or emergency reporting system.
- EAS identifiers remain `app.rork.voiceforge`; ownership and store enrollment must be configured before submission.

## Release gate

Do not release unless all of the following pass from a clean checkout:

```bash
bun install --frozen-lockfile
bun run verify
bunx expo-doctor
```

Native release candidates also require real-device microphone tests on both iOS and Android and validation of any configured transcription endpoint.
