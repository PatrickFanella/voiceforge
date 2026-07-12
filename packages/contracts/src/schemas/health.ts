import { Type, type Static } from '@sinclair/typebox';

export const HealthResponse = Type.Object({
  status: Type.Literal('ok'),
  service: Type.Literal('voiceforge-api'),
  version: Type.String(),
  timestamp: Type.String({ format: 'date-time' }),
});

export type HealthResponse = Static<typeof HealthResponse>;
