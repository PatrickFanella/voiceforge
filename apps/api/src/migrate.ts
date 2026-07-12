import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDatabase } from '@voiceforge/database';
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required.');
const database = createDatabase(url);
try { await migrate(database.db, { migrationsFolder: process.env.MIGRATIONS_FOLDER ?? '/app/migrations' }); } finally { await database.close(); }
