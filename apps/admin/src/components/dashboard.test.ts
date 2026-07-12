import { describe, expect, it } from 'vitest';
import { NAV_ITEMS, canSupervise } from './dashboard';

describe('supervisor dashboard policy', () => {
  it('exposes all operational surfaces', () => {
    expect(NAV_ITEMS.map(([id]) => id)).toEqual(expect.arrayContaining(['team', 'jobs', 'time', 'safety', 'audit', 'policies', 'integrations', 'billing', 'deliveries']));
  });
  it('limits supervisor actions to privileged team roles', () => {
    expect(canSupervise({ kind: 'team', role: 'supervisor' })).toBe(true);
    expect(canSupervise({ kind: 'team', role: 'worker' })).toBe(false);
    expect(canSupervise({ kind: 'personal', role: 'owner' })).toBe(false);
  });
});
