# Production Acceptance and Staged Migration

This document is the release authority for VoiceForge. A green local audit proves that the source, contracts, migrations, applications, and reference infrastructure agree. It does not substitute for provider, real-device, security, recovery, or operational drills in the target environment.

## Automated source gate

Run from a clean checkout:

```bash
infra/scripts/acceptance-audit.sh
```

The audit performs a frozen install, the complete monorepo lint/type/test/OpenAPI/build gate, Expo Doctor, high-severity dependency audit, Compose validation, shell checks when available, and Terraform formatting/initialization/validation. CI additionally builds all production containers, runs PostgreSQL and Redis integration tests, scans source and images, emits an SBOM, signs immutable image digests, and executes k6 against staging.

## Acceptance matrix

| Requirement | Automated evidence | Required target-environment evidence |
| --- | --- | --- |
| Mobile works without a backend | SQLite repository and offline workflow tests; web export build | iOS and Android airplane-mode create/edit/clock/voice exercise |
| Personal records never become team-visible implicitly | workspace-scoped repository/API tests | two-account, two-workspace sync exercise on real devices |
| Voice never creates time or safety evidence without confirmation | domain, repository, and review-flow tests | microphone, upload, transcript review, explicit conversion exercise |
| Submitted time and safety evidence is immutable | revision and workflow integration tests | supervisor correction/approval and audit comparison exercise |
| Authentication and authorization are tenant-safe | token, role-matrix, and cross-workspace tests | Auth0 magic-link, Apple, Google, refresh rotation, revoked-session exercise |
| Critical safety escalation operates within objectives | escalation worker and delivery retry tests | push and SES delivery, SLA expiry, repeat escalation, and failure drill |
| Billing state is server-authoritative | Stripe signature, ordering, seat, and grace tests | Stripe test-mode checkout, portal, cancellation, seat increase/decrease exercise |
| Recovery meets RPO/RTO objectives | restore script and runbook validation | encrypted RDS point-in-time restore timed and recorded by an operator |
| Infrastructure can roll forward and back safely | Terraform/container/workflow validation | migration preflight, ECS canary, alarm rollback, and prior-image rollback |
| Operational evidence is trustworthy | audit hash-chain and checkpoint tests | audit search, tamper alarm, legal hold, export, webhook replay exercise |

Every target-environment result must record the environment, build digest, operator, UTC timestamp, evidence link, result, and follow-up owner. Failed or missing evidence blocks progression to the next phase.

## External prerequisites

Before staging, provision these outside the repository:

- Auth0 tenant, API audience, native and web applications, allowed callbacks, magic-link connection, Apple and Google credentials.
- Deepgram project and key, plus approved audio-processing and retention settings.
- Stripe account, per-seat product/price, customer portal configuration, webhook endpoint and signing secret.
- AWS account access through CI OIDC, remote Terraform state, DNS zone/domain, SES production access and verified identities.
- Expo project credentials and push configuration; Apple and Google developer enrollment and signing credentials.
- At least two physical devices and two test identities for cross-workspace/offline acceptance.
- On-call recipients who have agreed to the safety drill and understand that VoiceForge is not an emergency service.

Secrets belong in the target secret manager and CI environment, never in Terraform variable files committed to source. Target state access must be encrypted and restricted because secret bootstrap values pass through Terraform state.

## Staged migration

### 1. Internal accounts

Entry: source gate green, staging deployed, Auth0 and provider prerequisites configured. Enable employees only; keep billing and approval enforcement disabled. Exit after seven days with no cross-workspace access, lost outbox mutations, unacknowledged critical alerts, or unreconciled audit-chain failures. Roll back by disabling invitations and restoring the prior application image; do not reverse applied database migrations.

### 2. Personal beta

Entry: internal exit criteria met and airplane-mode/device matrix complete. Admit invited personal users, retain the free entitlement, and monitor sync conflict, transcription failure, and storage-retention metrics. Exit after two stable release cycles and successful subject export/erasure exercises.

### 3. Team beta

Entry: personal beta exit met; membership, job/crew, safety triage, audit, legal hold, export, and webhook exercises green. Admit a small number of teams with named supervisors and on-call contacts. Exit after every team completes time correction and critical-safety drills with no tenant isolation defect.

### 4. Billing shadow mode

Entry: Stripe test and production webhook reconciliation green. Calculate seats and entitlements while allowing mutations regardless of calculated expiry. Compare Stripe, persisted subscription, membership, and usage counts daily. Exit after one full billing period with no unexplained mismatch.

### 5. Approval shadow mode

Entry: team beta stable. Supervisors decide time entries in VoiceForge while the incumbent payroll/evidence process remains authoritative. Reconcile every revision, decision, correction, and export. Exit after two complete payroll cycles with signed owner approval and no overwritten evidence.

### 6. Production enforcement

Entry: all prior exit criteria, security review, backup restore, critical escalation, load test, and rollback drill green. Enable entitlement mutation blocking and make approved VoiceForge evidence operationally authoritative. Keep read/export access during billing grace. Pause new workspace admission on any severity-one security, tenant-isolation, evidence-integrity, safety-delivery, or recovery failure.

## Release decision

Production is approved only when:

1. the source gate passes at the exact immutable image digests being promoted;
2. every acceptance-matrix environment cell has current evidence;
3. the staged phase's entry criteria are signed by engineering and operations;
4. migrations are backward-compatible with the currently deployed applications;
5. dashboards and alerts are quiet or have explicitly accepted exceptions;
6. rollback owners, incident channel, and provider escalation contacts are available.

The deployment and rollback procedure is in `docs/runbooks/deployment.md`; recovery and safety exercises are in `docs/runbooks/backup-restore.md` and `docs/runbooks/critical-safety-drill.md`.
