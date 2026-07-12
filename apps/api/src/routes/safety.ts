import { AuthenticationError, AuthorizationError, can, requirePermission, type TokenVerifier } from '@voiceforge/auth';
import {
  AssignSafetyReportBody, ConfigureSafetyContactsBody, ConfigureSafetyPolicyBody, CorrectSafetyReportBody, CreateSafetyReportBody, IdempotencyKeyHeader,
  RegisterPushTokenBody, SafetyAcknowledgementBody, SafetyReport, SafetyTransitionBody, SafetyTriageBoard,
  SafetyWorkspaceBody, SilenceSafetyReportBody,
  type AssignSafetyReportBody as AssignInput, type CorrectSafetyReportBody as CorrectInput,
  type ConfigureSafetyContactsBody as ContactsInput, type ConfigureSafetyPolicyBody as PolicyInput,
  type CreateSafetyReportBody as CreateInput, type RegisterPushTokenBody as PushInput,
  type SafetyAcknowledgementBody as AcknowledgeInput, type SafetyReport as SafetyOutput,
  type SafetyTransitionBody as TransitionInput, type SafetyWorkspaceBody as WorkspaceInput,
  type SilenceSafetyReportBody as SilenceInput,
} from '@voiceforge/contracts';
import type { SafetyRecord, SafetyRepository } from '@voiceforge/database';
import type { FastifyInstance } from 'fastify';
import { identityFor, type TenancyStore } from './tenancy.js';

type SafetyStore = Pick<SafetyRepository, 'registerPushToken' | 'configurePolicy' | 'configureContacts' | 'createDraft' | 'submit' | 'acknowledge' | 'transition' | 'correct' | 'assign' | 'silence' | 'listTriage' | 'listDeliveries'>;
export interface SafetyQueue { enqueue(reportId: string, at: Date): Promise<void>; }

export async function registerSafetyRoutes(app: FastifyInstance, dependencies: { verifier: TokenVerifier; tenancy: TenancyStore; repository: SafetyStore; queue: SafetyQueue }) {
  const accessFor = async (request: Parameters<typeof identityFor>[0], workspaceId: string) => {
    const { session } = await identityFor(request, dependencies.verifier, dependencies.tenancy);
    const access = await dependencies.tenancy.getAccess(session.user.id, workspaceId);
    if (!access) throw new AuthorizationError('safety:submit');
    return { session, access };
  };

  app.post<{ Headers: MutationHeaders; Body: PushInput }>('/v1/push-tokens', {
    schema: { operationId: 'registerPushToken', tags: ['devices'], headers: IdempotencyKeyHeader, body: RegisterPushTokenBody, response: { 204: { type: 'null' } } },
  }, async (request, reply) => {
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) throw new AuthenticationError('Bearer token required.');
    const identity = await dependencies.verifier.verify(authorization.slice(7));
    const session = await dependencies.tenancy.bootstrapIdentity({ subject: identity.subject, ...(identity.email ? { email: identity.email } : {}) });
    await dependencies.repository.registerPushToken({ userId: session.user.id, ...request.body });
    return reply.code(204).send();
  });

  app.put<{ Headers: MutationHeaders; Body: PolicyInput }>('/v1/admin/safety-policy', {
    schema: { operationId: 'configureSafetyPolicy', tags: ['safety', 'admin'], headers: IdempotencyKeyHeader, body: ConfigureSafetyPolicyBody },
  }, async (request) => {
    const { session, access } = await accessFor(request, request.body.workspaceId);
    if (access.role !== 'owner' && access.role !== 'admin') throw new AuthorizationError('safety:triage');
    return dependencies.repository.configurePolicy({
      workspaceId: access.id, actorUserId: session.user.id, idempotencyKey: request.headers['idempotency-key'],
      acknowledgementSlaMinutes: request.body.acknowledgementSlaMinutes,
      escalationRepeatMinutes: request.body.escalationRepeatMinutes, emergencyInstructions: request.body.emergencyInstructions,
    });
  });

  app.put<{ Headers: MutationHeaders; Body: ContactsInput }>('/v1/admin/safety-contacts', {
    schema: { operationId: 'configureSafetyContacts', tags: ['safety', 'admin'], headers: IdempotencyKeyHeader, body: ConfigureSafetyContactsBody },
  }, async (request) => {
    const { session, access } = await accessFor(request, request.body.workspaceId);
    if (access.role !== 'owner' && access.role !== 'admin') throw new AuthorizationError('safety:triage');
    return dependencies.repository.configureContacts({
      workspaceId: access.id, actorUserId: session.user.id, idempotencyKey: request.headers['idempotency-key'],
      contacts: request.body.contacts,
    });
  });

  app.post<{ Headers: MutationHeaders; Body: CreateInput; Reply: SafetyOutput }>('/v1/safety-reports', {
    schema: { operationId: 'createSafetyReport', tags: ['safety'], headers: IdempotencyKeyHeader, body: CreateSafetyReportBody, response: { 201: SafetyReport } },
  }, async (request, reply) => {
    const { session, access } = await accessFor(request, request.body.workspaceId);
    if (!can(access.role, 'safety:submit', access.kind) && access.role !== 'owner') throw new AuthorizationError('safety:submit');
    const record = await dependencies.repository.createDraft({
      workspaceId: access.id, actorUserId: session.user.id, idempotencyKey: request.headers['idempotency-key'],
      id: request.body.id, jobId: request.body.jobId, severity: request.body.severity,
      reportType: request.body.reportType, description: request.body.description,
      ...(request.body.location ? { location: request.body.location } : {}), occurredAt: new Date(request.body.occurredAt),
    });
    return reply.code(201).send(serialize(record));
  });

  app.post<{ Headers: MutationHeaders; Params: SafetyParams; Body: WorkspaceInput; Reply: SafetyOutput }>('/v1/safety-reports/:safetyReportId/submit', {
    schema: { operationId: 'submitSafetyReport', tags: ['safety'], headers: IdempotencyKeyHeader, params: reportParams, body: SafetyWorkspaceBody, response: { 200: SafetyReport } },
  }, async (request) => {
    const { session, access } = await accessFor(request, request.body.workspaceId);
    const record = await dependencies.repository.submit({ workspaceId: access.id, actorUserId: session.user.id, idempotencyKey: request.headers['idempotency-key'], id: request.params.safetyReportId });
    if (record.nextEscalationAt) await dependencies.queue.enqueue(record.id, record.nextEscalationAt);
    return serialize(record);
  });

  app.post<{ Headers: MutationHeaders; Params: SafetyParams; Body: AcknowledgeInput; Reply: SafetyOutput }>('/v1/safety-reports/:safetyReportId/acknowledgements', {
    schema: { operationId: 'acknowledgeSafetyReport', tags: ['safety'], headers: IdempotencyKeyHeader, params: reportParams, body: SafetyAcknowledgementBody, response: { 200: SafetyReport } },
  }, async (request) => {
    const { session, access } = await accessFor(request, request.body.workspaceId);
    requirePermission(access.role, 'safety:triage', access.kind);
    return serialize(await dependencies.repository.acknowledge({
      workspaceId: access.id, actorUserId: session.user.id, idempotencyKey: request.headers['idempotency-key'], id: request.params.safetyReportId,
      ...(request.body.note ? { note: request.body.note } : {}),
    }));
  });

  app.post<{ Headers: MutationHeaders; Params: SafetyParams; Body: TransitionInput; Reply: SafetyOutput }>('/v1/safety-reports/:safetyReportId/transitions', {
    schema: { operationId: 'transitionSafetyReport', tags: ['safety'], headers: IdempotencyKeyHeader, params: reportParams, body: SafetyTransitionBody, response: { 200: SafetyReport } },
  }, async (request) => {
    const { session, access } = await accessFor(request, request.body.workspaceId);
    requirePermission(access.role, 'safety:triage', access.kind);
    return serialize(await dependencies.repository.transition({ workspaceId: access.id, actorUserId: session.user.id, idempotencyKey: request.headers['idempotency-key'], id: request.params.safetyReportId, status: request.body.status }));
  });

  app.post<{ Headers: MutationHeaders; Params: SafetyParams; Body: CorrectInput; Reply: SafetyOutput }>('/v1/safety-reports/:safetyReportId/corrections', {
    schema: { operationId: 'correctSafetyReport', tags: ['safety'], headers: IdempotencyKeyHeader, params: reportParams, body: CorrectSafetyReportBody, response: { 200: SafetyReport } },
  }, async (request) => {
    const { session, access } = await accessFor(request, request.body.workspaceId);
    return serialize(await dependencies.repository.correct({
      workspaceId: access.id, actorUserId: session.user.id, idempotencyKey: request.headers['idempotency-key'], id: request.params.safetyReportId,
      severity: request.body.severity, reportType: request.body.reportType, description: request.body.description,
      ...(request.body.location ? { location: request.body.location } : {}), occurredAt: new Date(request.body.occurredAt),
      reason: request.body.reason, allowOtherReporter: can(access.role, 'safety:triage', access.kind),
    }));
  });

  app.post<{ Headers: MutationHeaders; Params: SafetyParams; Body: AssignInput; Reply: SafetyOutput }>('/v1/safety-reports/:safetyReportId/assignments', {
    schema: { operationId: 'assignSafetyReport', tags: ['safety'], headers: IdempotencyKeyHeader, params: reportParams, body: AssignSafetyReportBody, response: { 200: SafetyReport } },
  }, async (request) => {
    const { session, access } = await accessFor(request, request.body.workspaceId);
    requirePermission(access.role, 'safety:triage', access.kind);
    return serialize(await dependencies.repository.assign({ workspaceId: access.id, actorUserId: session.user.id, idempotencyKey: request.headers['idempotency-key'], id: request.params.safetyReportId, assignedTo: request.body.assignedTo }));
  });

  app.post<{ Headers: MutationHeaders; Params: SafetyParams; Body: SilenceInput; Reply: SafetyOutput }>('/v1/admin/safety-reports/:safetyReportId/silence', {
    schema: { operationId: 'silenceSafetyEscalation', tags: ['safety', 'admin'], headers: IdempotencyKeyHeader, params: reportParams, body: SilenceSafetyReportBody, response: { 200: SafetyReport } },
  }, async (request) => {
    const { session, access } = await accessFor(request, request.body.workspaceId);
    if (access.role !== 'owner' && access.role !== 'admin') throw new AuthorizationError('safety:triage');
    return serialize(await dependencies.repository.silence({ workspaceId: access.id, actorUserId: session.user.id, idempotencyKey: request.headers['idempotency-key'], id: request.params.safetyReportId, reason: request.body.reason }));
  });

  app.get<{ Querystring: { workspaceId: string }; Reply: { data: SafetyOutput[]; nextCursor: null } }>('/v1/safety-reports', {
    schema: { operationId: 'listSafetyTriageBoard', tags: ['safety'], querystring: workspaceQuery, response: { 200: SafetyTriageBoard } },
  }, async (request) => {
    const { access } = await accessFor(request, request.query.workspaceId);
    requirePermission(access.role, 'safety:triage', access.kind);
    return { data: (await dependencies.repository.listTriage(access.id)).map(serialize), nextCursor: null };
  });

  app.get<{ Querystring: { workspaceId: string } }>('/v1/admin/delivery-diagnostics', {
    schema: { operationId: 'listDeliveryDiagnostics', tags: ['admin', 'notifications'], querystring: workspaceQuery },
  }, async (request) => {
    const { access } = await accessFor(request, request.query.workspaceId);
    requirePermission(access.role, 'safety:triage', access.kind);
    return {
      data: (await dependencies.repository.listDeliveries(access.id)).map((delivery) => ({
        ...delivery,
        destination: delivery.channel === 'email'
          ? delivery.destination.replace(/^(.).+(@.+)$/, '$1***$2')
          : `${delivery.destination.slice(0, 12)}…`,
      })),
      nextCursor: null,
    };
  });
}

type MutationHeaders = { 'idempotency-key': string };
type SafetyParams = { safetyReportId: string };
const reportParams = { type: 'object', required: ['safetyReportId'], properties: { safetyReportId: { type: 'string', format: 'uuid' } } } as const;
const workspaceQuery = { type: 'object', required: ['workspaceId'], properties: { workspaceId: { type: 'string', format: 'uuid' } } } as const;
const serialize = (record: SafetyRecord): SafetyOutput => ({
  ...record, occurredAt: new Date(record.occurredAt).toISOString(), submittedAt: iso(record.submittedAt),
  acknowledgementDueAt: iso(record.acknowledgementDueAt), acknowledgedAt: iso(record.acknowledgedAt),
  nextEscalationAt: iso(record.nextEscalationAt), escalationSilencedAt: iso(record.escalationSilencedAt),
  createdAt: new Date(record.createdAt).toISOString(), updatedAt: new Date(record.updatedAt).toISOString(),
});
const iso = (value: Date | null) => value ? new Date(value).toISOString() : null;
