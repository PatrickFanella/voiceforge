import { Type, type Static } from '@sinclair/typebox';

export const ApiErrorCode = Type.Union([
  Type.Literal('BAD_REQUEST'),
  Type.Literal('UNAUTHENTICATED'),
  Type.Literal('FORBIDDEN'),
  Type.Literal('NOT_FOUND'),
  Type.Literal('VERSION_CONFLICT'),
  Type.Literal('IDEMPOTENCY_CONFLICT'),
  Type.Literal('RATE_LIMITED'),
  Type.Literal('INTERNAL_ERROR'),
]);

export const ErrorEnvelope = Type.Object({
  error: Type.Object({
    code: ApiErrorCode,
    message: Type.String(),
    requestId: Type.String(),
    details: Type.Record(Type.String(), Type.Unknown()),
  }),
});

export const IdempotencyKeyHeader = Type.Object({
  'idempotency-key': Type.String({ minLength: 16, maxLength: 255 }),
});

export const Uuid = Type.String({ format: 'uuid' });
export const UtcDateTime = Type.String({ format: 'date-time' });

export type ErrorEnvelope = Static<typeof ErrorEnvelope>;
