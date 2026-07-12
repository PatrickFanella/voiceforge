import { buildApp } from './app.js';

const app = await buildApp();
const port = Number.parseInt(process.env.PORT ?? '3000', 10);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => void app.close().finally(() => process.exit(0)));
}

await app.listen({ host: '0.0.0.0', port });
