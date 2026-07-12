import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://voiceforge:voiceforge@localhost:5432/voiceforge',
  },
  strict: true,
  verbose: true,
});
