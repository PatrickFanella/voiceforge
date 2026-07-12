import type { AuditEvent, Job, SafetyReport, TimeEntry, VoiceLog } from '@/types';

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
const auditId = () => `audit-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

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

  async getAuditEvents(): Promise<AuditEvent[]> {
    const rows = await this.db.getAllAsync<{
      id: string;
      entityType: AuditEvent['entityType'];
      entityId: string;
      action: AuditEvent['action'];
      sourceVoiceLogId: string | null;
      occurredAt: string;
      detailsJson: string;
    }>(
      `SELECT id, entity_type AS entityType, entity_id AS entityId, action,
        source_voice_log_id AS sourceVoiceLogId, occurred_at AS occurredAt, details_json AS detailsJson
       FROM audit_events ORDER BY occurred_at DESC`,
    );
    return rows.map(({ sourceVoiceLogId, detailsJson, ...row }) => ({
      ...row,
      ...(sourceVoiceLogId ? { sourceVoiceLogId } : {}),
      details: JSON.parse(detailsJson) as Record<string, unknown>,
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

  private async writeAudit(
    entityType: AuditEvent['entityType'],
    entityId: string,
    action: AuditEvent['action'],
    sourceVoiceLogId?: string,
    details: Record<string, unknown> = {},
  ): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO audit_events
       (id, entity_type, entity_id, action, source_voice_log_id, occurred_at, details_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      auditId(), entityType, entityId, action, sourceVoiceLogId ?? null, nowIso(), JSON.stringify(details),
    );
  }

  async addTimeEntry(entry: TimeEntry, confirmed = false): Promise<void> {
    if (entry.sourceVoiceLogId && !confirmed) throw new Error('Explicit confirmation is required');
    const now = nowIso();
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync(
        `INSERT INTO time_entries VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        entry.id, entry.jobId, entry.jobTitle, entry.date, entry.startTime, entry.endTime,
        entry.hours, entry.type, entry.notes, entry.voiceLogged ? 1 : 0,
        entry.sourceVoiceLogId ?? null, now, now,
      );
      await this.writeAudit('time_entry', entry.id, entry.sourceVoiceLogId ? 'confirmed' : 'created', entry.sourceVoiceLogId, {
        hours: entry.hours, type: entry.type,
      });
    });
  }

  async completeClockOut(entry: TimeEntry): Promise<void> {
    const now = nowIso();
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync(
        `INSERT INTO time_entries VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        entry.id, entry.jobId, entry.jobTitle, entry.date, entry.startTime, entry.endTime,
        entry.hours, entry.type, entry.notes, 0, null, now, now,
      );
      await this.writeAudit('time_entry', entry.id, 'confirmed', undefined, { source: 'clock', hours: entry.hours, type: entry.type });
      await this.setSetting('clock_state', { clockedIn: false, clockInTime: null, jobId: null });
    });
  }

  async addSafetyReport(report: SafetyReport, confirmed = false): Promise<void> {
    if (report.sourceVoiceLogId && !confirmed) throw new Error('Explicit confirmation is required');
    const now = nowIso();
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync(
        `INSERT INTO safety_reports VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        report.id, report.jobId, report.jobTitle, report.date, report.type, report.severity,
        report.description, report.resolved ? 1 : 0, report.voiceLogged ? 1 : 0,
        report.sourceVoiceLogId ?? null, now, now,
      );
      await this.writeAudit('safety_report', report.id, report.sourceVoiceLogId ? 'confirmed' : 'created', report.sourceVoiceLogId, {
        severity: report.severity, type: report.type,
      });
    });
  }

  async updateTimeEntry(entry: TimeEntry): Promise<void> {
    const result = await this.db.runAsync(
      `UPDATE time_entries SET date = ?, start_time = ?, end_time = ?, hours = ?, type = ?, notes = ?, updated_at = ? WHERE id = ?`,
      entry.date, entry.startTime, entry.endTime, entry.hours, entry.type, entry.notes, nowIso(), entry.id,
    );
    if (!result.changes) throw new Error('Time entry not found');
    await this.writeAudit('time_entry', entry.id, 'updated', entry.sourceVoiceLogId);
  }

  async updateSafetyReport(report: SafetyReport): Promise<void> {
    const result = await this.db.runAsync(
      `UPDATE safety_reports SET type = ?, severity = ?, description = ?, resolved = ?, updated_at = ? WHERE id = ?`,
      report.type, report.severity, report.description, report.resolved ? 1 : 0, nowIso(), report.id,
    );
    if (!result.changes) throw new Error('Safety report not found');
    await this.writeAudit('safety_report', report.id, 'updated', report.sourceVoiceLogId);
  }

  async updateJob(job: Job): Promise<void> {
    const result = await this.db.runAsync(
      `UPDATE jobs SET title = ?, client = ?, address = ?, status = ?, trade = ?, priority = ?,
        start_date = ?, due_date = ?, hours_logged = ?, hours_estimated = ?, notes_json = ?, crew_json = ?, updated_at = ?
       WHERE id = ?`,
      job.title, job.client, job.address, job.status, job.trade, job.priority, job.startDate, job.dueDate,
      job.hoursLogged, job.hoursEstimated, JSON.stringify(job.notes), JSON.stringify(job.crew), nowIso(), job.id,
    );
    if (!result.changes) throw new Error('Job not found');
    await this.writeAudit('job', job.id, 'updated');
  }

  async deleteJob(id: string): Promise<void> {
    await this.db.withTransactionAsync(async () => {
      const result = await this.db.runAsync('DELETE FROM jobs WHERE id = ?', id);
      if (!result.changes) throw new Error('Job not found');
      await this.writeAudit('job', id, 'deleted');
    });
  }

  async deleteRecord(entityType: 'time_entry' | 'safety_report' | 'voice_log', id: string): Promise<void> {
    const table = entityType === 'time_entry' ? 'time_entries' : entityType === 'safety_report' ? 'safety_reports' : 'voice_logs';
    await this.db.withTransactionAsync(async () => {
      const result = await this.db.runAsync(`DELETE FROM ${table} WHERE id = ?`, id);
      if (!result.changes) throw new Error('Record not found');
      await this.writeAudit(entityType, id, 'deleted');
    });
  }

  async exportSnapshot() {
    const [jobs, timeEntries, safetyReports, voiceLogs, auditEvents] = await Promise.all([
      this.getJobs(),
      this.getTimeEntries(),
      this.getSafetyReports(),
      this.getVoiceLogs(),
      this.getAuditEvents(),
    ]);
    return {
      schemaVersion: 2,
      exportedAt: nowIso(),
      jobs,
      timeEntries,
      safetyReports,
      voiceLogs,
      auditEvents,
    };
  }

  async clearUserData(): Promise<void> {
    await this.db.withTransactionAsync(async () => {
      await this.db.execAsync(`
        DELETE FROM audit_events;
        DELETE FROM time_entries;
        DELETE FROM safety_reports;
        DELETE FROM voice_logs;
        DELETE FROM jobs;
        DELETE FROM settings;
      `);
      await this.setSetting('demo_seeded', true);
    });
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
