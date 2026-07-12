import { useState, useEffect, useCallback } from 'react';
import createContextHook from '@nkzw/create-context-hook';
import { Job, TimeEntry, SafetyReport, VoiceLog } from '@/types';
import { mockJobs, mockTimeEntries, mockSafetyReports, mockVoiceLogs, mockWorker } from '@/mocks/data';
import { getRepository } from '@/db';
import { getLocalDateKey } from '@/domain/time';

interface ClockState {
  clockedIn: boolean;
  clockInTime: string | null;
  jobId?: string | null;
}

const DEFAULT_CLOCK_STATE: ClockState = { clockedIn: false, clockInTime: null, jobId: null };

export const [AppProvider, useApp] = createContextHook(() => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [safetyReports, setSafetyReports] = useState<SafetyReport[]>([]);
  const [voiceLogs, setVoiceLogs] = useState<VoiceLog[]>([]);
  const [clockedIn, setClockedIn] = useState<boolean>(false);
  const [clockInTime, setClockInTime] = useState<string | null>(null);
  const [clockJobId, setClockJobId] = useState<string | null>(null);
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
        setClockJobId(clockState.jobId ?? null);
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

  const startClock = useCallback(async (jobId: string) => {
    if (clockedIn) throw new Error('A clock session is already active');
    const nextState: ClockState = { clockedIn: true, clockInTime: new Date().toISOString(), jobId };
    const repository = await getRepository();
    await repository.setSetting('clock_state', nextState);
    setClockedIn(true);
    setClockInTime(nextState.clockInTime);
    setClockJobId(jobId);
  }, [clockedIn]);

  const completeClockOut = useCallback(async (entry: TimeEntry) => {
    const repository = await getRepository();
    await repository.completeClockOut(entry);
    setTimeEntries((entries) => [entry, ...entries]);
    setClockedIn(false);
    setClockInTime(null);
    setClockJobId(null);
  }, []);

  const addVoiceLog = useCallback(async (log: VoiceLog) => {
    const repository = await getRepository();
    await repository.addVoiceLog(log);
    setVoiceLogs(prev => [log, ...prev]);
  }, []);

  const addSafetyReport = useCallback(async (report: SafetyReport, confirmed = false) => {
    const repository = await getRepository();
    await repository.addSafetyReport(report, confirmed);
    setSafetyReports((reports) => [report, ...reports]);
  }, []);

  const addTimeEntry = useCallback(async (entry: TimeEntry, confirmed = false) => {
    const repository = await getRepository();
    await repository.addTimeEntry(entry, confirmed);
    setTimeEntries((entries) => [entry, ...entries]);
  }, []);

  const deleteRecord = useCallback(async (entityType: 'time_entry' | 'safety_report' | 'voice_log', id: string) => {
    const repository = await getRepository();
    await repository.deleteRecord(entityType, id);
    if (entityType === 'time_entry') setTimeEntries((entries) => entries.filter((entry) => entry.id !== id));
    if (entityType === 'safety_report') setSafetyReports((reports) => reports.filter((report) => report.id !== id));
    if (entityType === 'voice_log') setVoiceLogs((logs) => logs.filter((log) => log.id !== id));
  }, []);

  const updateTimeEntry = useCallback(async (entry: TimeEntry) => {
    const repository = await getRepository();
    await repository.updateTimeEntry(entry);
    setTimeEntries((entries) => entries.map((candidate) => candidate.id === entry.id ? entry : candidate));
  }, []);

  const updateSafetyReport = useCallback(async (report: SafetyReport) => {
    const repository = await getRepository();
    await repository.updateSafetyReport(report);
    setSafetyReports((reports) => reports.map((candidate) => candidate.id === report.id ? report : candidate));
  }, []);

  const updateJob = useCallback(async (job: Job) => {
    const repository = await getRepository();
    await repository.updateJob(job);
    setJobs((jobs) => jobs.map((candidate) => candidate.id === job.id ? job : candidate));
  }, []);

  const deleteJob = useCallback(async (id: string) => {
    const repository = await getRepository();
    await repository.deleteJob(id);
    setJobs((jobs) => jobs.filter((job) => job.id !== id));
    if (activeJobId === id) {
      setActiveJobId(null);
      await repository.setSetting('active_job_id', null);
    }
  }, [activeJobId]);

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
    setClockJobId(null);
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
    startClock,
    completeClockOut,
    clockJobId,
    addVoiceLog,
    addSafetyReport,
    addTimeEntry,
    deleteRecord,
    updateTimeEntry,
    updateSafetyReport,
    updateJob,
    deleteJob,
    todayEntries,
    todayHours,
    activeJobs,
    ready,
    loadError,
    exportData,
    clearData,
  };
});
