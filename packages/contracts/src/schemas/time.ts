import { Type, type Static } from '@sinclair/typebox';
import { Uuid, UtcDateTime } from './common.js';

export const TimeEntryStatus = Type.Union([
  Type.Literal('draft'), Type.Literal('submitted'), Type.Literal('approved'),
  Type.Literal('rejected'), Type.Literal('correction_requested'),
]);
export const TimeEntry = Type.Object({
  id: Uuid, workspaceId: Uuid, workerUserId: Uuid, jobId: Uuid,
  clockSessionId: Type.Union([Uuid, Type.Null()]), status: TimeEntryStatus,
  version: Type.Integer(), revisionNumber: Type.Integer(), startedAt: UtcDateTime, endedAt: UtcDateTime,
  totalMinutes: Type.Integer(), entryType: Type.String(), notes: Type.String(),
  correctionReason: Type.Union([Type.String(), Type.Null()]), submittedAt: Type.Union([UtcDateTime, Type.Null()]),
  approvedAt: Type.Union([UtcDateTime, Type.Null()]), createdAt: UtcDateTime, updatedAt: UtcDateTime,
});
export const ClockSession = Type.Object({
  id: Uuid, workspaceId: Uuid, workerUserId: Uuid, jobId: Uuid,
  status: Type.Union([Type.Literal('active'), Type.Literal('completed'), Type.Literal('cancelled')]),
  startedAt: UtcDateTime, endedAt: Type.Union([UtcDateTime, Type.Null()]), version: Type.Integer(),
  createdBy: Uuid, updatedBy: Uuid, deletedAt: Type.Union([UtcDateTime, Type.Null()]), createdAt: UtcDateTime, updatedAt: UtcDateTime,
});
export const StartClockBody = Type.Object({ workspaceId: Uuid, id: Uuid, jobId: Uuid, startedAt: UtcDateTime });
export const StopClockBody = Type.Object({ workspaceId: Uuid, timeEntryId: Uuid, endedAt: UtcDateTime, entryType: Type.String({ minLength: 1, maxLength: 50 }), notes: Type.String({ maxLength: 5000 }) });
export const CreateTimeEntryBody = Type.Object({ workspaceId: Uuid, id: Uuid, jobId: Uuid, startedAt: UtcDateTime, endedAt: UtcDateTime, entryType: Type.String({ minLength: 1, maxLength: 50 }), notes: Type.String({ maxLength: 5000 }) });
export const SubmitTimeEntryBody = Type.Object({ workspaceId: Uuid });
export const DecideTimeEntryBody = Type.Object({ workspaceId: Uuid, decision: Type.Union([Type.Literal('approved'), Type.Literal('rejected'), Type.Literal('correction_requested')]), reason: Type.Optional(Type.String({ maxLength: 2000 })) });
export const CorrectTimeEntryBody = Type.Object({ workspaceId: Uuid, startedAt: UtcDateTime, endedAt: UtcDateTime, entryType: Type.String({ minLength: 1, maxLength: 50 }), notes: Type.String({ maxLength: 5000 }), reason: Type.String({ minLength: 1, maxLength: 2000 }) });
export const TimeApprovalQueue = Type.Object({ data: Type.Array(TimeEntry), nextCursor: Type.Null() });
export const TimeHistory = Type.Object({
  exportVersion: Type.Literal(1),
  generatedAt: UtcDateTime,
  entry: Type.Record(Type.String(), Type.Unknown()),
  revisions: Type.Array(Type.Record(Type.String(), Type.Unknown())),
  approvals: Type.Array(Type.Record(Type.String(), Type.Unknown())),
});

export type TimeEntry = Static<typeof TimeEntry>;
export type ClockSession = Static<typeof ClockSession>;
export type StartClockBody = Static<typeof StartClockBody>;
export type StopClockBody = Static<typeof StopClockBody>;
export type CreateTimeEntryBody = Static<typeof CreateTimeEntryBody>;
export type SubmitTimeEntryBody = Static<typeof SubmitTimeEntryBody>;
export type DecideTimeEntryBody = Static<typeof DecideTimeEntryBody>;
export type CorrectTimeEntryBody = Static<typeof CorrectTimeEntryBody>;
