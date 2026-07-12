# VoiceForge Product Scope

## User and problem

The MVP serves an individual field worker who needs to preserve job context while their hands and attention are occupied. It reduces the friction of capturing a note, but keeps the worker responsible for reviewing structured records.

## Supported journeys

1. Select an active job.
2. Record a real voice note.
3. Receive an optional transcript or enter one manually.
4. Correct the transcript, target job, and category.
5. Save a voice log.
6. If time or safety intent is detected, explicitly confirm a second structured form.
7. Review, edit, export, or delete local records with audit history.

Clocking is a separate supported journey: clock in against the active job, then review start/end timestamps, type, notes, and calculated duration before clock-out is committed.

## Non-goals for the local MVP

- Multi-user accounts and organization administration
- Cloud backup or synchronization
- Supervisor approval and payroll submission
- Automated emergency notification
- Inventory purchasing or client messaging
- A bundled speech-to-text vendor or embedded provider secret
- Live trading or financial-market execution; this domain is non-applicable to VoiceForge

## Product invariants

- A transcript is evidence to review, not an authoritative record.
- Time and safety records require explicit confirmation.
- Source voice provenance survives structured-record creation.
- Offline/manual use remains functional without a transcription endpoint.
- Deletion and correction are visible in audit history until all local data is cleared.
