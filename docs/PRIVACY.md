# VoiceForge Privacy and Data Retention

VoiceForge is currently a single-user, local-first application. Jobs, transcripts, time entries, safety reports, settings, and audit events are stored in the app's on-device SQLite database. There is no VoiceForge account server or background synchronization service in this repository.

## Microphone and recordings

The microphone is accessed only after the user taps the recording control and grants operating-system permission. Background recording is disabled. Native recordings are copied into the app's private document storage after capture. Canceled and discarded recordings are deleted.

The user chooses a 7-, 30-, or 90-day audio-retention period, or may retain audio until manual deletion. Expiration removes the audio file and clears its URI while preserving the reviewed transcript and audit record. Deleting a voice log also deletes its retained native audio file.

## Transcription transport

Without `EXPO_PUBLIC_TRANSCRIPTION_API_URL`, transcription is manual and audio does not leave the device. When that variable points to a configured HTTPS endpoint, the recorded audio is sent to that endpoint only from the review workflow. The endpoint owner is responsible for authentication, server-side retention, consent, and privacy disclosures. Provider secrets must never be embedded in the app or placed in an `EXPO_PUBLIC_` variable.

## Review, export, and deletion

Voice-derived time and safety records require explicit user confirmation. The original voice-log identifier is retained as provenance in both the record and audit history. Users can export a versioned JSON snapshot containing records and audit events. Clear Local Data permanently removes the SQLite records from the device; record-level deletions remain represented in audit history until all local data is cleared.

VoiceForge is not a payroll, legal-compliance, or emergency-response authority. Organizations adopting it must define retention, access, supervisor approval, incident escalation, and lawful-recordkeeping policies appropriate to their jurisdiction.
