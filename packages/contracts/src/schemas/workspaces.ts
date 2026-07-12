import { Type, type Static } from '@sinclair/typebox';
import { Uuid, UtcDateTime } from './common.js';

export const WorkspaceRole = Type.Union([
  Type.Literal('owner'), Type.Literal('admin'), Type.Literal('supervisor'), Type.Literal('worker'), Type.Literal('auditor'),
]);
export const WorkspaceKind = Type.Union([Type.Literal('personal'), Type.Literal('team')]);

export const WorkspaceSummary = Type.Object({
  id: Uuid,
  kind: WorkspaceKind,
  name: Type.String(),
  timeZone: Type.String(),
  role: WorkspaceRole,
});

export const BootstrapResponse = Type.Object({
  user: Type.Object({ id: Uuid, displayName: Type.Union([Type.String(), Type.Null()]), primaryEmail: Type.Union([Type.String(), Type.Null()]) }),
  personalWorkspaceId: Uuid,
  workspaces: Type.Array(WorkspaceSummary),
});

export const CreateWorkspaceBody = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 120 }),
  timeZone: Type.String({ minLength: 1, maxLength: 100 }),
});

export const CreateInvitationBody = Type.Object({
  email: Type.String({ format: 'email', maxLength: 320 }),
  role: WorkspaceRole,
});

export const InvitationResponse = Type.Object({
  id: Uuid,
  workspaceId: Uuid,
  email: Type.String({ format: 'email' }),
  role: WorkspaceRole,
  status: Type.Literal('pending'),
  expiresAt: UtcDateTime,
});

export const AcceptInvitationBody = Type.Object({ token: Type.String({ minLength: 32, maxLength: 255 }) });

export type WorkspaceSummary = Static<typeof WorkspaceSummary>;
export type BootstrapResponse = Static<typeof BootstrapResponse>;
export type CreateWorkspaceBody = Static<typeof CreateWorkspaceBody>;
export type CreateInvitationBody = Static<typeof CreateInvitationBody>;
export type InvitationResponse = Static<typeof InvitationResponse>;
export type AcceptInvitationBody = Static<typeof AcceptInvitationBody>;
