import { createHash } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { VoiceForgeDatabase } from './client.js';
import { auditEvents, identities, invitations, users, workspaceMemberships, workspaces } from './schema.js';

export interface ExternalIdentity {
  subject: string;
  email?: string;
  displayName?: string;
}

export interface WorkspaceAccess {
  id: string;
  kind: 'personal' | 'team';
  name: string;
  timeZone: string;
  role: 'owner' | 'admin' | 'supervisor' | 'worker' | 'auditor';
}

export interface BootstrapResult {
  user: { id: string; displayName: string | null; primaryEmail: string | null };
  personalWorkspaceId: string;
  workspaces: WorkspaceAccess[];
}

export class TenancyRepository {
  constructor(private readonly db: VoiceForgeDatabase) {}

  async bootstrapIdentity(identity: ExternalIdentity): Promise<BootstrapResult> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${identity.subject}, 0))`);
      const existing = await tx.select({ userId: identities.userId })
        .from(identities)
        .where(and(eq(identities.provider, 'auth0'), eq(identities.providerSubject, identity.subject)))
        .limit(1);

      let userId = existing[0]?.userId;
      if (!userId) {
        userId = crypto.randomUUID();
        await tx.insert(users).values({
          id: userId,
          displayName: identity.displayName,
          primaryEmail: identity.email,
        });
        await tx.insert(identities).values({
          provider: 'auth0', providerSubject: identity.subject, userId, email: identity.email,
        });
        const workspaceId = crypto.randomUUID();
        await tx.insert(workspaces).values({
          id: workspaceId,
          kind: 'personal',
          name: identity.displayName ? `${identity.displayName}'s workspace` : 'Personal workspace',
        });
        await tx.insert(workspaceMemberships).values({
          workspaceId, userId, role: 'owner', status: 'active', joinedAt: new Date(),
        });
      }

      const [user] = await tx.select({ id: users.id, displayName: users.displayName, primaryEmail: users.primaryEmail })
        .from(users).where(eq(users.id, userId)).limit(1);
      if (!user) throw new Error('Identity references a missing user.');

      const access = await tx.select({
        id: workspaces.id, kind: workspaces.kind, name: workspaces.name, timeZone: workspaces.timeZone, role: workspaceMemberships.role,
      }).from(workspaceMemberships)
        .innerJoin(workspaces, eq(workspaceMemberships.workspaceId, workspaces.id))
        .where(and(eq(workspaceMemberships.userId, userId), eq(workspaceMemberships.status, 'active')));
      const personal = access.find((workspace) => workspace.kind === 'personal');
      if (!personal) throw new Error('User has no personal workspace.');
      return { user, personalWorkspaceId: personal.id, workspaces: access };
    });
  }

  async createTeam(userId: string, input: { name: string; timeZone: string }): Promise<WorkspaceAccess> {
    return this.db.transaction(async (tx) => {
      const id = crypto.randomUUID();
      await tx.insert(workspaces).values({ id, kind: 'team', name: input.name, timeZone: input.timeZone });
      await tx.insert(workspaceMemberships).values({ workspaceId: id, userId, role: 'owner', status: 'active', joinedAt: new Date() });
      await recordMembershipAudit(tx, id, userId, 'membership.owner_created', userId, { role: 'owner' });
      return { id, kind: 'team', name: input.name, timeZone: input.timeZone, role: 'owner' };
    });
  }

  async getAccess(userId: string, workspaceId: string): Promise<WorkspaceAccess | null> {
    const [access] = await this.db.select({
      id: workspaces.id, kind: workspaces.kind, name: workspaces.name, timeZone: workspaces.timeZone, role: workspaceMemberships.role,
    }).from(workspaceMemberships)
      .innerJoin(workspaces, eq(workspaceMemberships.workspaceId, workspaces.id))
      .where(and(
        eq(workspaceMemberships.userId, userId), eq(workspaceMemberships.workspaceId, workspaceId), eq(workspaceMemberships.status, 'active'),
      )).limit(1);
    return access ?? null;
  }

  async createInvitation(input: { workspaceId: string; email: string; role: WorkspaceAccess['role']; invitedBy: string }) {
    const id = crypto.randomUUID();
    const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll('-', '');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await this.db.transaction(async (tx) => { await tx.insert(invitations).values({ id, workspaceId: input.workspaceId, email: input.email.toLowerCase(), role: input.role, tokenDigest: createHash('sha256').update(token).digest('hex'), invitedBy: input.invitedBy, expiresAt }); await recordMembershipAudit(tx, input.workspaceId, input.invitedBy, 'membership.invited', null, { invitationId: id, role: input.role }); });
    return { id, workspaceId: input.workspaceId, email: input.email.toLowerCase(), role: input.role, status: 'pending' as const, expiresAt: expiresAt.toISOString(), token };
  }

  async acceptInvitation(input: { token: string; userId: string; email: string }): Promise<WorkspaceAccess> {
    return this.db.transaction(async (tx) => {
      const digest = createHash('sha256').update(input.token).digest('hex');
      const [invitation] = await tx.select().from(invitations).where(eq(invitations.tokenDigest, digest)).limit(1).for('update');
      if (!invitation || invitation.status !== 'pending' || invitation.expiresAt <= new Date()) {
        throw new InvitationAcceptanceError('Invitation is invalid or expired.');
      }
      if (invitation.email !== input.email.toLowerCase()) {
        throw new InvitationAcceptanceError('Invitation belongs to another email address.');
      }
      await tx.update(invitations).set({ status: 'accepted', acceptedBy: input.userId, acceptedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(invitations.id, invitation.id), eq(invitations.status, 'pending')));
      await tx.insert(workspaceMemberships).values({
        workspaceId: invitation.workspaceId, userId: input.userId, role: invitation.role, status: 'active', joinedAt: new Date(),
      }).onConflictDoUpdate({
        target: [workspaceMemberships.workspaceId, workspaceMemberships.userId],
        set: { role: invitation.role, status: 'active', joinedAt: new Date(), updatedAt: new Date() },
      });
      const [access] = await tx.select({
        id: workspaces.id, kind: workspaces.kind, name: workspaces.name, timeZone: workspaces.timeZone, role: workspaceMemberships.role,
      }).from(workspaceMemberships)
        .innerJoin(workspaces, eq(workspaceMemberships.workspaceId, workspaces.id))
        .where(and(eq(workspaceMemberships.userId, input.userId), eq(workspaceMemberships.workspaceId, invitation.workspaceId)))
        .limit(1);
      if (!access) throw new Error('Accepted membership was not persisted.');
      await recordMembershipAudit(tx, invitation.workspaceId, input.userId, 'membership.accepted', input.userId, { role: invitation.role });
      return access;
    });
  }

  async listMembers(workspaceId: string) {
    return this.db.select({
      userId: workspaceMemberships.userId, role: workspaceMemberships.role, status: workspaceMemberships.status,
      displayName: users.displayName, email: users.primaryEmail, joinedAt: workspaceMemberships.joinedAt,
    }).from(workspaceMemberships).innerJoin(users, eq(workspaceMemberships.userId, users.id))
      .where(eq(workspaceMemberships.workspaceId, workspaceId)).orderBy(users.displayName, users.primaryEmail);
  }

  async listInvitations(workspaceId: string) {
    return this.db.select({
      id: invitations.id, email: invitations.email, role: invitations.role, status: invitations.status,
      invitedBy: invitations.invitedBy, expiresAt: invitations.expiresAt, createdAt: invitations.createdAt,
    }).from(invitations).where(eq(invitations.workspaceId, workspaceId)).orderBy(invitations.createdAt);
  }

  async updateMemberRole(input: { workspaceId: string; userId: string; role: WorkspaceAccess['role']; actorUserId?: string }) {
    return this.db.transaction(async (tx) => {
      const [member] = await tx.select().from(workspaceMemberships).where(and(
        eq(workspaceMemberships.workspaceId, input.workspaceId), eq(workspaceMemberships.userId, input.userId),
      )).limit(1).for('update');
      if (!member) throw new Error('Membership not found.');
      if (member.role === 'owner' && input.role !== 'owner') await ensureAnotherOwner(tx, input.workspaceId, input.userId);
      const [updated] = await tx.update(workspaceMemberships).set({ role: input.role, updatedAt: new Date() })
        .where(and(eq(workspaceMemberships.workspaceId, input.workspaceId), eq(workspaceMemberships.userId, input.userId)))
        .returning();
      await recordMembershipAudit(tx, input.workspaceId, input.actorUserId ?? null, 'membership.role_updated', input.userId, { previousRole: member.role, role: input.role });
      return updated!;
    });
  }

  async removeMember(input: { workspaceId: string; userId: string; actorUserId?: string }) {
    await this.db.transaction(async (tx) => {
      const [member] = await tx.select().from(workspaceMemberships).where(and(
        eq(workspaceMemberships.workspaceId, input.workspaceId), eq(workspaceMemberships.userId, input.userId),
      )).limit(1).for('update');
      if (!member) throw new Error('Membership not found.');
      if (member.role === 'owner') await ensureAnotherOwner(tx, input.workspaceId, input.userId);
      await tx.update(workspaceMemberships).set({ status: 'removed', updatedAt: new Date() })
        .where(and(eq(workspaceMemberships.workspaceId, input.workspaceId), eq(workspaceMemberships.userId, input.userId)));
      await recordMembershipAudit(tx, input.workspaceId, input.actorUserId ?? null, 'membership.removed', input.userId, { role: member.role });
    });
  }
}

export class InvitationAcceptanceError extends Error {}

type Transaction = Parameters<Parameters<VoiceForgeDatabase['transaction']>[0]>[0];
async function ensureAnotherOwner(tx: Transaction, workspaceId: string, excludingUserId: string) {
  const rows = await tx.execute(sql`select count(*)::int as count from workspace_memberships where workspace_id = ${workspaceId} and role = 'owner' and status = 'active' and user_id <> ${excludingUserId}`);
  if (Number(rows[0]?.count ?? 0) < 1) throw new Error('A workspace must retain at least one owner.');
}

async function recordMembershipAudit(tx: Transaction, workspaceId: string, actorUserId: string | null, action: string, entityId: string | null, details: Record<string, unknown>) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`audit:${workspaceId}`}, 0))`);
  const [workspace] = await tx.update(workspaces).set({ currentChangeSequence: sql`${workspaces.currentChangeSequence} + 1`, updatedAt: new Date() }).where(eq(workspaces.id, workspaceId)).returning({ sequence: workspaces.currentChangeSequence });
  if (!workspace) throw new Error('Workspace not found.'); const [previous] = await tx.select({ eventHash: auditEvents.eventHash }).from(auditEvents).where(eq(auditEvents.workspaceId, workspaceId)).orderBy(desc(auditEvents.sequence)).limit(1);
  const evidence = { workspaceId, sequence: workspace.sequence, actorUserId, action, entityType: 'membership', entityId, details }; const eventHash = createHash('sha256').update(JSON.stringify({ previousHash: previous?.eventHash ?? null, ...evidence })).digest('hex');
  await tx.insert(auditEvents).values({ id: crypto.randomUUID(), workspaceId, sequence: workspace.sequence, actorUserId, action, entityType: 'membership', entityId, details, previousHash: previous?.eventHash, eventHash });
}
