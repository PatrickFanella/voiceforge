import { useState, useEffect, useCallback } from 'react';
import createContextHook from '@nkzw/create-context-hook';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Job, TimeEntry, SafetyReport, VoiceLog } from '@/types';
import { mockJobs, mockTimeEntries, mockSafetyReports, mockVoiceLogs, mockWorker } from '@/mocks/data';

const STORAGE_KEYS = {
  JOBS: 'voiceforge_jobs',
  TIME_ENTRIES: 'voiceforge_time_entries',
  SAFETY_REPORTS: 'voiceforge_safety_reports',
  VOICE_LOGS: 'voiceforge_voice_logs',
  CLOCK_IN: 'voiceforge_clock_in',
} as const;

export const [AppProvider, useApp] = createContextHook(() => {
  const [jobs, setJobs] = useState<Job[]>(mockJobs);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>(mockTimeEntries);
  const [safetyReports, setSafetyReports] = useState<SafetyReport[]>(mockSafetyReports);
  const [voiceLogs, setVoiceLogs] = useState<VoiceLog[]>(mockVoiceLogs);
  const [clockedIn, setClockedIn] = useState<boolean>(false);
  const [clockInTime, setClockInTime] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>('j1');

  const clockQuery = useQuery({
    queryKey: ['clockStatus'],
    queryFn: async () => {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.CLOCK_IN);
      return stored ? JSON.parse(stored) : { clockedIn: false, clockInTime: null };
    },
  });

  useEffect(() => {
    if (clockQuery.data) {
      setClockedIn(clockQuery.data.clockedIn);
      setClockInTime(clockQuery.data.clockInTime);
    }
  }, [clockQuery.data]);

  const clockMutation = useMutation({
    mutationFn: async (data: { clockedIn: boolean; clockInTime: string | null }) => {
      await AsyncStorage.setItem(STORAGE_KEYS.CLOCK_IN, JSON.stringify(data));
      return data;
    },
    onSuccess: (data) => {
      setClockedIn(data.clockedIn);
      setClockInTime(data.clockInTime);
    },
  });

  const toggleClock = useCallback(() => {
    if (clockedIn) {
      clockMutation.mutate({ clockedIn: false, clockInTime: null });
    } else {
      clockMutation.mutate({ clockedIn: true, clockInTime: new Date().toISOString() });
    }
  }, [clockedIn, clockMutation]);

  const addVoiceLog = useCallback((log: VoiceLog) => {
    setVoiceLogs(prev => [log, ...prev]);
  }, []);

  const worker = mockWorker;
  const activeJob = jobs.find(j => j.id === activeJobId) ?? null;
  const todayEntries = timeEntries.filter(e => e.date === '2026-02-28');
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
    setActiveJobId,
    toggleClock,
    addVoiceLog,
    todayEntries,
    todayHours,
    activeJobs,
  };
});
