import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor, InvalidCursorError } from './cursor.js';

describe('workspace cursor', () => {
  it('round trips a workspace-bound sequence', () => {
    const cursor = encodeCursor('workspace-a', 42, 'test-secret');
    expect(decodeCursor(cursor, 'workspace-a', 'test-secret')).toBe(42);
  });

  it('rejects tampering and cross-workspace reuse', () => {
    const cursor = encodeCursor('workspace-a', 42, 'test-secret');
    expect(() => decodeCursor(`${cursor}x`, 'workspace-a', 'test-secret')).toThrow(InvalidCursorError);
    expect(() => decodeCursor(cursor, 'workspace-b', 'test-secret')).toThrow(InvalidCursorError);
  });
});
