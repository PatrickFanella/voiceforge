import { describe, expect, it } from 'vitest';

import { RepositoryError, withRepositoryError } from '@/db/errors';

describe('withRepositoryError', () => {
  it('returns successful values unchanged', async () => {
    await expect(withRepositoryError('load records', async () => 42)).resolves.toBe(42);
  });

  it('normalizes storage failures without exposing internal SQL', async () => {
    const result = withRepositoryError('save the time entry', async () => { throw new Error('SQLITE_CONSTRAINT secret detail'); });
    await expect(result).rejects.toBeInstanceOf(RepositoryError);
    await expect(result).rejects.toThrow('Your existing local data was not changed');
  });
});
