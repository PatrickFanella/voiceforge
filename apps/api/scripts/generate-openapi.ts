import { writeFile } from 'node:fs/promises';
import { buildApp } from '../src/app.js';

const unavailable = async () => { throw new Error('Dependency is unavailable during contract generation.'); };
const app = await buildApp({
  verifier: { verify: unavailable },
  tenancy: {
    bootstrapIdentity: unavailable,
    createTeam: unavailable,
    getAccess: unavailable,
    createInvitation: unavailable,
    acceptInvitation: unavailable,
  },
  jobs: { list: unavailable, create: unavailable, update: unavailable, delete: unavailable },
  sync: { pull: unavailable },
  cursorSecret: 'contract-generation-only',
});
await app.ready();
await writeFile(new URL('../openapi.json', import.meta.url), `${JSON.stringify(app.swagger(), null, 2)}\n`);
await app.close();
