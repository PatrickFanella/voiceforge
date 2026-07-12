import { describe, expect, it } from 'vitest';
import { calculateDurationMinutes, canCorrect, decisionStatus, submitStatus, TimeWorkflowError } from './time.js';

describe('time approval workflow', () => {
  it('calculates cross-midnight instants and rejects invalid or excessive intervals', () => {
    expect(calculateDurationMinutes(new Date('2026-01-01T23:30:00Z'), new Date('2026-01-02T01:00:00Z'))).toBe(90);
    expect(() => calculateDurationMinutes(new Date('2026-01-01T01:00:00Z'), new Date('2026-01-01T01:00:00Z'))).toThrow(TimeWorkflowError);
    expect(() => calculateDurationMinutes(new Date('2026-01-01T00:00:00Z'), new Date('2026-01-03T00:01:00Z'))).toThrow('24 hours');
  });

  it('separates team approval from personal self-finalization', () => {
    expect(submitStatus('draft', true)).toBe('submitted');
    expect(submitStatus('draft', false)).toBe('approved');
    expect(() => submitStatus('approved', true)).toThrow('draft or corrected');
  });

  it('requires reasons for rejection/correction and reserves approved corrections for owner adjustment', () => {
    expect(decisionStatus('submitted', 'approved')).toBe('approved');
    expect(() => decisionStatus('submitted', 'rejected')).toThrow('reason');
    expect(decisionStatus('submitted', 'correction_requested', 'Fix the end time')).toBe('correction_requested');
    expect(canCorrect('correction_requested', false)).toBe(true);
    expect(canCorrect('approved', false)).toBe(false);
    expect(canCorrect('approved', true)).toBe(true);
  });
});
