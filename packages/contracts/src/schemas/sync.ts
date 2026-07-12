import { Type, type Static } from '@sinclair/typebox';
import { Uuid } from './common.js';

export const SyncMutation = Type.Object({
  mutationId: Uuid,
  entityType: Type.Union([Type.Literal('job'), Type.Literal('time_entry')]),
  entityId: Uuid,
  operation: Type.Union([Type.Literal('create'), Type.Literal('update'), Type.Literal('delete')]),
  baseVersion: Type.Integer({ minimum: 0 }),
  payload: Type.Record(Type.String(), Type.Unknown()),
});
export const SyncPushBody = Type.Object({ workspaceId: Uuid, deviceId: Uuid, mutations: Type.Array(SyncMutation, { minItems: 1, maxItems: 100 }) });
export const SyncMutationResult = Type.Object({ mutationId: Uuid, entityId: Uuid, status: Type.Union([Type.Literal('applied'), Type.Literal('conflict')]), version: Type.Optional(Type.Integer()), errorCode: Type.Optional(Type.String()) });
export const SyncPushResponse = Type.Object({ results: Type.Array(SyncMutationResult) });
export const SyncChange = Type.Object({ sequence: Type.Integer(), entityType: Type.String(), entityId: Uuid, operation: Type.Union([Type.Literal('upsert'), Type.Literal('delete')]), version: Type.Integer(), payload: Type.Union([Type.Record(Type.String(), Type.Unknown()), Type.Null()]) });
export const SyncPullResponse = Type.Object({ cursor: Type.String(), hasMore: Type.Boolean(), changes: Type.Array(SyncChange) });

export type SyncPushBody = Static<typeof SyncPushBody>;
export type SyncPushResponse = Static<typeof SyncPushResponse>;
export type SyncPullResponse = Static<typeof SyncPullResponse>;
