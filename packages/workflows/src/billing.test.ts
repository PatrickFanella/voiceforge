import { describe, expect, it } from 'vitest';
import { deriveEntitlement, nextSeatChange } from './billing.js';

describe('billing entitlement policy', () => {
  it('allows active teams and preserves read/export during payment grace', () => {
    expect(deriveEntitlement({ status: 'active', now: 100, graceUntil: null })).toEqual({ read: true, export: true, mutate: true });
    expect(deriveEntitlement({ status: 'past_due', now: 100, graceUntil: 200 })).toEqual({ read: true, export: true, mutate: true });
    expect(deriveEntitlement({ status: 'past_due', now: 201, graceUntil: 200 })).toEqual({ read: true, export: true, mutate: false });
    expect(deriveEntitlement({ status: 'canceled', now: 201, graceUntil: null })).toEqual({ read: true, export: true, mutate: false });
  });

  it('applies increases now and schedules decreases for renewal', () => {
    expect(nextSeatChange(3, 5)).toEqual({ stripeQuantity: 5, effectiveQuantity: 5, pendingQuantity: null });
    expect(nextSeatChange(5, 3)).toEqual({ stripeQuantity: 3, effectiveQuantity: 5, pendingQuantity: 3 });
  });
});
