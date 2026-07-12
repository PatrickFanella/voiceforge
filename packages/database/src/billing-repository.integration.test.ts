import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BillingRepository } from './billing-repository.js';
import { createDatabase } from './client.js';
import { TenancyRepository } from './tenancy-repository.js';

const databaseUrl = process.env.TEST_DATABASE_URL; const suite = databaseUrl ? describe : describe.skip;
suite('BillingRepository against PostgreSQL', () => {
  const database = createDatabase(databaseUrl ?? 'postgresql://unused'); const tenancy = new TenancyRepository(database.db); const billing = new BillingRepository(database.db);
  beforeAll(async () => { await database.db.execute(sql`truncate table invitations, workspace_memberships, identities, users, workspaces cascade`); }); afterAll(() => database.close());
  it('deduplicates events and ignores older subscription snapshots', async () => {
    const owner = await tenancy.bootstrapIdentity({ subject: 'auth0|billing-owner', email: 'billing@example.com' }); const team = await tenancy.createTeam(owner.user.id, { name: 'Billing crew', timeZone: 'UTC' });
    const snapshot = { customerId: 'cus_billing', subscriptionId: 'sub_billing', itemId: 'si_billing', priceId: 'price_team', status: 'active' as const, quantity: 4, currentPeriodEnd: new Date('2027-01-01T00:00:00Z'), cancelAtPeriodEnd: false };
    expect(await billing.reconcile({ id: 'evt_new', type: 'customer.subscription.updated', created: new Date('2026-10-01T00:00:00Z'), workspaceId: team.id, snapshot })).toEqual({ duplicate: false, stale: false });
    expect(await billing.reconcile({ id: 'evt_new', type: 'customer.subscription.updated', created: new Date('2026-10-01T00:00:00Z'), workspaceId: team.id, snapshot })).toEqual({ duplicate: true, stale: false });
    expect(await billing.reconcile({ id: 'evt_old', type: 'customer.subscription.updated', created: new Date('2026-09-01T00:00:00Z'), workspaceId: team.id, snapshot: { ...snapshot, quantity: 1 } })).toEqual({ duplicate: false, stale: true });
    expect((await billing.get(team.id)).subscription?.seatQuantity).toBe(4);
  });
});
