import Stripe from 'stripe';
import type { BillingWebhook, StripeGateway } from '../routes/billing.js';

const acceptedStatuses = new Set(['incomplete', 'trialing', 'active', 'past_due', 'unpaid', 'paused', 'canceled']);
export class StripeBillingGateway implements StripeGateway {
  constructor(private readonly stripe: Stripe, private readonly priceId: string, private readonly webhookSecret: string) {}
  async createCustomer(input: { workspaceId: string; email: string | null; idempotencyKey: string }) {
    const customer = await this.stripe.customers.create({ ...(input.email ? { email: input.email } : {}), metadata: { voiceforge_workspace_id: input.workspaceId } }, { idempotencyKey: input.idempotencyKey }); return customer.id;
  }
  async createCheckout(input: { workspaceId: string; customerId: string; quantity: number; successUrl: string; cancelUrl: string; idempotencyKey: string }) {
    const session = await this.stripe.checkout.sessions.create({ mode: 'subscription', customer: input.customerId, line_items: [{ price: this.priceId, quantity: input.quantity }], success_url: input.successUrl, cancel_url: input.cancelUrl, client_reference_id: input.workspaceId, metadata: { voiceforge_workspace_id: input.workspaceId }, subscription_data: { metadata: { voiceforge_workspace_id: input.workspaceId } } }, { idempotencyKey: input.idempotencyKey });
    if (!session.url) throw new Error('Stripe Checkout did not return a URL.'); return { url: session.url };
  }
  async createPortal(input: { customerId: string; returnUrl: string; idempotencyKey: string }) { const session = await this.stripe.billingPortal.sessions.create({ customer: input.customerId, return_url: input.returnUrl }, { idempotencyKey: input.idempotencyKey }); return { url: session.url }; }
  async updateSeats(input: { itemId: string; quantity: number; decreaseAtRenewal: boolean; idempotencyKey: string }) {
    await this.stripe.subscriptionItems.update(input.itemId, { quantity: input.quantity, proration_behavior: input.decreaseAtRenewal ? 'none' : 'always_invoice' }, { idempotencyKey: input.idempotencyKey });
  }
  async parseWebhook(rawBody: Buffer, signature: string): Promise<BillingWebhook> {
    const event = await this.stripe.webhooks.constructEventAsync(rawBody, signature, this.webhookSecret);
    if (!event.type.startsWith('customer.subscription.')) return { id: event.id, type: event.type, created: new Date(event.created * 1000), workspaceId: null, snapshot: null };
    const subscription = event.data.object as Stripe.Subscription; const item = subscription.items.data[0]; const workspaceId = subscription.metadata.voiceforge_workspace_id;
    if (!workspaceId || !item || !acceptedStatuses.has(subscription.status)) return { id: event.id, type: event.type, created: new Date(event.created * 1000), workspaceId: null, snapshot: null };
    return { id: event.id, type: event.type, created: new Date(event.created * 1000), workspaceId, snapshot: { customerId: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id, subscriptionId: subscription.id, itemId: item.id, priceId: item.price.id, status: subscription.status as any, quantity: item.quantity ?? 1, currentPeriodEnd: new Date(item.current_period_end * 1000), cancelAtPeriodEnd: subscription.cancel_at_period_end } };
  }
}
