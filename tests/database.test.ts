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
});
