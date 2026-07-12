import type { VoiceLog } from '@/types';

export type AudioRetentionDays = 7 | 30 | 90 | 0;

export function expiredAudioUris(logs: VoiceLog[], retentionDays: AudioRetentionDays, now: Date = new Date()): string[] {
  if (retentionDays === 0) return [];
  const cutoff = now.getTime() - retentionDays * 24 * 60 * 60 * 1000;
  return logs.filter((log) => log.audioUri && Date.parse(log.timestamp) < cutoff).map((log) => log.audioUri as string);
}
