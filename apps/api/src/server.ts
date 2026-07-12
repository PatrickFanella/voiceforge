import { createAuth0TokenVerifier } from '@voiceforge/auth';
import { createDatabase, JobRepository, TenancyRepository } from '@voiceforge/database';
import { buildApp } from './app.js';

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
};
const database = createDatabase(required('DATABASE_URL'));
const app = await buildApp({
  verifier: createAuth0TokenVerifier({ issuer: required('AUTH0_ISSUER'), audience: required('AUTH0_AUDIENCE') }),
  tenancy: new TenancyRepository(database.db),
  jobs: new JobRepository(database.db),
});
const port = Number.parseInt(process.env.PORT ?? '3000', 10);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => void app.close().then(database.close).finally(() => process.exit(0)));
}

await app.listen({ host: '0.0.0.0', port });
