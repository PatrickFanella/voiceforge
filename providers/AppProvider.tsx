import { useState, useEffect, useCallback } from 'react';
import createContextHook from '@nkzw/create-context-hook';
import { Job, TimeEntry, SafetyReport, VoiceLog } from '@/types';
import { mockJobs, mockTimeEntries, mockSafetyReports, mockVoiceLogs, mockWorker } from '@/mocks/data';
import { getRepository } from '@/db';
import { getLocalDateKey } from '@/domain/time';

interface ClockState {
  clockedIn: boolean;
  clockInTime: string | null;
}

const DEFAULT_CLOCK_STATE: ClockState = { clockedIn: false, clockInTime: null };

export const [AppProvider, useApp] = createContextHook(() => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [safetyReports, setSafetyReports] = useState<SafetyReport[]>([]);
  const [voiceLogs, setVoiceLogs] = useState<VoiceLog[]>([]);
  const [clockedIn, setClockedIn] = useState<boolean>(false);
  const [clockInTime, setClockInTime] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>('j1');
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function hydrate() {
      try {
        const repository = await getRepository();
        await repository.seedDemoData({
          jobs: mockJobs,
          timeEntries: mockTimeEntries,
          safetyReports: mockSafetyReports,
          voiceLogs: mockVoiceLogs,
        });
        const [storedJobs, storedTimeEntries, storedSafetyReports, storedVoiceLogs, clockState, storedActiveJobId] =
          await Promise.all([
            repository.getJobs(),
            repository.getTimeEntries(),
            repository.getSafetyReports(),
            repository.getVoiceLogs(),
            repository.getSetting<ClockState>('clock_state', DEFAULT_CLOCK_STATE),
            repository.getSetting<string | null>('active_job_id', 'j1'),
          ]);

        if (!active) return;
        setJobs(storedJobs);
        setTimeEntries(storedTimeEntries);
        setSafetyReports(storedSafetyReports);
        setVoiceLogs(storedVoiceLogs);
        setClockedIn(clockState.clockedIn);
        setClockInTime(clockState.clockInTime);
        setActiveJobId(storedActiveJobId);
      } catch (error) {
        if (active) setLoadError(error instanceof Error ? error.message : 'Unable to load VoiceForge data');
      } finally {
        if (active) setReady(true);
      }
    }

    void hydrate();
    return () => {
      active = false;
    };
  }, []);

  const toggleClock = useCallback(async () => {
    const nextState = clockedIn
      ? DEFAULT_CLOCK_STATE
      : { clockedIn: true, clockInTime: new Date().toISOString() };
    const repository = await getRepository();
    await repository.setSetting('clock_state', nextState);
    setClockedIn(nextState.clockedIn);
    setClockInTime(nextState.clockInTime);
  }, [clockedIn]);

  const addVoiceLog = useCallback(async (log: VoiceLog) => {
    const repository = await getRepository();
    await repository.addVoiceLog(log);
    setVoiceLogs(prev => [log, ...prev]);
  }, []);

  const selectActiveJob = useCallback(async (jobId: string | null) => {
    const repository = await getRepository();
    await repository.setSetting('active_job_id', jobId);
    setActiveJobId(jobId);
  }, []);

  const exportData = useCallback(async () => {
    const repository = await getRepository();
    return repository.exportSnapshot();
  }, []);

  const clearData = useCallback(async () => {
    const repository = await getRepository();
    await repository.clearUserData();
    setJobs([]);
    setTimeEntries([]);
    setSafetyReports([]);
    setVoiceLogs([]);
    setClockedIn(false);
    setClockInTime(null);
    setActiveJobId(null);
  }, []);

  const worker = mockWorker;
  const activeJob = jobs.find(j => j.id === activeJobId) ?? null;
  const todayEntries = timeEntries.filter(e => e.date === getLocalDateKey());
  const todayHours = todayEntries.reduce((sum, e) => sum + e.hours, 0);
  const activeJobs = jobs.filter(j => j.status === 'active');

  return {
    jobs,
    timeEntries,
    safetyReports,
    voiceLogs,
    worker,
    clockedIn,
    clockInTime,
    activeJob,
    activeJobId,
    setActiveJobId: selectActiveJob,
    toggleClock,
    addVoiceLog,
    todayEntries,
    todayHours,
    activeJobs,
    ready,
    loadError,
    exportData,
    clearData,
  };
});
