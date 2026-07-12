import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

describe('VoiceForge API', () => {
  it('exposes a versioned health contract', async () => {
    const app = await buildApp();
    apps.push(app);
    const response = await app.inject({ method: 'GET', url: '/v1/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok', service: 'voiceforge-api', version: '0.1.0' });
  });

  it('uses the shared error envelope for unknown routes', async () => {
    const app = await buildApp();
    apps.push(app);
    const response = await app.inject({ method: 'GET', url: '/v1/missing' });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: { code: 'NOT_FOUND', details: {} } });
    expect(response.json().error.requestId).toMatch(/^req_/);
  });

  it('generates OpenAPI for registered v1 routes', async () => {
    const app = await buildApp();
    apps.push(app);
    await app.ready();
    const document = app.swagger();
    expect('openapi' in document && document.openapi).toBe('3.0.3');
    expect(document.paths).toHaveProperty('/v1/health');
  });
});
