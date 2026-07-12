import { Type, type Static } from '@sinclair/typebox';
import { Uuid, UtcDateTime } from './common.js';

export const Job = Type.Object({
  id: Uuid,
  workspaceId: Uuid,
  name: Type.String(),
  description: Type.Union([Type.String(), Type.Null()]),
  address: Type.Union([Type.String(), Type.Null()]),
  status: Type.String(),
  version: Type.Integer({ minimum: 1 }),
  createdAt: UtcDateTime,
  updatedAt: UtcDateTime,
});

export const CreateJobBody = Type.Object({
  id: Uuid,
  name: Type.String({ minLength: 1, maxLength: 200 }),
  description: Type.Optional(Type.String({ maxLength: 5000 })),
  address: Type.Optional(Type.String({ maxLength: 1000 })),
});

export const UpdateJobBody = Type.Object({
  baseVersion: Type.Integer({ minimum: 1 }),
  name: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
  description: Type.Optional(Type.Union([Type.String({ maxLength: 5000 }), Type.Null()])),
  address: Type.Optional(Type.Union([Type.String({ maxLength: 1000 }), Type.Null()])),
  status: Type.Optional(Type.String({ minLength: 1, maxLength: 50 })),
});

export const DeleteJobBody = Type.Object({ baseVersion: Type.Integer({ minimum: 1 }) });
export const JobList = Type.Object({ data: Type.Array(Job), nextCursor: Type.Null() });

export type Job = Static<typeof Job>;
export type CreateJobBody = Static<typeof CreateJobBody>;
export type UpdateJobBody = Static<typeof UpdateJobBody>;
export type DeleteJobBody = Static<typeof DeleteJobBody>;
