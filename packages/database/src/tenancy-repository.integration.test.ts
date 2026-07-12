import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from './client.js';
import { IdempotencyConflictError, JobRepository, VersionConflictError } from './job-repository.js';
import { TenancyRepository } from './tenancy-repository.js';
import { SyncRepository } from './sync-repository.js';
import { TranscriptionRepository } from './transcription-repository.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

suite('TenancyRepository against PostgreSQL', () => {
  const database = createDatabase(databaseUrl ?? 'postgresql://unused');
  const repository = new TenancyRepository(database.db);
  const jobRepository = new JobRepository(database.db);
  const syncRepository = new SyncRepository(database.db);
  const transcriptionRepository = new TranscriptionRepository(database.db);

  beforeAll(async () => {
    await database.db.execute(sql`truncate table invitations, workspace_memberships, identities, users, workspaces cascade`);
  });
  afterAll(() => database.close());

  it('atomically bootstraps one personal workspace and accepts a team invitation', async () => {
    const concurrent = await Promise.all(Array.from({ length: 4 }, () =>
      repository.bootstrapIdentity({ subject: 'auth0|concurrent', email: 'concurrent@example.com' })));
    expect(new Set(concurrent.map((result) => result.user.id))).toHaveLength(1);
    expect(new Set(concurrent.map((result) => result.personalWorkspaceId))).toHaveLength(1);

    const owner = await repository.bootstrapIdentity({ subject: 'auth0|owner', email: 'owner@example.com' });
    const repeated = await repository.bootstrapIdentity({ subject: 'auth0|owner', email: 'owner@example.com' });
    expect(repeated).toEqual(owner);
    expect(owner.workspaces).toHaveLength(1);
    expect(owner.workspaces[0]?.kind).toBe('personal');

    const team = await repository.createTeam(owner.user.id, { name: 'Field crew', timeZone: 'America/Chicago' });
    const invitation = await repository.createInvitation({
      workspaceId: team.id, invitedBy: owner.user.id, email: 'worker@example.com', role: 'worker',
    });
    const worker = await repository.bootstrapIdentity({ subject: 'auth0|worker', email: 'worker@example.com' });
    const membership = await repository.acceptInvitation({ token: invitation.token, userId: worker.user.id, email: 'worker@example.com' });
    expect(membership).toMatchObject({ id: team.id, role: 'worker', kind: 'team' });
    await expect(repository.acceptInvitation({ token: invitation.token, userId: worker.user.id, email: 'worker@example.com' }))
      .rejects.toThrow('invalid or expired');
  });

  it('scopes versioned jobs and atomically records replay, changes, tombstones, and chained audit evidence', async () => {
    const actor = await repository.bootstrapIdentity({ subject: 'auth0|job-owner', email: 'jobs@example.com' });
    const workspaceId = actor.personalWorkspaceId;
    const id = crypto.randomUUID();
    const created = await jobRepository.create({
      workspaceId, actorUserId: actor.user.id, idempotencyKey: 'job-create-00000001', id, name: 'Tower retrofit',
    });
    const replay = await jobRepository.create({
      workspaceId, actorUserId: actor.user.id, idempotencyKey: 'job-create-00000001', id, name: 'Tower retrofit',
    });
    expect(replay).toEqual(created);
    await expect(jobRepository.create({
      workspaceId, actorUserId: actor.user.id, idempotencyKey: 'job-create-00000001', id: crypto.randomUUID(), name: 'Different request',
    })).rejects.toBeInstanceOf(IdempotencyConflictError);

    const updated = await jobRepository.update({
      workspaceId, actorUserId: actor.user.id, idempotencyKey: 'job-update-00000001', id, baseVersion: 1,
      changes: { name: 'Tower retrofit phase 2' },
    });
    expect(updated.version).toBe(2);
    await expect(jobRepository.update({
      workspaceId, actorUserId: actor.user.id, idempotencyKey: 'job-update-stale-01', id, baseVersion: 1,
      changes: { name: 'Stale edit' },
    })).rejects.toBeInstanceOf(VersionConflictError);

    const deleted = await jobRepository.delete({
      workspaceId, actorUserId: actor.user.id, idempotencyKey: 'job-delete-00000001', id, baseVersion: 2,
    });
    expect(deleted.version).toBe(3);
    expect(await jobRepository.list(workspaceId)).toEqual([]);

    const evidence = await database.db.execute(sql`
      select
        (select count(*)::int from workspace_changes where workspace_id = ${workspaceId}) as changes,
        (select count(*)::int from audit_events where workspace_id = ${workspaceId}) as audits,
        (select count(*)::int from entity_tombstones where workspace_id = ${workspaceId} and entity_id = ${id}) as tombstones
    `);
    expect(evidence[0]).toMatchObject({ changes: 3, audits: 3, tombstones: 1 });
    const chain = await database.db.execute(sql`select previous_hash, event_hash from audit_events where workspace_id = ${workspaceId} order by sequence`);
    expect(chain[0]?.previous_hash).toBeNull();
    expect(chain[1]?.previous_hash).toBe(chain[0]?.event_hash);
    expect(chain[2]?.previous_hash).toBe(chain[1]?.event_hash);
    const firstPage = await syncRepository.pull(workspaceId, 0, 2);
    expect(firstPage).toMatchObject({ hasMore: true, changes: [{ sequence: 1 }, { sequence: 2 }] });
    const finalPage = await syncRepository.pull(workspaceId, 2, 2);
    expect(finalPage).toMatchObject({ hasMore: false, changes: [{ sequence: 3, operation: 'delete' }] });

    const other = await repository.bootstrapIdentity({ subject: 'auth0|other', email: 'other@example.com' });
    expect(await jobRepository.list(other.personalWorkspaceId)).toEqual([]);
  });

  it('rolls back the entity, change feed, and idempotency record when audit persistence fails', async () => {
    const actor = await repository.bootstrapIdentity({ subject: 'auth0|rollback', email: 'rollback@example.com' });
    const id = crypto.randomUUID();
    await database.db.execute(sql`create or replace function reject_voiceforge_audit() returns trigger language plpgsql as $$ begin raise exception 'audit rejected'; end $$`);
    await database.db.execute(sql`create trigger reject_voiceforge_audit before insert on audit_events for each row execute function reject_voiceforge_audit()`);
    try {
      await expect(jobRepository.create({
        workspaceId: actor.personalWorkspaceId, actorUserId: actor.user.id,
        idempotencyKey: 'job-rollback-000001', id, name: 'Must roll back',
      })).rejects.toThrow('insert into "audit_events"');
    } finally {
      await database.db.execute(sql`drop trigger reject_voiceforge_audit on audit_events`);
      await database.db.execute(sql`drop function reject_voiceforge_audit()`);
    }
    const residue = await database.db.execute(sql`
      select
        (select count(*)::int from jobs where id = ${id}) as jobs,
        (select count(*)::int from workspace_changes where entity_id = ${id}) as changes,
        (select count(*)::int from idempotency_keys where workspace_id = ${actor.personalWorkspaceId} and key = 'job-rollback-000001') as keys
    `);
    expect(residue[0]).toMatchObject({ jobs: 0, changes: 0, keys: 0 });
  });

  it('persists transcription attempts and completes the voice log without creating consequential records', async () => {
    const actor = await repository.bootstrapIdentity({ subject: 'auth0|transcriber', email: 'transcriber@example.com' });
    const audio = await transcriptionRepository.createAudioObject({
      workspaceId: actor.personalWorkspaceId, actorUserId: actor.user.id, contentType: 'audio/m4a', bytes: 2,
      idempotencyKey: 'audio-create-000001', expiresAt: new Date(Date.now() + 60_000),
    });
    const audioReplay = await transcriptionRepository.createAudioObject({
      workspaceId: actor.personalWorkspaceId, actorUserId: actor.user.id, contentType: 'audio/m4a', bytes: 2,
      idempotencyKey: 'audio-create-000001', expiresAt: new Date(Date.now() + 120_000),
    });
    expect(audioReplay).toEqual(audio);
    const voiceLogId = crypto.randomUUID();
    const job = await transcriptionRepository.createJob({
      workspaceId: actor.personalWorkspaceId, actorUserId: actor.user.id, voiceLogId, audioObjectId: audio.id,
      idempotencyKey: 'transcription-create-001',
    });
    const jobReplay = await transcriptionRepository.createJob({
      workspaceId: actor.personalWorkspaceId, actorUserId: actor.user.id, voiceLogId, audioObjectId: audio.id,
      idempotencyKey: 'transcription-create-001',
    });
    expect(jobReplay).toEqual(job);
    await transcriptionRepository.markProcessing(job.id);
    await transcriptionRepository.complete({ id: job.id, transcript: 'Two hours on site.', confidence: 0.9, provider: 'test', metadata: { requestId: 'one' } });
    expect(await transcriptionRepository.getJob(actor.personalWorkspaceId, job.id)).toMatchObject({ status: 'completed', attemptCount: 1, provider: 'test' });
    await transcriptionRepository.reviewTranscript({
      workspaceId: actor.personalWorkspaceId, voiceLogId, actorUserId: actor.user.id, transcript: 'Two reviewed hours on site.',
      idempotencyKey: 'transcript-review-00001',
    });
    const evidence = await database.db.execute(sql`
      select
        (select transcript from voice_logs where id = ${voiceLogId}) as transcript,
        (select count(*)::int from workspace_changes where workspace_id = ${actor.personalWorkspaceId} and entity_type = 'voice_log') as voice_changes,
        (select count(*)::int from audit_events where workspace_id = ${actor.personalWorkspaceId} and entity_type in ('time_entry', 'safety_report')) as consequential
    `);
    expect(evidence[0]).toEqual({ transcript: 'Two reviewed hours on site.', voice_changes: 2, consequential: 0 });
  });
});
