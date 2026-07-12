import { describe, expect, it } from 'vitest';
import { can, workspaceRoles } from './policies.js';

describe('workspace authorization matrix', () => {
  it('allows only owners to manage billing and retention', () => {
    for (const role of workspaceRoles) {
      expect(can(role, 'billing:manage', 'team')).toBe(role === 'owner');
      expect(can(role, 'retention:manage', 'team')).toBe(role === 'owner');
    }
  });

  it('allows supervisors and higher operational roles to approve and triage', () => {
    expect(can('supervisor', 'time:approve', 'team')).toBe(true);
    expect(can('supervisor', 'safety:triage', 'team')).toBe(true);
    expect(can('worker', 'time:approve', 'team')).toBe(false);
    expect(can('auditor', 'safety:triage', 'team')).toBe(false);
  });

  it('disables membership and approval workflows in personal workspaces', () => {
    expect(can('owner', 'membership:manage', 'personal')).toBe(false);
    expect(can('owner', 'time:approve', 'personal')).toBe(false);
    expect(can('owner', 'safety:triage', 'personal')).toBe(false);
  });
});
