export interface Job {
  id: string;
  title: string;
  client: string;
  address: string;
  status: 'active' | 'pending' | 'completed' | 'paused';
  trade: 'plumbing' | 'electrical' | 'hvac' | 'construction' | 'general';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  startDate: string;
  dueDate: string;
  hoursLogged: number;
  hoursEstimated: number;
  notes: string[];
  crew: string[];
}

export interface TimeEntry {
  id: string;
  jobId: string;
  jobTitle: string;
  date: string;
  startTime: string;
  endTime: string;
  hours: number;
  type: 'regular' | 'overtime' | 'travel';
  notes: string;
  voiceLogged: boolean;
  sourceVoiceLogId?: string;
}

export interface SafetyReport {
  id: string;
  jobId: string;
  jobTitle: string;
  date: string;
  type: 'incident' | 'hazard' | 'inspection' | 'compliance';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  resolved: boolean;
  voiceLogged: boolean;
  sourceVoiceLogId?: string;
}

export interface VoiceLog {
  id: string;
  timestamp: string;
  transcript: string;
  category: 'time' | 'safety' | 'materials' | 'note' | 'communication';
  processed: boolean;
  jobId?: string;
  audioUri?: string;
  confidence?: number;
  provider?: string;
}

export interface WorkerProfile {
  name: string;
  trade: string;
  company: string;
  crewId: string;
  hoursThisWeek: number;
  jobsCompleted: number;
  safetyScore: number;
}
