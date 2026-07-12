import * as SQLite from 'expo-sqlite';

import { migrateDatabase } from './migrations';
import { VoiceForgeRepository } from './repository';

let repositoryPromise: Promise<VoiceForgeRepository> | null = null;

export function getRepository(): Promise<VoiceForgeRepository> {
  if (!repositoryPromise) {
    repositoryPromise = SQLite.openDatabaseAsync('voiceforge.db').then(async (database) => {
      await migrateDatabase(database);
      return new VoiceForgeRepository(database);
    });
  }

  return repositoryPromise;
}
