export const workspaceRoles = ['owner', 'admin', 'supervisor', 'worker', 'auditor'] as const;
export type WorkspaceRole = typeof workspaceRoles[number];
export type WorkspaceKind = 'personal' | 'team';

export type Permission =
  | 'workspace:manage'
  | 'membership:manage'
  | 'job:manage'
  | 'time:submit'
  | 'time:approve'
  | 'safety:submit'
  | 'safety:triage'
  | 'audit:read'
  | 'export:create'
  | 'billing:manage'
  | 'retention:manage';

const grants: Record<WorkspaceRole, ReadonlySet<Permission>> = {
  owner: new Set(['workspace:manage', 'membership:manage', 'job:manage', 'time:submit', 'time:approve', 'safety:submit', 'safety:triage', 'audit:read', 'export:create', 'billing:manage', 'retention:manage']),
  admin: new Set(['membership:manage', 'job:manage', 'time:submit', 'time:approve', 'safety:submit', 'safety:triage', 'audit:read', 'export:create']),
  supervisor: new Set(['job:manage', 'time:submit', 'time:approve', 'safety:submit', 'safety:triage', 'audit:read', 'export:create']),
  worker: new Set(['time:submit', 'safety:submit']),
  auditor: new Set(['audit:read']),
};

const teamOnly = new Set<Permission>(['membership:manage', 'time:approve', 'safety:triage', 'billing:manage', 'retention:manage']);

export function can(role: WorkspaceRole, permission: Permission, kind: WorkspaceKind): boolean {
  return grants[role].has(permission) && !(kind === 'personal' && teamOnly.has(permission));
}

export function requirePermission(role: WorkspaceRole, permission: Permission, kind: WorkspaceKind): void {
  if (!can(role, permission, kind)) throw new AuthorizationError(permission);
}

export class AuthorizationError extends Error {
  constructor(readonly permission: Permission) {
    super(`Permission required: ${permission}`);
  }
}
