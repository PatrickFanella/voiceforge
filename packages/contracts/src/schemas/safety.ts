import { Type, type Static } from '@sinclair/typebox';
import { Uuid, UtcDateTime } from './common.js';

export const SafetySeverity = Type.Union([Type.Literal('low'), Type.Literal('medium'), Type.Literal('high'), Type.Literal('critical')]);
export const SafetyStatus = Type.Union([Type.Literal('draft'), Type.Literal('submitted'), Type.Literal('acknowledged'), Type.Literal('investigating'), Type.Literal('mitigated'), Type.Literal('closed')]);
export const SafetyReport = Type.Object({
  id: Uuid, workspaceId: Uuid, reporterUserId: Uuid, jobId: Uuid, status: SafetyStatus, severity: SafetySeverity,
  version: Type.Integer(), revisionNumber: Type.Integer(), reportType: Type.String(), description: Type.String(),
  location: Type.Union([Type.String(), Type.Null()]), occurredAt: UtcDateTime,
  correctionReason: Type.Union([Type.String(), Type.Null()]), submittedAt: Type.Union([UtcDateTime, Type.Null()]),
  acknowledgementDueAt: Type.Union([UtcDateTime, Type.Null()]), acknowledgedAt: Type.Union([UtcDateTime, Type.Null()]),
  escalationLevel: Type.Integer(), nextEscalationAt: Type.Union([UtcDateTime, Type.Null()]),
  escalationSilencedAt: Type.Union([UtcDateTime, Type.Null()]), escalationSilenceReason: Type.Union([Type.String(), Type.Null()]),
  createdAt: UtcDateTime, updatedAt: UtcDateTime,
});
export const CreateSafetyReportBody = Type.Object({
  workspaceId: Uuid, id: Uuid, jobId: Uuid, severity: SafetySeverity, reportType: Type.String({ minLength: 1, maxLength: 100 }),
  description: Type.String({ minLength: 1, maxLength: 20000 }), location: Type.Optional(Type.String({ maxLength: 1000 })), occurredAt: UtcDateTime,
});
export const SafetyWorkspaceBody = Type.Object({ workspaceId: Uuid });
export const SafetyAcknowledgementBody = Type.Object({ workspaceId: Uuid, note: Type.Optional(Type.String({ maxLength: 2000 })) });
export const SafetyTransitionBody = Type.Object({ workspaceId: Uuid, status: Type.Union([Type.Literal('investigating'), Type.Literal('mitigated'), Type.Literal('closed')]) });
export const CorrectSafetyReportBody = Type.Object({
  workspaceId: Uuid, severity: SafetySeverity, reportType: Type.String({ minLength: 1, maxLength: 100 }),
  description: Type.String({ minLength: 1, maxLength: 20000 }), location: Type.Optional(Type.String({ maxLength: 1000 })),
  occurredAt: UtcDateTime, reason: Type.String({ minLength: 1, maxLength: 2000 }),
});
export const AssignSafetyReportBody = Type.Object({ workspaceId: Uuid, assignedTo: Uuid });
export const SilenceSafetyReportBody = Type.Object({ workspaceId: Uuid, reason: Type.String({ minLength: 1, maxLength: 2000 }) });
export const SafetyTriageBoard = Type.Object({ data: Type.Array(SafetyReport), nextCursor: Type.Null() });
export const RegisterPushTokenBody = Type.Object({ deviceId: Uuid, platform: Type.Union([Type.Literal('ios'), Type.Literal('android')]), expoToken: Type.String({ minLength: 10, maxLength: 255 }) });
export const ConfigureSafetyPolicyBody = Type.Object({
  workspaceId: Uuid, acknowledgementSlaMinutes: Type.Integer({ minimum: 1, maximum: 1440 }),
  escalationRepeatMinutes: Type.Integer({ minimum: 1, maximum: 1440 }),
  emergencyInstructions: Type.String({ minLength: 1, maxLength: 2000 }),
});
export const ConfigureSafetyContactsBody = Type.Object({
  workspaceId: Uuid,
  contacts: Type.Array(Type.Object({ userId: Type.Optional(Uuid), email: Type.Optional(Type.String({ format: 'email' })) }), { minItems: 1, maxItems: 20 }),
});

export type SafetyReport = Static<typeof SafetyReport>;
export type CreateSafetyReportBody = Static<typeof CreateSafetyReportBody>;
export type SafetyWorkspaceBody = Static<typeof SafetyWorkspaceBody>;
export type SafetyAcknowledgementBody = Static<typeof SafetyAcknowledgementBody>;
export type SafetyTransitionBody = Static<typeof SafetyTransitionBody>;
export type CorrectSafetyReportBody = Static<typeof CorrectSafetyReportBody>;
export type AssignSafetyReportBody = Static<typeof AssignSafetyReportBody>;
export type SilenceSafetyReportBody = Static<typeof SilenceSafetyReportBody>;
export type RegisterPushTokenBody = Static<typeof RegisterPushTokenBody>;
export type ConfigureSafetyPolicyBody = Static<typeof ConfigureSafetyPolicyBody>;
export type ConfigureSafetyContactsBody = Static<typeof ConfigureSafetyContactsBody>;
