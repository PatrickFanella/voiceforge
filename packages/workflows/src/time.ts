export type TimeEntryStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'correction_requested';
export type TimeDecision = 'approved' | 'rejected' | 'correction_requested';

export class TimeWorkflowError extends Error {}

export function calculateDurationMinutes(startedAt: Date, endedAt: Date): number {
  const duration = Math.round((endedAt.getTime() - startedAt.getTime()) / 60_000);
  if (!Number.isFinite(duration) || duration <= 0) throw new TimeWorkflowError('End time must be after start time.');
  if (duration > 24 * 60) throw new TimeWorkflowError('A time entry cannot exceed 24 hours.');
  return duration;
}

export function submitStatus(current: TimeEntryStatus, requiresApproval: boolean): TimeEntryStatus {
  if (current !== 'draft' && current !== 'rejected' && current !== 'correction_requested') {
    throw new TimeWorkflowError('Only a draft or corrected entry can be submitted.');
  }
  return requiresApproval ? 'submitted' : 'approved';
}

export function decisionStatus(current: TimeEntryStatus, decision: TimeDecision, reason?: string): TimeEntryStatus {
  if (current !== 'submitted') throw new TimeWorkflowError('Only a submitted entry can be decided.');
  if (decision !== 'approved' && !reason?.trim()) throw new TimeWorkflowError('A reason is required.');
  return decision;
}

export function canCorrect(current: TimeEntryStatus, ownerAdjustment: boolean): boolean {
  return current === 'rejected' || current === 'correction_requested' || (current === 'approved' && ownerAdjustment);
}
