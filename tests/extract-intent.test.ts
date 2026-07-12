import { describe, expect, it } from 'vitest';

import { extractVoiceIntent } from '@/features/voice/extract-intent';

describe('extractVoiceIntent', () => {
  it.each([
    ['Clocking out for lunch after four hours.', 'time', 'time'],
    ['Found a live wire and set up lockout tagout.', 'safety', 'safety'],
    ['Need to order cable and a breaker.', 'materials', null],
    ['Call the client and follow up tomorrow.', 'communication', null],
    ['Panel work continued on the second floor.', 'note', null],
  ] as const)('classifies %s', (transcript, category, consequentialAction) => {
    expect(extractVoiceIntent(transcript)).toMatchObject({ category, consequentialAction });
  });

  it('returns a zero-confidence note for empty input', () => {
    expect(extractVoiceIntent('  ')).toEqual({ category: 'note', confidence: 0, consequentialAction: null, matchedTerms: [] });
  });

  it('returns confidence and evidence terms', () => {
    const intent = extractVoiceIntent('Safety hazard: exposed live wire.');
    expect(intent.confidence).toBeGreaterThan(0.5);
    expect(intent.matchedTerms).toEqual(expect.arrayContaining(['hazard', 'live wire']));
  });
});
