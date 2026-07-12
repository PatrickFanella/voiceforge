import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DATABASE_VERSION, migrateDatabase } from '@/db/migrations';
import { VoiceForgeRepository } from '@/db/repository';
import { mockJobs, mockSafetyReports, mockTimeEntries, mockVoiceLogs } from '@/mocks/data';

import { BunDatabaseConnection } from './support/bun-database';

describe('VoiceForge database', () => {
  let database: BunDatabaseConnection;
  let repository: VoiceForgeRepository;

  beforeEach(async () => {
    database = new BunDatabaseConnection();
    await migrateDatabase(database);
    repository = new VoiceForgeRepository(database);
  });

  afterEach(() => database.close());

  it('runs migrations idempotently', async () => {
    await migrateDatabase(database);
    const version = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    expect(version?.user_version).toBe(DATABASE_VERSION);
  });

  it('seeds demo data exactly once and hydrates typed collections', async () => {
    const demo = {
      jobs: mockJobs,
      timeEntries: mockTimeEntries,
      safetyReports: mockSafetyReports,
      voiceLogs: mockVoiceLogs,
    };

    await expect(repository.seedDemoData(demo)).resolves.toBe(true);
    await expect(repository.seedDemoData(demo)).resolves.toBe(false);

    expect(await repository.getJobs()).toEqual(expect.arrayContaining(mockJobs));
    expect(await repository.getJobs()).toHaveLength(mockJobs.length);
    expect(await repository.getTimeEntries()).toEqual(expect.arrayContaining(mockTimeEntries));
    expect(await repository.getTimeEntries()).toHaveLength(mockTimeEntries.length);
    expect(await repository.getSafetyReports()).toEqual(expect.arrayContaining(mockSafetyReports));
    expect(await repository.getSafetyReports()).toHaveLength(mockSafetyReports.length);
    expect(await repository.getVoiceLogs()).toEqual(expect.arrayContaining(mockVoiceLogs));
    expect(await repository.getVoiceLogs()).toHaveLength(mockVoiceLogs.length);
  });

  it('persists newly added voice logs', async () => {
    await repository.seedDemoData({ jobs: mockJobs, timeEntries: [], safetyReports: [], voiceLogs: [] });
    const log = {
      id: 'voice-new',
      timestamp: '2026-07-12T12:00:00.000Z',
      transcript: 'Checked the panel and found no hazards.',
      category: 'safety' as const,
      processed: true,
      jobId: 'j1',
      confidence: 0.91,
      provider: 'manual',
    };

    await repository.addVoiceLog(log);
    expect(await repository.getVoiceLogs()).toContainEqual(log);
  });

  it('rejects time entries for a missing job', async () => {
    await expect(
      database.runAsync(
        `INSERT INTO time_entries VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        't-missing', 'missing', 'Missing', '2026-07-12', '08:00', '09:00', 1,
        'regular', 'Invalid', 0, null, new Date().toISOString(), new Date().toISOString(),
      ),
    ).rejects.toThrow();
  });

  it('exports a versioned snapshot and clears user data', async () => {
    await repository.seedDemoData({
      jobs: mockJobs,
      timeEntries: mockTimeEntries,
      safetyReports: mockSafetyReports,
      voiceLogs: mockVoiceLogs,
    });

    const snapshot = await repository.exportSnapshot();
    expect(snapshot.schemaVersion).toBe(2);
    expect(snapshot.jobs).toHaveLength(mockJobs.length);
    expect(snapshot.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    await repository.clearUserData();
    expect(await repository.getJobs()).toEqual([]);
    expect(await repository.getTimeEntries()).toEqual([]);
    expect(await repository.getSafetyReports()).toEqual([]);
    expect(await repository.getVoiceLogs()).toEqual([]);
    expect(await repository.getSetting('demo_seeded', false)).toBe(true);
  });

  it('requires confirmation and audits voice-derived consequential records', async () => {
    await repository.seedDemoData({ jobs: mockJobs, timeEntries: [], safetyReports: [], voiceLogs: mockVoiceLogs });
    const entry = {
      id: 'time-confirmed', jobId: 'j1', jobTitle: mockJobs[0].title, date: '2026-07-12',
      startTime: '08:00', endTime: '09:00', hours: 1, type: 'regular' as const,
      notes: 'Voice-derived time', voiceLogged: true, sourceVoiceLogId: 'v1',
    };

    await expect(repository.addTimeEntry(entry)).rejects.toThrow('Explicit confirmation');
    await repository.addTimeEntry(entry, true);
    expect(await repository.getTimeEntries()).toContainEqual(entry);
    expect(await repository.getAuditEvents()).toEqual(expect.arrayContaining([
      expect.objectContaining({ entityType: 'time_entry', entityId: entry.id, action: 'confirmed', sourceVoiceLogId: 'v1' }),
    ]));
  });

  it('creates, updates, and deletes safety reports with audit history', async () => {
    await repository.seedDemoData({ jobs: mockJobs, timeEntries: [], safetyReports: [], voiceLogs: mockVoiceLogs });
    const report = {
      id: 'safety-confirmed', jobId: 'j1', jobTitle: mockJobs[0].title, date: '2026-07-12',
      type: 'hazard' as const, severity: 'high' as const, description: 'Exposed live wire',
      resolved: false, voiceLogged: true, sourceVoiceLogId: 'v2',
    };
    await repository.addSafetyReport(report, true);
    await repository.updateSafetyReport({ ...report, resolved: true });
    await repository.deleteRecord('safety_report', report.id);

    expect(await repository.getSafetyReports()).toEqual([]);
    expect((await repository.getAuditEvents()).filter((event) => event.entityId === report.id).map((event) => event.action)).toEqual(
      expect.arrayContaining(['confirmed', 'updated', 'deleted']),
    );
  });

  it('atomically completes clock-out and records its source in audit details', async () => {
    await repository.seedDemoData({ jobs: mockJobs, timeEntries: [], safetyReports: [], voiceLogs: [] });
    await repository.setSetting('clock_state', { clockedIn: true, clockInTime: '2026-07-12T08:00:00Z', jobId: 'j1' });
    const entry = { id: 'clock-entry', jobId: 'j1', jobTitle: mockJobs[0].title, date: '2026-07-12', startTime: '08:00', endTime: '10:00', hours: 2, type: 'regular' as const, notes: '', voiceLogged: false };
    await repository.completeClockOut(entry);
    expect(await repository.getSetting('clock_state', null)).toEqual({ clockedIn: false, clockInTime: null, jobId: null });
    expect(await repository.getTimeEntries()).toContainEqual(entry);
    expect(await repository.getAuditEvents()).toEqual(expect.arrayContaining([expect.objectContaining({ entityId: 'clock-entry', action: 'confirmed', details: expect.objectContaining({ source: 'clock' }) })]));
  });

  it('updates jobs but protects deletion while consequential records reference them', async () => {
    await repository.seedDemoData({ jobs: mockJobs, timeEntries: mockTimeEntries, safetyReports: [], voiceLogs: [] });
    await repository.updateJob({ ...mockJobs[0], title: 'Updated panel job' });
    expect(await repository.getJobs()).toContainEqual({ ...mockJobs[0], title: 'Updated panel job' });
    await expect(repository.deleteJob('j1')).rejects.toThrow();
  });
});
