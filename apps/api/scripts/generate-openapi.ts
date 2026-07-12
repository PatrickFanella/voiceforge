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
});
await app.ready();
await writeFile(new URL('../openapi.json', import.meta.url), `${JSON.stringify(app.swagger(), null, 2)}\n`);
await app.close();
