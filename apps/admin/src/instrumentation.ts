import { startTracing } from '@voiceforge/observability';
export async function register() { if (process.env.NEXT_RUNTIME === 'nodejs') await startTracing('voiceforge-admin'); }
