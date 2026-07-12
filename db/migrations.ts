import type { DatabaseConnection } from './types';

const MIGRATIONS = [
  `
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      client TEXT NOT NULL,
      address TEXT NOT NULL,
      status TEXT NOT NULL,
      trade TEXT NOT NULL,
      priority TEXT NOT NULL,
      start_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      hours_logged REAL NOT NULL DEFAULT 0,
      hours_estimated REAL NOT NULL DEFAULT 0,
      notes_json TEXT NOT NULL DEFAULT '[]',
      crew_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS time_entries (
      id TEXT PRIMARY KEY NOT NULL,
      job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
      job_title TEXT NOT NULL,
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      hours REAL NOT NULL CHECK(hours >= 0),
      type TEXT NOT NULL,
      notes TEXT NOT NULL,
      voice_logged INTEGER NOT NULL DEFAULT 0,
      source_voice_log_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS safety_reports (
      id TEXT PRIMARY KEY NOT NULL,
      job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
      job_title TEXT NOT NULL,
      date TEXT NOT NULL,
      type TEXT NOT NULL,
      severity TEXT NOT NULL,
      description TEXT NOT NULL,
      resolved INTEGER NOT NULL DEFAULT 0,
      voice_logged INTEGER NOT NULL DEFAULT 0,
      source_voice_log_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS voice_logs (
      id TEXT PRIMARY KEY NOT NULL,
      timestamp TEXT NOT NULL,
      transcript TEXT NOT NULL,
      category TEXT NOT NULL,
      processed INTEGER NOT NULL DEFAULT 0,
      job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL,
      audio_uri TEXT,
      confidence REAL,
      provider TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      source_voice_log_id TEXT,
      occurred_at TEXT NOT NULL,
      details_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE INDEX IF NOT EXISTS idx_time_entries_date ON time_entries(date);
    CREATE INDEX IF NOT EXISTS idx_safety_reports_date ON safety_reports(date);
    CREATE INDEX IF NOT EXISTS idx_voice_logs_timestamp ON voice_logs(timestamp);
  `,
] as const;

export async function migrateDatabase(db: DatabaseConnection): Promise<void> {
  const versionRow = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = versionRow?.user_version ?? 0;

  for (let index = currentVersion; index < MIGRATIONS.length; index += 1) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATIONS[index]);
      await db.execAsync(`PRAGMA user_version = ${index + 1}`);
    });
  }
}

export const DATABASE_VERSION = MIGRATIONS.length;
