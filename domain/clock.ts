import { calculateDurationHours, getLocalDateKey } from './time';
import type { Job, TimeEntry } from '@/types';

export interface ClockOutInput {
  id: string;
  job: Job;
  startedAt: string;
  endedAt: string;
  type: TimeEntry['type'];
  notes: string;
  sourceVoiceLogId?: string;
}

function localTime(timestamp: string): string {
  const date = new Date(timestamp);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function buildTimeEntryFromClock(input: ClockOutInput): TimeEntry {
  const start = new Date(input.startedAt);
  const end = new Date(input.endedAt);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) throw new Error('Invalid timestamp');

  return {
    id: input.id,
    jobId: input.job.id,
    jobTitle: input.job.title,
    date: getLocalDateKey(start),
    startTime: localTime(input.startedAt),
    endTime: localTime(input.endedAt),
    hours: Math.round(calculateDurationHours(input.startedAt, input.endedAt) * 100) / 100,
    type: input.type,
    notes: input.notes.trim(),
    voiceLogged: Boolean(input.sourceVoiceLogId),
    ...(input.sourceVoiceLogId ? { sourceVoiceLogId: input.sourceVoiceLogId } : {}),
  };
}
