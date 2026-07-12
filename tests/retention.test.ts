import { describe, expect, it } from 'vitest';

import { expiredAudioUris } from '@/features/voice/retention-policy';
import type { VoiceLog } from '@/types';

const logs: VoiceLog[] = [
  { id: 'old', timestamp: '2026-06-01T00:00:00Z', transcript: 'old', category: 'note', processed: true, audioUri: 'file:///old.m4a' },
  { id: 'new', timestamp: '2026-07-10T00:00:00Z', transcript: 'new', category: 'note', processed: true, audioUri: 'file:///new.m4a' },
  { id: 'text', timestamp: '2026-01-01T00:00:00Z', transcript: 'no audio', category: 'note', processed: true },
];

describe('expiredAudioUris', () => {
  it('selects only audio older than the retention window', () => {
    expect(expiredAudioUris(logs, 30, new Date('2026-07-12T00:00:00Z'))).toEqual(['file:///old.m4a']);
  });

  it('keeps audio forever when retention is zero', () => {
    expect(expiredAudioUris(logs, 0, new Date('2026-07-12T00:00:00Z'))).toEqual([]);
  });
});
