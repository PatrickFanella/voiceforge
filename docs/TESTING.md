# VoiceForge Testing

## Automated gate

`bun run verify` is the required local and CI gate. It runs strict TypeScript, ESLint, Vitest, and a production web export. Repository tests use an in-memory SQLite adapter and exercise real migration SQL, foreign keys, confirmation checks, audit events, clock-out atomicity, export, and clear behavior.

Pure tests cover time arithmetic, cross-midnight work, voice confirmation, intent extraction, transcription validation, recorder transitions, error normalization, and retention selection. Shared loading/error rendering has a renderer smoke test. React 19 currently prints a deprecation notice for `react-test-renderer`; this is accepted until React Native's supported replacement is available and does not fail the gate.

## Manual native matrix

Before preview or production promotion, test on at least one supported iPhone and Android device:

- First microphone permission grant and denial
- Start, stop, discard, and retain recording
- Phone/audio interruption while recording
- Recording with Bluetooth and device microphone
- Automatic transcription success, timeout, invalid response, and offline fallback
- Manual transcript, category, and job correction
- Confirm and skip voice-derived time/safety records
- Clock-out correction and cross-midnight entry
- App termination/relaunch persistence
- Audio expiration and voice-log deletion
- JSON export and destructive clear confirmation
- Dynamic text, screen-reader labels, and small-screen scrolling

## Browser QA

The production web bundle is part of the automated gate. Interactive localhost browser automation was unavailable in the development harness because its isolated browser could not reach the host server. Run the five-tab smoke flow in a reachable browser before web deployment: Home, Jobs, Reports, Voice, Account, followed by manual voice entry and JSON export.
