import { describe, expect, it } from 'vitest'; import { retentionDecision } from './retention.js';
describe('records retention policy', () => {
  it('lets active legal holds override expiration', () => { expect(retentionDecision({ occurredAt: 0, now: 100, retentionMs: 50, legalHold: true })).toEqual({ expired: true, deleteAllowed: false, reason: 'active_legal_hold' }); });
  it('deletes only expired records without holds', () => { expect(retentionDecision({ occurredAt: 0, now: 100, retentionMs: 50, legalHold: false })).toEqual({ expired: true, deleteAllowed: true, reason: 'retention_expired' }); expect(retentionDecision({ occurredAt: 75, now: 100, retentionMs: 50, legalHold: false }).deleteAllowed).toBe(false); });
});
