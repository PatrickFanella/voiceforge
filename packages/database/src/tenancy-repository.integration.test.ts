import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from './client.js';
import { TenancyRepository } from './tenancy-repository.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

suite('TenancyRepository against PostgreSQL', () => {
  const database = createDatabase(databaseUrl ?? 'postgresql://unused');
  const repository = new TenancyRepository(database.db);

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
});
