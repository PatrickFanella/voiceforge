import { describe, expect, it } from 'vitest';
import { escalationSchedule, requireSafetyReason, SafetyWorkflowError, transitionSafety } from './safety.js';

describe('safety triage workflow', () => {
  it('enforces the complete ordered triage state machine', () => {
    expect(transitionSafety('draft', 'submitted')).toBe('submitted');
    expect(transitionSafety('submitted', 'acknowledged')).toBe('acknowledged');
    expect(transitionSafety('acknowledged', 'investigating')).toBe('investigating');
    expect(transitionSafety('investigating', 'mitigated')).toBe('mitigated');
    expect(transitionSafety('mitigated', 'closed')).toBe('closed');
    expect(() => transitionSafety('submitted', 'closed')).toThrow(SafetyWorkflowError);
  });

  it('schedules critical delivery immediately and ordinary SLA delivery later', () => {
    const submittedAt = new Date('2026-01-01T00:00:00Z');
    expect(escalationSchedule({ severity: 'critical', submittedAt, acknowledgementSlaMinutes: 15 })).toEqual(submittedAt);
    expect(escalationSchedule({ severity: 'high', submittedAt, acknowledgementSlaMinutes: 15 })).toEqual(new Date('2026-01-01T00:15:00Z'));
  });

  it('requires evidence when corrections or escalation are silenced', () => {
    expect(requireSafetyReason('silence', '  False alarm  ')).toBe('False alarm');
    expect(() => requireSafetyReason('correct', ' ')).toThrow('reason');
  });
});
