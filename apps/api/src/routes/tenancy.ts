import { AuthenticationError, AuthorizationError, requirePermission, type TokenVerifier } from '@voiceforge/auth';
import {
  BootstrapResponse,
  AcceptInvitationBody,
  CreateInvitationBody,
  CreateWorkspaceBody,
  IdempotencyKeyHeader,
  InvitationResponse,
  UpdateMemberRoleBody,
  WorkspaceMember,
  WorkspaceSummary,
  type CreateInvitationBody as CreateInvitationInput,
  type AcceptInvitationBody as AcceptInvitationInput,
  type CreateWorkspaceBody as CreateWorkspaceInput,
  type BootstrapResponse as BootstrapOutput,
  type InvitationResponse as InvitationOutput,
  type WorkspaceSummary as WorkspaceOutput,
  type UpdateMemberRoleBody as UpdateMemberRoleInput,
} from '@voiceforge/contracts';
import type { BootstrapResult, TenancyRepository, WorkspaceAccess } from '@voiceforge/database';
import type { FastifyInstance, FastifyRequest } from 'fastify';

export type TenancyStore = Pick<TenancyRepository, 'bootstrapIdentity' | 'createTeam' | 'getAccess' | 'createInvitation' | 'acceptInvitation' | 'listMembers' | 'listInvitations' | 'updateMemberRole' | 'removeMember'>;

export async function identityFor(request: FastifyRequest, verifier: TokenVerifier, store: TenancyStore) {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) throw new AuthenticationError('Bearer token required.');
  const identity = await verifier.verify(authorization.slice('Bearer '.length));
  const session: BootstrapResult = await store.bootstrapIdentity({ subject: identity.subject, ...(identity.email ? { email: identity.email } : {}) });
  return { identity, session };
}

export async function registerTenancyRoutes(app: FastifyInstance, dependencies: { verifier: TokenVerifier; store: TenancyStore }) {
  app.post<{ Headers: { 'idempotency-key': string }; Reply: BootstrapOutput }>('/v1/auth/bootstrap', {
    schema: {
      operationId: 'bootstrapIdentity', tags: ['identity'], headers: IdempotencyKeyHeader,
      response: { 200: BootstrapResponse },
    },
  }, async (request) => (await identityFor(request, dependencies.verifier, dependencies.store)).session);

  app.post<{ Headers: { 'idempotency-key': string }; Body: CreateWorkspaceInput; Reply: WorkspaceOutput }>('/v1/workspaces', {
    schema: {
      operationId: 'createWorkspace', tags: ['workspaces'], headers: IdempotencyKeyHeader, body: CreateWorkspaceBody,
      response: { 201: WorkspaceSummary },
    },
  }, async (request, reply) => {
    const { session } = await identityFor(request, dependencies.verifier, dependencies.store);
    return reply.code(201).send(await dependencies.store.createTeam(session.user.id, request.body));
  });

  app.post<{ Headers: { 'idempotency-key': string }; Params: { workspaceId: string }; Body: CreateInvitationInput; Reply: InvitationOutput }>('/v1/workspaces/:workspaceId/invitations', {
    schema: {
      operationId: 'createInvitation', tags: ['memberships'], headers: IdempotencyKeyHeader,
      params: { type: 'object', required: ['workspaceId'], properties: { workspaceId: { type: 'string', format: 'uuid' } } },
      body: CreateInvitationBody, response: { 201: InvitationResponse },
    },
  }, async (request, reply) => {
    const { session } = await identityFor(request, dependencies.verifier, dependencies.store);
    const { workspaceId } = request.params;
    const access: WorkspaceAccess | null = await dependencies.store.getAccess(session.user.id, workspaceId);
    if (!access) throw new AuthorizationError('membership:manage');
    requirePermission(access.role, 'membership:manage', access.kind);
    const invitation = await dependencies.store.createInvitation({
      workspaceId, email: request.body.email, role: request.body.role, invitedBy: session.user.id,
    });
    return reply.code(201).send(invitation);
  });

  app.post<{ Headers: { 'idempotency-key': string }; Body: AcceptInvitationInput; Reply: WorkspaceOutput }>('/v1/invitations/accept', {
    schema: {
      operationId: 'acceptInvitation', tags: ['memberships'], headers: IdempotencyKeyHeader,
      body: AcceptInvitationBody, response: { 200: WorkspaceSummary },
    },
  }, async (request) => {
    const { identity, session } = await identityFor(request, dependencies.verifier, dependencies.store);
    if (!identity.email || !identity.emailVerified) throw new AuthenticationError('A verified email is required.');
    return dependencies.store.acceptInvitation({ token: request.body.token, userId: session.user.id, email: identity.email });
  });

  app.get<{ Params: { workspaceId: string } }>('/v1/workspaces/:workspaceId/memberships', {
    schema: { operationId: 'listWorkspaceMembers', tags: ['memberships'], params: workspaceIdParams },
  }, async (request) => {
    const { session } = await identityFor(request, dependencies.verifier, dependencies.store);
    const access = await dependencies.store.getAccess(session.user.id, request.params.workspaceId);
    if (!access) throw new AuthorizationError('membership:manage');
    return { data: await dependencies.store.listMembers(access.id), nextCursor: null };
  });

  app.get<{ Params: { workspaceId: string } }>('/v1/workspaces/:workspaceId/invitations', {
    schema: { operationId: 'listWorkspaceInvitations', tags: ['memberships'], params: workspaceIdParams },
  }, async (request) => {
    const { session } = await identityFor(request, dependencies.verifier, dependencies.store);
    const access = await dependencies.store.getAccess(session.user.id, request.params.workspaceId);
    if (!access) throw new AuthorizationError('membership:manage');
    requirePermission(access.role, 'membership:manage', access.kind);
    return { data: await dependencies.store.listInvitations(access.id), nextCursor: null };
  });

  app.patch<{ Headers: { 'idempotency-key': string }; Params: { workspaceId: string; userId: string }; Body: UpdateMemberRoleInput }>('/v1/workspaces/:workspaceId/memberships/:userId', {
    schema: { operationId: 'updateWorkspaceMemberRole', tags: ['memberships'], headers: IdempotencyKeyHeader, params: memberParams, body: UpdateMemberRoleBody },
  }, async (request) => {
    const { session } = await identityFor(request, dependencies.verifier, dependencies.store);
    const access = await dependencies.store.getAccess(session.user.id, request.params.workspaceId);
    if (!access || access.id !== request.body.workspaceId) throw new AuthorizationError('membership:manage');
    requirePermission(access.role, 'membership:manage', access.kind);
    const target = (await dependencies.store.listMembers(access.id)).find((member) => member.userId === request.params.userId);
    if (!target) throw new AuthorizationError('membership:manage');
    if (access.role === 'admin' && (target.role === 'owner' || target.role === 'admin' || request.body.role === 'owner' || request.body.role === 'admin')) throw new AuthorizationError('membership:manage');
    return dependencies.store.updateMemberRole({ workspaceId: access.id, userId: request.params.userId, role: request.body.role, actorUserId: session.user.id });
  });

  app.delete<{ Headers: { 'idempotency-key': string }; Params: { workspaceId: string; userId: string } }>('/v1/workspaces/:workspaceId/memberships/:userId', {
    schema: { operationId: 'removeWorkspaceMember', tags: ['memberships'], headers: IdempotencyKeyHeader, params: memberParams },
  }, async (request, reply) => {
    const { session } = await identityFor(request, dependencies.verifier, dependencies.store);
    const access = await dependencies.store.getAccess(session.user.id, request.params.workspaceId);
    if (!access) throw new AuthorizationError('membership:manage');
    requirePermission(access.role, 'membership:manage', access.kind);
    const target = (await dependencies.store.listMembers(access.id)).find((member) => member.userId === request.params.userId);
    if (!target || (access.role === 'admin' && (target.role === 'owner' || target.role === 'admin'))) throw new AuthorizationError('membership:manage');
    await dependencies.store.removeMember({ workspaceId: access.id, userId: request.params.userId, actorUserId: session.user.id });
    return reply.code(204).send();
  });
}

const workspaceIdParams = { type: 'object', required: ['workspaceId'], properties: { workspaceId: { type: 'string', format: 'uuid' } } } as const;
const memberParams = { type: 'object', required: ['workspaceId', 'userId'], properties: { workspaceId: { type: 'string', format: 'uuid' }, userId: { type: 'string', format: 'uuid' } } } as const;
