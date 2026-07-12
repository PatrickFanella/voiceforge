import { AuthorizationError, requirePermission, type TokenVerifier } from '@voiceforge/auth';
import { IdempotencyKeyHeader } from '@voiceforge/contracts';
import type { BillingRepository, SubscriptionSnapshot } from '@voiceforge/database';
import { nextSeatChange } from '@voiceforge/workflows';
import type { FastifyInstance } from 'fastify';
import { identityFor, type TenancyStore } from './tenancy.js';

export type BillingWebhook = { id: string; type: string; created: Date; workspaceId: string; snapshot: SubscriptionSnapshot } | { id: string; type: string; created: Date; workspaceId: null; snapshot: null };
export interface StripeGateway {
  createCustomer(input: { workspaceId: string; email: string | null; idempotencyKey: string }): Promise<string>;
  createCheckout(input: { workspaceId: string; customerId: string; quantity: number; successUrl: string; cancelUrl: string; idempotencyKey: string }): Promise<{ url: string }>;
  createPortal(input: { customerId: string; returnUrl: string; idempotencyKey: string }): Promise<{ url: string }>;
  updateSeats(input: { itemId: string; quantity: number; decreaseAtRenewal: boolean; idempotencyKey: string }): Promise<void>;
  parseWebhook(rawBody: Buffer, signature: string): Promise<BillingWebhook>;
}
type BillingStore = Pick<BillingRepository, 'get' | 'saveCustomer' | 'findCustomer' | 'setPendingSeatQuantity' | 'reconcile'>;

export async function registerBillingRoutes(app: FastifyInstance, dependencies: { verifier: TokenVerifier; tenancy: TenancyStore; repository: BillingStore; stripe: StripeGateway }) {
  const accessFor = async (request: Parameters<typeof identityFor>[0], workspaceId: string) => {
    const { session } = await identityFor(request, dependencies.verifier, dependencies.tenancy);
    const access = await dependencies.tenancy.getAccess(session.user.id, workspaceId);
    if (!access) throw new AuthorizationError('billing:manage');
    requirePermission(access.role, 'billing:manage', access.kind);
    return { session, access };
  };
  app.get<{ Querystring: { workspaceId: string } }>('/v1/billing/status', { schema: { operationId: 'getBillingStatus', tags: ['billing'], querystring: workspaceQuery } }, async (request) => {
    const { access } = await accessFor(request, request.query.workspaceId);
    return dependencies.repository.get(access.id);
  });
  app.post<{ Headers: { 'idempotency-key': string }; Body: { workspaceId: string; quantity: number; successUrl: string; cancelUrl: string } }>('/v1/billing/checkout', { schema: { operationId: 'createBillingCheckout', tags: ['billing'], headers: IdempotencyKeyHeader, body: checkoutBody } }, async (request) => {
    const { session, access } = await accessFor(request, request.body.workspaceId);
    let customerId = await dependencies.repository.findCustomer(access.id);
    if (!customerId) { customerId = await dependencies.stripe.createCustomer({ workspaceId: access.id, email: session.user.primaryEmail, idempotencyKey: `${request.headers['idempotency-key']}:customer` }); await dependencies.repository.saveCustomer(access.id, customerId); }
    return dependencies.stripe.createCheckout({ workspaceId: access.id, customerId, quantity: request.body.quantity, successUrl: request.body.successUrl, cancelUrl: request.body.cancelUrl, idempotencyKey: request.headers['idempotency-key'] });
  });
  app.post<{ Headers: { 'idempotency-key': string }; Body: { workspaceId: string; returnUrl: string } }>('/v1/billing/portal', { schema: { operationId: 'createBillingPortal', tags: ['billing'], headers: IdempotencyKeyHeader, body: portalBody } }, async (request) => {
    const { access } = await accessFor(request, request.body.workspaceId); const customerId = await dependencies.repository.findCustomer(access.id);
    if (!customerId) throw new Error('This workspace has no billing account.');
    return dependencies.stripe.createPortal({ customerId, returnUrl: request.body.returnUrl, idempotencyKey: request.headers['idempotency-key'] });
  });
  app.post<{ Headers: { 'idempotency-key': string }; Body: { workspaceId: string; quantity: number } }>('/v1/billing/seats', { schema: { operationId: 'updateBillingSeats', tags: ['billing'], headers: IdempotencyKeyHeader, body: seatsBody } }, async (request) => {
    const { access } = await accessFor(request, request.body.workspaceId); const state = await dependencies.repository.get(access.id); const subscription = state.subscription;
    if (!subscription?.stripeSubscriptionItemId) throw new Error('This workspace has no active subscription item.');
    if (request.body.quantity < state.activeSeats) throw Object.assign(new Error('Seat quantity cannot be below active membership.'), { statusCode: 400 });
    const change = nextSeatChange(subscription.seatQuantity, request.body.quantity);
    await dependencies.stripe.updateSeats({ itemId: subscription.stripeSubscriptionItemId, quantity: change.stripeQuantity, decreaseAtRenewal: change.pendingQuantity !== null, idempotencyKey: request.headers['idempotency-key'] });
    await dependencies.repository.setPendingSeatQuantity(access.id, change.pendingQuantity);
    return change;
  });
  app.post('/v1/billing/webhooks/stripe', { config: { rawBody: true }, schema: { operationId: 'handleStripeWebhook', tags: ['billing'] } }, async (request, reply) => {
    const signature = request.headers['stripe-signature'];
    if (typeof signature !== 'string' || !request.rawBody) return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: 'Stripe signature is required.', requestId: request.id, details: {} } });
    const event = await dependencies.stripe.parseWebhook(Buffer.isBuffer(request.rawBody) ? request.rawBody : Buffer.from(request.rawBody), signature);
    if (event.workspaceId && event.snapshot) await dependencies.repository.reconcile({ ...event, workspaceId: event.workspaceId, snapshot: event.snapshot });
    return reply.code(200).send({ received: true });
  });
}
const workspaceQuery = { type: 'object', required: ['workspaceId'], properties: { workspaceId: { type: 'string', format: 'uuid' } } } as const;
const url = { type: 'string', format: 'uri', maxLength: 2048 } as const;
const checkoutBody = { type: 'object', additionalProperties: false, required: ['workspaceId', 'quantity', 'successUrl', 'cancelUrl'], properties: { workspaceId: { type: 'string', format: 'uuid' }, quantity: { type: 'integer', minimum: 1, maximum: 10000 }, successUrl: url, cancelUrl: url } } as const;
const portalBody = { type: 'object', additionalProperties: false, required: ['workspaceId', 'returnUrl'], properties: { workspaceId: { type: 'string', format: 'uuid' }, returnUrl: url } } as const;
const seatsBody = { type: 'object', additionalProperties: false, required: ['workspaceId', 'quantity'], properties: { workspaceId: { type: 'string', format: 'uuid' }, quantity: { type: 'integer', minimum: 1, maximum: 10000 } } } as const;
