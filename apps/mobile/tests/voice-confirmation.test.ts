import { describe, expect, it } from 'vitest';

import { confirmVoiceAction } from '@/domain/voice-actions';

const proposal = {
  sourceVoiceLogId: 'voice-1',
  action: 'safety' as const,
  confidence: 0.86,
};

describe('confirmVoiceAction', () => {
  it('rejects consequential actions without explicit confirmation', () => {
    expect(() => confirmVoiceAction(proposal, false)).toThrow('Explicit confirmation is required');
  });

  it('retains voice provenance when confirmed', () => {
    expect(confirmVoiceAction(proposal, true)).toEqual({
      action: 'safety',
      confidence: 0.86,
      sourceVoiceLogId: 'voice-1',
      confirmedAt: expect.any(String),
    });
  });

  it('rejects missing provenance', () => {
    expect(() => confirmVoiceAction({ ...proposal, sourceVoiceLogId: '' }, true)).toThrow(
      'Source voice log is required',
    );
  });
});
