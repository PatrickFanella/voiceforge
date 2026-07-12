import { Value } from '@sinclair/typebox/value';
import { describe, expect, it } from 'vitest';
import { ErrorEnvelope } from './common.js';

describe('ErrorEnvelope', () => {
  it('accepts the stable public error contract', () => {
    expect(Value.Check(ErrorEnvelope, {
      error: { code: 'VERSION_CONFLICT', message: 'Changed elsewhere.', requestId: 'req_1', details: {} },
    })).toBe(true);
  });

  it('rejects unknown public error codes', () => {
    expect(Value.Check(ErrorEnvelope, {
      error: { code: 'DATABASE_EXPLODED', message: 'internal', requestId: 'req_1', details: {} },
    })).toBe(false);
  });
});
