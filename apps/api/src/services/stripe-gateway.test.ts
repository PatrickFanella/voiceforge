import Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import { StripeBillingGateway } from './stripe-gateway.js';

const secret = 'whsec_test_voiceforge';
const stripe = new Stripe('sk_test_voiceforge');
const gateway = new StripeBillingGateway(stripe, 'price_team', secret);
const payload = JSON.stringify({ id: 'evt_1', object: 'event', created: 1_800_000_000, type: 'customer.subscription.updated', data: { object: { id: 'sub_1', object: 'subscription', customer: 'cus_1', status: 'active', cancel_at_period_end: false, metadata: { voiceforge_workspace_id: '01980f58-9b8d-7000-8000-000000000082' }, items: { object: 'list', data: [{ id: 'si_1', object: 'subscription_item', quantity: 4, current_period_end: 1_800_086_400, price: { id: 'price_team', object: 'price' } }] } } } });

describe('Stripe billing gateway', () => {
  it('verifies the raw signature and normalizes subscription evidence', async () => {
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret, timestamp: 1_800_000_000 });
    await expect(gateway.parseWebhook(Buffer.from(payload), 'bad')).rejects.toThrow();
    const event = await gateway.parseWebhook(Buffer.from(payload), signature);
    expect(event).toMatchObject({ id: 'evt_1', workspaceId: '01980f58-9b8d-7000-8000-000000000082', snapshot: { subscriptionId: 'sub_1', quantity: 4, status: 'active' } });
  });
});
