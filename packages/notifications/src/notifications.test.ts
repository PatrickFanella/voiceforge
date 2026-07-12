import { describe, expect, it, vi } from 'vitest';
import { createExpoPushAdapter } from './adapters.js';
import { createSafetyDeliveryProcessor } from './safety-processor.js';

describe('notification adapters and safety delivery', () => {
  it('normalizes Expo tickets and rejects provider failures', async () => {
    const success = createExpoPushAdapter({ fetch: vi.fn(async () => new Response(JSON.stringify({ data: { status: 'ok', id: 'ticket-1' } }), { status: 200 })) });
    await expect(success.send({ destination: 'ExponentPushToken[test]', title: 'Safety', body: 'Open app', data: {} })).resolves.toEqual({ messageId: 'ticket-1' });
    const failure = createExpoPushAdapter({ fetch: vi.fn(async () => new Response(JSON.stringify({ data: { status: 'error', message: 'DeviceNotRegistered' } }), { status: 200 })) });
    await expect(failure.send({ destination: 'bad', title: 'Safety', body: 'Open app', data: {} })).rejects.toThrow('DeviceNotRegistered');
  });

  it('records individual delivery success/failure and schedules repeated escalation', async () => {
    const next = new Date('2026-01-01T00:15:00Z');
    const repository = {
      prepareEscalation: vi.fn(async () => ({ deliveries: [
        { id: 'push-1', channel: 'push' as const, destination: 'token', safetyReportId: 'report', workspaceId: 'workspace', severity: 'critical', emergencyInstructions: 'Call emergency services.' },
        { id: 'email-1', channel: 'email' as const, destination: 'oncall@example.com', safetyReportId: 'report', workspaceId: 'workspace', severity: 'critical', emergencyInstructions: 'Call emergency services.' },
      ], nextEscalationAt: next })),
      markDelivery: vi.fn(),
    };
    const scheduleNext = vi.fn();
    const process = createSafetyDeliveryProcessor({
      repository,
      push: { send: async () => ({ messageId: 'ticket' }) },
      email: { send: async () => { throw new Error('SES unavailable'); } },
      scheduleNext, maxAttempts: 1,
    });
    await expect(process('report', new Date('2026-01-01T00:00:00Z'))).resolves.toBe(2);
    expect(repository.markDelivery).toHaveBeenCalledWith({ id: 'push-1', success: true, providerMessageId: 'ticket' });
    expect(repository.markDelivery).toHaveBeenCalledWith({ id: 'email-1', success: false, error: 'SES unavailable' });
    expect(scheduleNext).toHaveBeenCalledWith('report', next);
  });

  it('retries the same delivery ledger row with exponential delays before success', async () => {
    const repository = {
      prepareEscalation: vi.fn(async () => ({ deliveries: [
        { id: 'push-1', channel: 'push' as const, destination: 'token', safetyReportId: 'report', workspaceId: 'workspace', severity: 'critical', emergencyInstructions: 'Call emergency services.' },
      ], nextEscalationAt: null })),
      markDelivery: vi.fn(),
    };
    let attempts = 0;
    const delay = vi.fn(async () => undefined);
    const process = createSafetyDeliveryProcessor({
      repository, email: { send: vi.fn() }, scheduleNext: vi.fn(), delay, retryDelayMs: 10,
      push: { send: async () => { attempts += 1; if (attempts < 3) throw new Error('temporary'); return { messageId: 'ticket' }; } },
    });
    await process('report');
    expect(attempts).toBe(3);
    expect(delay.mock.calls).toEqual([[10], [20]]);
    expect(repository.markDelivery).toHaveBeenLastCalledWith({ id: 'push-1', success: true, providerMessageId: 'ticket' });
  });
});
