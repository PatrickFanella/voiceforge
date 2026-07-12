import type { Job, SafetyReport, TimeEntry, VoiceLog } from '@/types';

import type { DatabaseConnection } from './types';

type JobRow = Omit<Job, 'notes' | 'crew' | 'hoursLogged' | 'hoursEstimated' | 'startDate' | 'dueDate'> & {
  start_date: string;
  due_date: string;
  hours_logged: number;
  hours_estimated: number;
  notes_json: string;
  crew_json: string;
};

interface SettingRow {
  value: string;
}

type TimeEntryRow = Omit<TimeEntry, 'voiceLogged' | 'sourceVoiceLogId'> & {
  voiceLogged: number;
  sourceVoiceLogId: string | null;
};

type SafetyReportRow = Omit<SafetyReport, 'resolved' | 'voiceLogged' | 'sourceVoiceLogId'> & {
  resolved: number;
  voiceLogged: number;
  sourceVoiceLogId: string | null;
};

type VoiceLogRow = Omit<VoiceLog, 'processed' | 'jobId' | 'audioUri' | 'confidence' | 'provider'> & {
  processed: number;
  jobId: string | null;
  audioUri: string | null;
  confidence: number | null;
  provider: string | null;
};

const nowIso = () => new Date().toISOString();

export class VoiceForgeRepository {
  constructor(private readonly db: DatabaseConnection) {}

  async getJobs(): Promise<Job[]> {
    const rows = await this.db.getAllAsync<JobRow>('SELECT * FROM jobs ORDER BY due_date ASC, title ASC');
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      client: row.client,
      address: row.address,
      status: row.status,
      trade: row.trade,
      priority: row.priority,
      startDate: row.start_date,
      dueDate: row.due_date,
      hoursLogged: row.hours_logged,
      hoursEstimated: row.hours_estimated,
      notes: JSON.parse(row.notes_json) as string[],
      crew: JSON.parse(row.crew_json) as string[],
    }));
  }

  async getTimeEntries(): Promise<TimeEntry[]> {
    const rows = await this.db.getAllAsync<TimeEntryRow>(
      `SELECT id, job_id AS jobId, job_title AS jobTitle, date, start_time AS startTime,
        end_time AS endTime, hours, type, notes, voice_logged AS voiceLogged,
        source_voice_log_id AS sourceVoiceLogId
       FROM time_entries ORDER BY date DESC, start_time DESC`,
    );
    return rows.map(({ voiceLogged, sourceVoiceLogId, ...row }) => ({
      ...row,
      voiceLogged: Boolean(voiceLogged),
      ...(sourceVoiceLogId ? { sourceVoiceLogId } : {}),
    }));
  }

  async getSafetyReports(): Promise<SafetyReport[]> {
    const rows = await this.db.getAllAsync<SafetyReportRow>(
      `SELECT id, job_id AS jobId, job_title AS jobTitle, date, type, severity, description,
        resolved, voice_logged AS voiceLogged, source_voice_log_id AS sourceVoiceLogId
       FROM safety_reports ORDER BY date DESC, created_at DESC`,
    );
    return rows.map(({ resolved, voiceLogged, sourceVoiceLogId, ...row }) => ({
      ...row,
      resolved: Boolean(resolved),
      voiceLogged: Boolean(voiceLogged),
      ...(sourceVoiceLogId ? { sourceVoiceLogId } : {}),
    }));
  }

  async getVoiceLogs(): Promise<VoiceLog[]> {
    const rows = await this.db.getAllAsync<VoiceLogRow>(
      `SELECT id, timestamp, transcript, category, processed, job_id AS jobId,
        audio_uri AS audioUri, confidence, provider
       FROM voice_logs ORDER BY timestamp DESC`,
    );
    return rows.map((row) => ({
      id: row.id,
      timestamp: row.timestamp,
      transcript: row.transcript,
      category: row.category,
      processed: Boolean(row.processed),
      ...(row.jobId ? { jobId: row.jobId } : {}),
      ...(row.audioUri ? { audioUri: row.audioUri } : {}),
      ...(row.confidence !== null ? { confidence: row.confidence } : {}),
      ...(row.provider ? { provider: row.provider } : {}),
    }));
  }

  async getSetting<T>(key: string, fallback: T): Promise<T> {
    const row = await this.db.getFirstAsync<SettingRow>('SELECT value FROM settings WHERE key = ?', key);
    return row ? (JSON.parse(row.value) as T) : fallback;
  }

  async setSetting(key: string, value: unknown): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      key,
      JSON.stringify(value),
      nowIso(),
    );
  }

  async addVoiceLog(log: VoiceLog): Promise<void> {
    const now = nowIso();
    await this.db.runAsync(
      `INSERT INTO voice_logs
       (id, timestamp, transcript, category, processed, job_id, audio_uri, confidence, provider, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      log.id,
      log.timestamp,
      log.transcript,
      log.category,
      log.processed ? 1 : 0,
      log.jobId ?? null,
      log.audioUri ?? null,
      log.confidence ?? null,
      log.provider ?? null,
      now,
      now,
    );
  }

  async seedDemoData(data: {
    jobs: Job[];
    timeEntries: TimeEntry[];
    safetyReports: SafetyReport[];
    voiceLogs: VoiceLog[];
  }): Promise<boolean> {
    const seeded = await this.getSetting('demo_seeded', false);
    if (seeded) return false;

    await this.db.withTransactionAsync(async () => {
      const now = nowIso();
      for (const job of data.jobs) {
        await this.db.runAsync(
          `INSERT INTO jobs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          job.id, job.title, job.client, job.address, job.status, job.trade, job.priority,
          job.startDate, job.dueDate, job.hoursLogged, job.hoursEstimated,
          JSON.stringify(job.notes), JSON.stringify(job.crew), now, now,
        );
      }
      for (const entry of data.timeEntries) {
        await this.db.runAsync(
          `INSERT INTO time_entries VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          entry.id, entry.jobId, entry.jobTitle, entry.date, entry.startTime, entry.endTime,
          entry.hours, entry.type, entry.notes, entry.voiceLogged ? 1 : 0,
          entry.sourceVoiceLogId ?? null, now, now,
        );
      }
      for (const report of data.safetyReports) {
        await this.db.runAsync(
          `INSERT INTO safety_reports VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          report.id, report.jobId, report.jobTitle, report.date, report.type, report.severity,
          report.description, report.resolved ? 1 : 0, report.voiceLogged ? 1 : 0,
          report.sourceVoiceLogId ?? null, now, now,
        );
      }
      for (const log of data.voiceLogs) {
        await this.addVoiceLog(log);
      }
      await this.setSetting('demo_seeded', true);
    });
    return true;
  }
}
