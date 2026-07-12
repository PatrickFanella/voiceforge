# Production backend

VoiceForge is being implemented as a contract-first TypeScript platform. Node.js 22 runs deployable services; Bun installs and orchestrates the workspace.

## Implemented foundation

- Fastify `/v1` API with generated OpenAPI, request IDs, a stable public error envelope, health checks, and graceful shutdown
- TypeBox contracts shared independently of HTTP handlers
- Drizzle/PostgreSQL schema and migration for users, identities, devices, personal/team workspaces, memberships, invitations, jobs, workspace change feeds, tombstones, idempotency records, and hash-chained audit events
- Tenant-oriented indexes and foreign keys, including workspace-scoped change and audit sequences
- Docker Compose dependencies for PostgreSQL, Redis, S3-compatible MinIO, and Mailpit
- Auth0 RS256 access-token validation with strict issuer, audience, algorithm, and expiry checks
- Idempotent first-login creation of one private personal workspace, protected by a PostgreSQL advisory transaction lock
- Team creation, workspace-scoped role policies, opaque invitation tokens stored only as SHA-256 digests, and transactional invitation acceptance
- Workspace-scoped job CRUD with optimistic versions, tombstones, monotonic change-feed records, idempotent mutation replay, and hash-chained audit events in one PostgreSQL transaction
- Workspace-bound signed sync cursors, paginated delta feeds, per-mutation replay/conflict results, and a mobile SQLite outbox that survives network failure and replica rebuilds
- Private presigned audio uploads, durable transcription jobs, BullMQ retry/recovery workers, and a replaceable Deepgram provider adapter
- Cross-midnight clock sessions, immutable time revisions, team approval/correction queues, owner adjustments, and versioned JSON/CSV evidence exports

The schema is intentionally expanded milestone by milestone. Workflow tables for voice, time approval, safety triage, billing, notifications, exports, webhooks, retention, and legal holds are added with their corresponding domain behavior rather than as unused placeholders.

## Local development

```bash
cp .env.example .env
bun install --frozen-lockfile
bun run dev:dependencies
bun run db:migrate
bun run --cwd apps/api dev
```

The API listens on port 3000 by default. OpenAPI UI is at `/documentation`; the machine-readable committed contract is `apps/api/openapi.json`.

Auth0 supplies identity only. Roles, invitations, memberships, and workspace access are loaded from PostgreSQL on protected requests. A matching email address does not implicitly link two Auth0 subjects; account linking must occur in Auth0 and produce the canonical subject. Invitation acceptance requires a verified token email matching the invitation.

Job mutations acquire transaction-scoped advisory locks for idempotency keys and workspace audit sequencing. Reusing a key with the same request returns the original result; reusing it for a different request is rejected. A stale `baseVersion` returns `VERSION_CONFLICT`. Deletes retain a tombstone and audit evidence. If audit insertion fails, the entity mutation, change-feed record, and idempotency record roll back together.

Mobile synchronization always pushes its outbox before pulling deltas. Pull changes and outbox acknowledgements are applied in one SQLite transaction. Conflicting local mutations remain queued with the corresponding server change payload for explicit resolution. A rebuild deletes only acknowledged synchronized replicas; local and pending records are preserved before replaying the feed from sequence zero.

Audio uploads are signed for fifteen minutes and bind content type and length. AWS deployments additionally require SSE-S3; local MinIO omits that unsupported development header. Workers validate stored type and length before invoking the provider, retry transient failures with exponential backoff, mark exhausted or invalid jobs failed, and periodically recover durable queued rows missing from Redis. Completion and manual transcript review enter the workspace change feed. A transcript never creates time or safety evidence automatically.

Time entries preserve every submitted correction as a numbered revision. Team submissions create a pending approval; supervisors may approve, reject with a reason, or request correction. Workers correct into a new draft revision and resubmit. Approved evidence changes only through a reason-bearing owner adjustment, which creates another revision and approval record. Personal workspaces self-finalize without entering the team approval workflow. Offline mobile drafts can sync, but submission and decisions remain server-authoritative.

## Migration policy

Production changes follow expand, migrate, contract sequencing. Generated SQL is reviewed and committed. Deployments run migration preflight separately from application startup; containers never mutate the schema implicitly. Destructive contract migrations require evidence that all running application versions have stopped using the old shape.
