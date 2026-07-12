# VoiceForge Remediation Implementation Plan

> **For agentic workers:** Execute this plan task-by-task. Recommended path:
> dispatch a fresh subagent per task, review each result with `review-quality`,
> then continue. For complex multi-agent splits, use
> `parallel-feature-development`, `team-composition-patterns`, and
> `team-communication-protocols`. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Turn the abandoned visual prototype into a tested, documented, offline-first VoiceForge MVP that records real audio, supports reviewable structured field logs, and builds reproducibly for iOS, Android, and web.

**Architecture:** Expo Router owns navigation; focused feature modules own domain logic; Expo SQLite is the durable source of truth; React context exposes application commands and query results. Audio capture is local-first, while transcription is accessed through a replaceable client that can use a configured HTTPS endpoint or an explicit manual-review fallback without placing provider secrets in the app.

**Tech Stack:** Expo 54, React Native 0.81, TypeScript 5.9, Expo Router, Expo Audio, Expo SQLite, React Query, Vitest, Testing Library, GitHub Actions, EAS Build.

---

## Requirements and acceptance criteria

- [ ] A clean checkout installs with `bun install --frozen-lockfile`.
- [ ] `bun run verify` passes typecheck, lint, unit tests, and web export.
- [ ] The route tree contains usable Dashboard, Jobs, Reports, Voice Logs, and Account surfaces.
- [ ] Jobs, time entries, safety reports, voice logs, and settings survive restart in SQLite.
- [ ] Clocking uses the actual local date and produces a reviewable time entry.
- [ ] Voice capture requests permission, records real audio, handles denial/interruption, and retains or deletes audio deliberately.
- [ ] Every recording enters a review step; no safety or time record is created without user confirmation.
- [ ] Transcription is replaceable, timeout-aware, and functional with a configured endpoint; manual entry remains available offline.
- [ ] Structured extraction is deterministic and confidence-bearing, with user-editable category and target job.
- [ ] Errors, empty states, accessibility labels, and destructive confirmations are present on consequential workflows.
- [ ] CI, EAS profiles, environment examples, privacy/retention documentation, architecture notes, and release instructions exist.
- [ ] No credentials, provider secrets, live-trading behavior, or hidden production mutations are introduced. Live trading is non-applicable to VoiceForge.

## File map

- `app/`: route-only composition and screen boundaries.
- `features/jobs/`: job list/detail presentation and job commands.
- `features/reports/`: safety/time presentation and review forms.
- `features/voice/`: recorder, review screen, transcription client, and extraction.
- `features/clock/`: clock state transitions and time-entry creation.
- `db/`: SQLite schema, migrations, repositories, and seed bootstrap.
- `providers/AppProvider.tsx`: application facade; no direct storage implementation.
- `types/index.ts`: canonical domain entities and command inputs.
- `tests/`: pure domain, repository, and component behavior.
- `docs/`: product scope, architecture, privacy, operations, and release evidence.

## Milestone 0: Preserve the recovered baseline

- [x] Run `bun run typecheck`, `bun run lint`, and `bun run export:web`; expect exit code 0.
- [x] Commit the reconstructed route tree, corrected assets, refreshed lockfile, and baseline scripts as `chore: recover buildable expo baseline`.
- [x] Commit this plan as `docs: add full remediation plan` if it is not included in the baseline commit.

## Milestone 1: Verification harness and domain invariants

- [x] Add Vitest with `test`, `test:watch`, and `verify` scripts. Testing Library is deferred to the component milestone where it is first used.
- [x] Add tests proving duration calculations cross midnight correctly and reject negative durations. Overtime remains an explicit persisted field.
- [x] Add tests proving safety/time derivation requires confirmation and retains source voice-log provenance.
- [x] Implement pure functions under `domain/` until the tests pass.
- [x] Run `bun run verify`; commit as `test: establish domain verification harness`.

## Milestone 2: SQLite source of truth

- [x] Add `expo-sqlite` using the Expo-compatible installer and create a versioned migration runner.
- [x] Define tables for jobs, time entries, safety reports, voice logs, settings, and audit events with foreign keys and ISO timestamps.
- [x] Add repository tests against an in-memory SQLite database for insertion, typed hydration, foreign-key restrictions, one-time seeding, and migration idempotence.
- [x] Replace mock-backed provider state with repository queries and mutations; seed demo data once using a setting marker.
- [x] Persist clock state and replace the hard-coded date with a clock-injected current-date helper.
- [x] Run database tests, typecheck, lint, and export; commit as `feat: add durable sqlite data layer`.

## Milestone 3: Complete navigable product surfaces

- [x] Create Dashboard with active job, current clock state, daily hours, unresolved safety count, and recent voice logs.
- [x] Create Jobs with empty state, active-job selection, and navigation to job details. Status filtering remains part of workflow expansion.
- [x] Keep Reports as safety/time tabs, now driven by SQLite and sorted deterministically.
- [x] Create Voice Logs with category, job context, and processing state presentation. Review navigation lands with Milestone 5.
- [x] Create Account with local profile, versioned JSON export action, and clear-data confirmation. Audio retention lands with Milestone 7.
- [ ] Add component tests for navigation-critical controls. Accessibility labels and roles are present.
- [x] Run repository tests and `bun run verify`; commit as `feat: complete core navigation surfaces`. Interactive browser QA remains pending because the browser harness could not reach the host localhost server.

## Milestone 4: Real audio recording lifecycle

- [ ] Install `expo-audio` at the Expo-supported version and declare microphone permission text in `app.json`.
- [ ] Implement a recorder hook with explicit `idle`, `requesting-permission`, `recording`, `stopping`, `review`, and `error` states.
- [ ] Test reducer transitions for permission denial, double-start prevention, interruption, stop failure, cancel, and successful review handoff.
- [ ] Replace simulated sample transcripts and timers with real recorder calls and visible duration.
- [ ] Copy completed recordings into application document storage; delete canceled or discarded files.
- [ ] Run tests, native config inspection, typecheck, lint, and export; commit as `feat: record and retain real voice notes`.

## Milestone 5: Transcription and mandatory review

- [ ] Define a `TranscriptionClient` returning transcript, provider, confidence, and recoverable error information.
- [ ] Implement a configurable HTTPS client using `EXPO_PUBLIC_TRANSCRIPTION_API_URL`, multipart audio upload, timeout, and response validation; never embed an API key.
- [ ] Provide offline/manual review when no endpoint exists or a request fails.
- [ ] Create a review route where transcript, category, job, and proposed action are editable before save.
- [ ] Add deterministic keyword extraction with confidence and tests for time, safety, materials, note, ambiguous, and empty transcripts.
- [ ] Require explicit confirmation before creating time or safety records; write audit events linking derived records to the voice log.
- [ ] Run tests and `bun run verify`; commit as `feat: add reviewable transcription workflow`.

## Milestone 6: Consequential record workflows

- [ ] Add clock-in/out UI with job selection and a confirmation sheet on clock-out.
- [ ] Calculate elapsed time from timestamps and local time zone; allow correction before writing the time entry.
- [ ] Add safety-report review with severity, description, resolution state, and source provenance.
- [ ] Add edit/delete flows with confirmation and audit events for time, safety, job, and voice records.
- [ ] Add data export to a versioned JSON document including schema version and audit history.
- [ ] Test all domain commands and critical component interactions; commit as `feat: complete reviewed field record workflows` after `bun run verify`.

## Milestone 7: Reliability, privacy, and operational hardening

- [ ] Add an application error boundary, repository error normalization, retry guidance, and safe user-visible errors.
- [ ] Add audio retention settings and cleanup of expired, orphaned, and deleted recordings.
- [ ] Add privacy copy covering microphone use, local storage, configured transcription transport, deletion, and export.
- [ ] Add `eas.json`, `.env.example`, app permission metadata, and separate development/preview/production build profiles.
- [ ] Add GitHub Actions running frozen install and `bun run verify` without production credentials.
- [ ] Run dependency/config diagnostics and document any accepted warnings.
- [ ] Commit as `chore: harden privacy builds and continuous integration`.

## Milestone 8: Documentation and completion audit

- [ ] Replace the generic README with VoiceForge scope, setup, scripts, architecture, platform limitations, and troubleshooting.
- [ ] Add `docs/ARCHITECTURE.md`, `docs/PRIVACY.md`, `docs/TESTING.md`, `docs/RELEASE.md`, and `docs/PRODUCT.md`.
- [ ] Record which features are single-user/local-first and what a future authenticated synchronization service must guarantee.
- [ ] Run a clean temporary-checkout install with the frozen lockfile and full verification gate.
- [ ] Inspect every acceptance criterion above against source, tests, generated config, and build output; mark only evidenced items complete.
- [ ] Commit as `docs: document production-ready local-first mvp`.

## Known external boundary

Automatic speech-to-text requires a user-selected transcription service or deployed compatible endpoint. The app will be complete and usable offline through manual transcript review, and the HTTPS integration will be fully implemented and tested with a mock server. Claiming a particular hosted provider is live requires endpoint ownership and credentials that are intentionally outside this repository.
