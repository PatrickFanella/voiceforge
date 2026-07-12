import { and, eq, sql } from 'drizzle-orm';
import type { VoiceForgeDatabase } from './client.js';
import { identities, invitations, users, workspaceMemberships, workspaces } from './schema.js';

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
    await this.db.insert(invitations).values({
      id, workspaceId: input.workspaceId, email: input.email.toLowerCase(), role: input.role,
      tokenDigest: createHash('sha256').update(token).digest('hex'), invitedBy: input.invitedBy, expiresAt,
    });
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
      return access;
    });
  }
}

export class InvitationAcceptanceError extends Error {}
import { createHash } from 'node:crypto';
