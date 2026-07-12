import { describe, expect, it } from 'vitest';

import { buildTimeEntryFromClock } from '@/domain/clock';
import { mockJobs } from '@/mocks/data';

describe('buildTimeEntryFromClock', () => {
  it('builds a rounded, job-linked entry from absolute timestamps', () => {
    expect(buildTimeEntryFromClock({
      id: 'time-new', job: mockJobs[0], startedAt: '2026-07-12T08:00:00-05:00',
      endedAt: '2026-07-12T10:20:00-05:00', type: 'regular', notes: ' Panel work ',
    })).toMatchObject({
      id: 'time-new', jobId: 'j1', startTime: '08:00', endTime: '10:20', hours: 2.33,
      type: 'regular', notes: 'Panel work', voiceLogged: false,
    });
  });

  it('retains voice provenance without inferring overtime', () => {
    const entry = buildTimeEntryFromClock({
      id: 'time-voice', job: mockJobs[0], startedAt: '2026-07-12T23:00:00-05:00',
      endedAt: '2026-07-13T01:00:00-05:00', type: 'overtime', notes: '', sourceVoiceLogId: 'voice-1',
    });
    expect(entry).toMatchObject({ hours: 2, type: 'overtime', voiceLogged: true, sourceVoiceLogId: 'voice-1' });
  });
});
