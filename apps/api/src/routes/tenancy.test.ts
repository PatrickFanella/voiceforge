import type { TokenVerifier } from '@voiceforge/auth';
import type { BootstrapResult, WorkspaceAccess } from '@voiceforge/database';
import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app.js';
import type { TenancyStore } from './tenancy.js';

const userId = '01980f58-9b8d-7000-8000-000000000001';
const personalId = '01980f58-9b8d-7000-8000-000000000002';
const teamId = '01980f58-9b8d-7000-8000-000000000003';
const unknownId = '01980f58-9b8d-7000-8000-000000000004';
const key = 'mutation-key-00000001';

const verifier: TokenVerifier = {
  verify: async (token) => {
    if (token !== 'valid') throw new Error('invalid token');
    return { subject: 'auth0|user', email: 'owner@example.com', emailVerified: true };
  },
};

function fixture(role: WorkspaceAccess['role'] = 'owner') {
  const personal: WorkspaceAccess = { id: personalId, kind: 'personal', name: 'Personal', timeZone: 'UTC', role: 'owner' };
  const team: WorkspaceAccess = { id: teamId, kind: 'team', name: 'Crew', timeZone: 'America/Chicago', role };
  const bootstrap: BootstrapResult = {
    user: { id: userId, displayName: null, primaryEmail: 'owner@example.com' },
    personalWorkspaceId: personalId,
    workspaces: [personal, team],
  };
  const invitations: unknown[] = [];
  const store: TenancyStore = {
    bootstrapIdentity: async () => bootstrap,
    createTeam: async (_actor, input) => ({ id: unknownId, kind: 'team', role: 'owner', ...input }),
    getAccess: async (_actor, workspaceId) => workspaceId === personalId ? personal : workspaceId === teamId ? team : null,
    createInvitation: async (input) => {
      const invitation = { id: crypto.randomUUID(), ...input, status: 'pending' as const, expiresAt: new Date(Date.now() + 1000).toISOString(), token: 'invite-token-00000000000000000000000000000000' };
      invitations.push(invitation);
      return invitation;
    },
    acceptInvitation: async () => team,
    listMembers: async () => [], listInvitations: async () => [],
    updateMemberRole: async () => ({ workspaceId: teamId, userId, role: 'worker' as const, status: 'active' as const, joinedAt: null, createdAt: new Date(), updatedAt: new Date() }),
    removeMember: async () => undefined,
  };
  return { store, invitations };
}

const authHeaders = { authorization: 'Bearer valid', 'idempotency-key': key };

describe('identity and tenancy routes', () => {
  it('bootstraps a personal workspace idempotently through the tenancy boundary', async () => {
    const { store } = fixture();
    const app = await buildApp({ verifier, tenancy: store });
    const first = await app.inject({ method: 'POST', url: '/v1/auth/bootstrap', headers: authHeaders });
    const second = await app.inject({ method: 'POST', url: '/v1/auth/bootstrap', headers: authHeaders });
    expect(first.statusCode).toBe(200);
    expect(second.json()).toEqual(first.json());
    expect(first.json()).toMatchObject({ user: { id: userId }, personalWorkspaceId: personalId });
    await app.close();
  });

  it('requires an idempotency key on team creation', async () => {
    const { store } = fixture();
    const app = await buildApp({ verifier, tenancy: store });
    const response = await app.inject({
      method: 'POST', url: '/v1/workspaces', headers: { authorization: 'Bearer valid' },
      payload: { name: 'Night crew', timeZone: 'America/Chicago' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('BAD_REQUEST');
    await app.close();
  });

  it('creates team workspaces for an authenticated individual', async () => {
    const { store } = fixture();
    const app = await buildApp({ verifier, tenancy: store });
    const response = await app.inject({
      method: 'POST', url: '/v1/workspaces', headers: authHeaders,
      payload: { name: 'Night crew', timeZone: 'America/Chicago' },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ kind: 'team', role: 'owner', name: 'Night crew' });
    await app.close();
  });

  it('denies invitations across workspaces, from personal workspaces, and for workers', async () => {
    for (const [role, workspaceId] of [['owner', unknownId], ['owner', personalId], ['worker', teamId]] as const) {
      const { store, invitations } = fixture(role);
      const app = await buildApp({ verifier, tenancy: store });
      const response = await app.inject({
        method: 'POST', url: `/v1/workspaces/${workspaceId}/invitations`, headers: authHeaders,
        payload: { email: 'new@example.com', role: 'worker' },
      });
      expect(response.statusCode).toBe(403);
      expect(invitations).toHaveLength(0);
      await app.close();
    }
  });

  it('allows an authorized team owner to invite a member', async () => {
    const { store } = fixture('owner');
    const app = await buildApp({ verifier, tenancy: store });
    const response = await app.inject({
      method: 'POST', url: `/v1/workspaces/${teamId}/invitations`, headers: authHeaders,
      payload: { email: 'NEW@example.com', role: 'worker' },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ workspaceId: teamId, role: 'worker', status: 'pending' });
    expect(response.json()).not.toHaveProperty('token');
    await app.close();
  });

  it('accepts an invitation into the authenticated user account', async () => {
    const { store } = fixture('worker');
    const app = await buildApp({ verifier, tenancy: store });
    const response = await app.inject({
      method: 'POST', url: '/v1/invitations/accept', headers: authHeaders,
      payload: { token: 'invite-token-00000000000000000000000000000000' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id: teamId, kind: 'team', role: 'worker' });
    await app.close();
  });

  it('lists and updates members for team administrators', async () => {
    const { store } = fixture('admin');
    store.listMembers = vi.fn(async () => [{ userId, role: 'worker' as const, status: 'active' as const, displayName: null, email: 'worker@example.com', joinedAt: new Date() }]);
    store.updateMemberRole = vi.fn(async () => ({ workspaceId: teamId, userId, role: 'worker' as const, status: 'active' as const, joinedAt: null, createdAt: new Date(), updatedAt: new Date() }));
    const app = await buildApp({ verifier, tenancy: store });
    const listed = await app.inject({ method: 'GET', url: `/v1/workspaces/${teamId}/memberships`, headers: authHeaders });
    const updated = await app.inject({ method: 'PATCH', url: `/v1/workspaces/${teamId}/memberships/${userId}`, headers: authHeaders, payload: { workspaceId: teamId, role: 'worker' } });
    expect(listed.statusCode).toBe(200);
    expect(updated.statusCode).toBe(200);
    expect(store.updateMemberRole).toHaveBeenCalledWith({ workspaceId: teamId, userId, role: 'worker', actorUserId: userId });
    await app.close();
  });
});
