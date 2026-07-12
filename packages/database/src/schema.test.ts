import { getTableColumns } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { auditEvents, jobs, workspaceChanges, workspaceMemberships } from './schema.js';

describe('server schema invariants', () => {
  it('gives offline-synchronized jobs tenancy, version, authorship, and tombstone columns', () => {
    expect(Object.keys(getTableColumns(jobs))).toEqual(expect.arrayContaining([
      'workspaceId', 'version', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy', 'deletedAt',
    ]));
  });

  it('scopes memberships, changes, and audit evidence to a workspace', () => {
    for (const table of [workspaceMemberships, workspaceChanges, auditEvents]) {
      expect(getTableColumns(table)).toHaveProperty('workspaceId');
    }
  });

  it('stores the fields required for a tamper-evident audit chain', () => {
    expect(Object.keys(getTableColumns(auditEvents))).toEqual(expect.arrayContaining([
      'sequence', 'previousHash', 'eventHash', 'occurredAt',
    ]));
  });
});
