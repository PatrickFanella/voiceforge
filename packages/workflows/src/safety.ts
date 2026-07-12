export type SafetyStatus = 'draft' | 'submitted' | 'acknowledged' | 'investigating' | 'mitigated' | 'closed';
export type SafetySeverity = 'low' | 'medium' | 'high' | 'critical';

export class SafetyWorkflowError extends Error {}

const nextStates: Record<SafetyStatus, readonly SafetyStatus[]> = {
  draft: ['submitted'], submitted: ['acknowledged'], acknowledged: ['investigating'],
  investigating: ['mitigated'], mitigated: ['closed'], closed: [],
};

export function transitionSafety(current: SafetyStatus, next: SafetyStatus): SafetyStatus {
  if (!nextStates[current].includes(next)) throw new SafetyWorkflowError(`Safety report cannot move from ${current} to ${next}.`);
  return next;
}

export function escalationSchedule(input: { severity: SafetySeverity; submittedAt: Date; acknowledgementSlaMinutes: number }): Date {
  if (input.acknowledgementSlaMinutes < 1 || input.acknowledgementSlaMinutes > 24 * 60) throw new SafetyWorkflowError('Acknowledgement SLA is invalid.');
  return input.severity === 'critical'
    ? input.submittedAt
    : new Date(input.submittedAt.getTime() + input.acknowledgementSlaMinutes * 60_000);
}

export function requireSafetyReason(action: 'silence' | 'correct', reason: string): string {
  const value = reason.trim();
  if (!value) throw new SafetyWorkflowError(`A reason is required to ${action} a safety report.`);
  return value;
}
