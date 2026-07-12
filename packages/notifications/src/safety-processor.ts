import type { EmailAdapter, PushAdapter } from './adapters.js';

export interface PreparedSafetyDelivery {
  id: string; channel: 'push' | 'email'; destination: string; safetyReportId: string; workspaceId: string;
  severity: string; emergencyInstructions: string;
}
export interface SafetyDeliveryRepository {
  prepareEscalation(id: string, now?: Date): Promise<{ deliveries: PreparedSafetyDelivery[]; nextEscalationAt: Date | null }>;
  markDelivery(input: { id: string; success: boolean; providerMessageId?: string; error?: string }): Promise<void>;
}

export function createSafetyDeliveryProcessor(dependencies: {
  repository: SafetyDeliveryRepository; push: PushAdapter; email: EmailAdapter;
  scheduleNext: (reportId: string, at: Date) => Promise<void>;
  maxAttempts?: number; retryDelayMs?: number; delay?: (milliseconds: number) => Promise<void>;
}) {
  return async (reportId: string, now = new Date()) => {
    const prepared = await dependencies.repository.prepareEscalation(reportId, now);
    for (const delivery of prepared.deliveries) {
      const adapter = delivery.channel === 'push' ? dependencies.push : dependencies.email;
      const maxAttempts = dependencies.maxAttempts ?? 5;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          const result = await adapter.send({
            destination: delivery.destination,
            title: `${delivery.severity.toUpperCase()} safety report requires acknowledgement`,
            body: `Open VoiceForge to acknowledge and triage this report. ${delivery.emergencyInstructions}`,
            data: { type: 'safety_report', workspaceId: delivery.workspaceId, safetyReportId: delivery.safetyReportId },
          });
          await dependencies.repository.markDelivery({ id: delivery.id, success: true, providerMessageId: result.messageId });
          break;
        } catch (error) {
          await dependencies.repository.markDelivery({ id: delivery.id, success: false, error: error instanceof Error ? error.message : 'Delivery failed.' });
          if (attempt < maxAttempts) await (dependencies.delay ?? wait)((dependencies.retryDelayMs ?? 1_000) * 2 ** (attempt - 1));
        }
      }
    }
    if (prepared.nextEscalationAt) await dependencies.scheduleNext(reportId, prepared.nextEscalationAt);
    return prepared.deliveries.length;
  };
}

const wait = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
