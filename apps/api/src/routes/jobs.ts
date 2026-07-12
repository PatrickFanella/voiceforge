import { AuthorizationError, requirePermission, type TokenVerifier } from '@voiceforge/auth';
import { CreateJobBody, DeleteJobBody, IdempotencyKeyHeader, Job, JobList, UpdateJobBody, type CreateJobBody as CreateJobInput, type DeleteJobBody as DeleteJobInput, type Job as JobOutput, type UpdateJobBody as UpdateJobInput } from '@voiceforge/contracts';
import type { JobRepository, TenancyRepository } from '@voiceforge/database';
import type { FastifyInstance } from 'fastify';
import { identityFor, type TenancyStore } from './tenancy.js';

type JobStore = Pick<JobRepository, 'list' | 'create' | 'update' | 'delete' | 'listMembers' | 'assignMember' | 'removeMember'>;

export async function registerJobRoutes(app: FastifyInstance, dependencies: {
  verifier: TokenVerifier;
  tenancy: TenancyStore;
  jobs: JobStore;
}) {
  const accessFor = async (request: Parameters<typeof identityFor>[0], workspaceId: string) => {
    const { session } = await identityFor(request, dependencies.verifier, dependencies.tenancy);
    const access = await dependencies.tenancy.getAccess(session.user.id, workspaceId);
    if (!access) throw new AuthorizationError('job:manage');
    return { session, access };
  };

  app.get<{ Params: { workspaceId: string }; Reply: { data: JobOutput[]; nextCursor: null } }>('/v1/workspaces/:workspaceId/jobs', {
    schema: {
      operationId: 'listJobs', tags: ['jobs'], params: workspaceParams,
      response: { 200: JobList },
    },
  }, async (request) => {
    await accessFor(request, request.params.workspaceId);
    const records = await dependencies.jobs.list(request.params.workspaceId);
    return { data: records.map(serializeJob), nextCursor: null };
  });

  app.post<{ Headers: { 'idempotency-key': string }; Params: { workspaceId: string }; Body: CreateJobInput; Reply: JobOutput }>('/v1/workspaces/:workspaceId/jobs', {
    schema: {
      operationId: 'createJob', tags: ['jobs'], headers: IdempotencyKeyHeader, params: workspaceParams, body: CreateJobBody,
      response: { 201: Job },
    },
  }, async (request, reply) => {
    const { session, access } = await accessFor(request, request.params.workspaceId);
    requirePermission(access.role, 'job:manage', access.kind);
    const record = await dependencies.jobs.create({
      workspaceId: access.id, actorUserId: session.user.id, idempotencyKey: request.headers['idempotency-key'], ...request.body,
    });
    return reply.code(201).send(serializeJob(record));
  });

  app.patch<{ Headers: { 'idempotency-key': string }; Params: { workspaceId: string; jobId: string }; Body: UpdateJobInput; Reply: JobOutput }>('/v1/workspaces/:workspaceId/jobs/:jobId', {
    schema: {
      operationId: 'updateJob', tags: ['jobs'], headers: IdempotencyKeyHeader, params: jobParams, body: UpdateJobBody,
      response: { 200: Job },
    },
  }, async (request) => {
    const { session, access } = await accessFor(request, request.params.workspaceId);
    requirePermission(access.role, 'job:manage', access.kind);
    const { baseVersion, ...changes } = request.body;
    return serializeJob(await dependencies.jobs.update({
      workspaceId: access.id, actorUserId: session.user.id, idempotencyKey: request.headers['idempotency-key'],
      id: request.params.jobId, baseVersion, changes,
    }));
  });

  app.delete<{ Headers: { 'idempotency-key': string }; Params: { workspaceId: string; jobId: string }; Body: DeleteJobInput; Reply: { id: string; version: number } }>('/v1/workspaces/:workspaceId/jobs/:jobId', {
    schema: {
      operationId: 'deleteJob', tags: ['jobs'], headers: IdempotencyKeyHeader, params: jobParams, body: DeleteJobBody,
      response: { 200: { type: 'object', required: ['id', 'version'], properties: { id: { type: 'string', format: 'uuid' }, version: { type: 'integer' } } } },
    },
  }, async (request) => {
    const { session, access } = await accessFor(request, request.params.workspaceId);
    requirePermission(access.role, 'job:manage', access.kind);
    return dependencies.jobs.delete({
      workspaceId: access.id, actorUserId: session.user.id, idempotencyKey: request.headers['idempotency-key'],
      id: request.params.jobId, baseVersion: request.body.baseVersion,
    });
  });

  app.get<{ Params: { workspaceId: string; jobId: string } }>('/v1/workspaces/:workspaceId/jobs/:jobId/members', {
    schema: { operationId: 'listJobMembers', tags: ['jobs'], params: jobParams },
  }, async (request) => {
    const { access } = await accessFor(request, request.params.workspaceId);
    requirePermission(access.role, 'job:manage', access.kind);
    return { data: await dependencies.jobs.listMembers(access.id, request.params.jobId), nextCursor: null };
  });

  app.put<{ Headers: { 'idempotency-key': string }; Params: { workspaceId: string; jobId: string; userId: string } }>('/v1/workspaces/:workspaceId/jobs/:jobId/members/:userId', {
    schema: { operationId: 'assignJobMember', tags: ['jobs'], headers: IdempotencyKeyHeader, params: jobMemberParams },
  }, async (request) => {
    const { session, access } = await accessFor(request, request.params.workspaceId);
    requirePermission(access.role, 'job:manage', access.kind);
    return dependencies.jobs.assignMember({ workspaceId: access.id, jobId: request.params.jobId, userId: request.params.userId, actorUserId: session.user.id });
  });

  app.delete<{ Headers: { 'idempotency-key': string }; Params: { workspaceId: string; jobId: string; userId: string } }>('/v1/workspaces/:workspaceId/jobs/:jobId/members/:userId', {
    schema: { operationId: 'removeJobMember', tags: ['jobs'], headers: IdempotencyKeyHeader, params: jobMemberParams },
  }, async (request, reply) => {
    const { access } = await accessFor(request, request.params.workspaceId);
    requirePermission(access.role, 'job:manage', access.kind);
    await dependencies.jobs.removeMember({ workspaceId: access.id, jobId: request.params.jobId, userId: request.params.userId });
    return reply.code(204).send();
  });
}

const workspaceParams = { type: 'object', required: ['workspaceId'], properties: { workspaceId: { type: 'string', format: 'uuid' } } } as const;
const jobParams = { type: 'object', required: ['workspaceId', 'jobId'], properties: { workspaceId: { type: 'string', format: 'uuid' }, jobId: { type: 'string', format: 'uuid' } } } as const;
const jobMemberParams = { type: 'object', required: ['workspaceId', 'jobId', 'userId'], properties: { workspaceId: { type: 'string', format: 'uuid' }, jobId: { type: 'string', format: 'uuid' }, userId: { type: 'string', format: 'uuid' } } } as const;
const serializeJob = (record: Awaited<ReturnType<JobStore['create']>>): JobOutput => ({
  ...record, createdAt: record.createdAt.toISOString(), updatedAt: record.updatedAt.toISOString(),
});
