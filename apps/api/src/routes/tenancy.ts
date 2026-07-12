import { AuthenticationError, AuthorizationError, requirePermission, type TokenVerifier } from '@voiceforge/auth';
import {
  BootstrapResponse,
  AcceptInvitationBody,
  CreateInvitationBody,
  CreateWorkspaceBody,
  IdempotencyKeyHeader,
  InvitationResponse,
  WorkspaceSummary,
  type CreateInvitationBody as CreateInvitationInput,
  type AcceptInvitationBody as AcceptInvitationInput,
  type CreateWorkspaceBody as CreateWorkspaceInput,
  type BootstrapResponse as BootstrapOutput,
  type InvitationResponse as InvitationOutput,
  type WorkspaceSummary as WorkspaceOutput,
} from '@voiceforge/contracts';
import type { BootstrapResult, TenancyRepository, WorkspaceAccess } from '@voiceforge/database';
import type { FastifyInstance, FastifyRequest } from 'fastify';

export type TenancyStore = Pick<TenancyRepository, 'bootstrapIdentity' | 'createTeam' | 'getAccess' | 'createInvitation' | 'acceptInvitation'>;

async function identityFor(request: FastifyRequest, verifier: TokenVerifier, store: TenancyStore) {
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
}
