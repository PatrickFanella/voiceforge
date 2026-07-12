import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';

export interface DeliveryMessage {
  destination: string; title: string; body: string; data: Record<string, string>;
}
export interface DeliveryResult { messageId: string; }
export interface PushAdapter { send(message: DeliveryMessage): Promise<DeliveryResult>; }
export interface EmailAdapter { send(message: DeliveryMessage): Promise<DeliveryResult>; }

export function createExpoPushAdapter(options: { accessToken?: string; fetch?: typeof globalThis.fetch }): PushAdapter {
  const fetcher = options.fetch ?? globalThis.fetch;
  return {
    async send(message) {
      const response = await fetcher('https://exp.host/--/api/v2/push/send', {
        method: 'POST', headers: {
          'content-type': 'application/json', accept: 'application/json',
          ...(options.accessToken ? { authorization: `Bearer ${options.accessToken}` } : {}),
        },
        body: JSON.stringify({ to: message.destination, title: message.title, body: message.body, data: message.data, priority: 'high', sound: 'default' }),
      });
      const payload = await response.json() as { data?: { status?: string; id?: string; message?: string } };
      if (!response.ok || payload.data?.status !== 'ok' || !payload.data.id) throw new Error(payload.data?.message ?? `Expo push failed with ${response.status}.`);
      return { messageId: payload.data.id };
    },
  };
}

export function createSesEmailAdapter(options: { client: SESv2Client; from: string }): EmailAdapter {
  return {
    async send(message) {
      const response = await options.client.send(new SendEmailCommand({
        FromEmailAddress: options.from, Destination: { ToAddresses: [message.destination] },
        Content: { Simple: { Subject: { Data: message.title, Charset: 'UTF-8' }, Body: { Text: { Data: message.body, Charset: 'UTF-8' } } } },
      }));
      if (!response.MessageId) throw new Error('SES returned no message id.');
      return { messageId: response.MessageId };
    },
  };
}
