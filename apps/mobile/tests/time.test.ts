import { describe, expect, it } from 'vitest';

import { calculateDurationHours, getLocalDateKey } from '@/domain/time';

describe('calculateDurationHours', () => {
  it('calculates ordinary elapsed hours', () => {
    expect(calculateDurationHours('2026-07-12T08:00:00-05:00', '2026-07-12T10:30:00-05:00')).toBe(2.5);
  });

  it('calculates a shift crossing midnight from absolute timestamps', () => {
    expect(calculateDurationHours('2026-07-12T23:00:00-05:00', '2026-07-13T01:30:00-05:00')).toBe(2.5);
  });

  it('rejects an end before the start', () => {
    expect(() => calculateDurationHours('2026-07-12T10:00:00Z', '2026-07-12T09:00:00Z')).toThrow(
      'End time must be after start time',
    );
  });

  it('rejects invalid timestamps', () => {
    expect(() => calculateDurationHours('not-a-date', '2026-07-12T09:00:00Z')).toThrow('Invalid timestamp');
  });
});

describe('getLocalDateKey', () => {
  it('uses local calendar fields instead of a hard-coded date', () => {
    expect(getLocalDateKey(new Date(2026, 6, 12, 23, 59))).toBe('2026-07-12');
  });
});
