export interface RunResult {
  lastInsertRowId: number;
  changes: number;
}

export interface DatabaseConnection {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, ...params: unknown[]): Promise<RunResult>;
  getFirstAsync<T>(source: string, ...params: unknown[]): Promise<T | null>;
  getAllAsync<T>(source: string, ...params: unknown[]): Promise<T[]>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}
