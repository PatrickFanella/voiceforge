export class RepositoryError extends Error {
  constructor(public readonly operation: string, cause: unknown) {
    super(`VoiceForge could not ${operation}. Your existing local data was not changed.`);
    this.name = 'RepositoryError';
    this.cause = cause;
  }
}

export async function withRepositoryError<T>(operation: string, task: () => Promise<T>): Promise<T> {
  try {
    return await task();
  } catch (error) {
    if (error instanceof RepositoryError) throw error;
    throw new RepositoryError(operation, error);
  }
}
