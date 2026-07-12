import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';

import type { VoiceLog } from '@/types';
import { expiredAudioUris, type AudioRetentionDays } from './retention-policy';
export type { AudioRetentionDays } from './retention-policy';

export function deleteAudioFile(uri?: string): void {
  if (!uri || Platform.OS === 'web' || !uri.startsWith('file:')) return;
  const file = new File(uri);
  if (file.exists) file.delete();
}

export function cleanupRetainedAudio(logs: VoiceLog[], retentionDays: AudioRetentionDays, now: Date = new Date()): string[] {
  if (Platform.OS === 'web') return [];
  const expired = expiredAudioUris(logs, retentionDays, now);
  expired.forEach(deleteAudioFile);

  const referenced = new Set(logs.map((log) => log.audioUri).filter(Boolean));
  const directory = new Directory(Paths.document, 'voice-recordings');
  if (directory.exists) {
    directory.list().forEach((entry) => {
      if (entry instanceof File && !referenced.has(entry.uri)) entry.delete();
    });
  }
  return expired;
}
