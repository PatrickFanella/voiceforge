import { and, eq, sql } from 'drizzle-orm';
import { deriveEntitlement, type BillingStatus } from '@voiceforge/workflows';
import type { VoiceForgeDatabase } from './client.js';
import { entitlements, stripeWebhookEvents, subscriptions, workspaceMemberships } from './schema.js';

export type SubscriptionSnapshot = {
  customerId: string; subscriptionId: string; itemId: string; priceId: string; status: Exclude<BillingStatus, 'free'>;
  quantity: number; currentPeriodEnd: Date | null; cancelAtPeriodEnd: boolean;
};

export class BillingRepository {
  constructor(private readonly db: VoiceForgeDatabase, private readonly graceDays = 7) {}
  async get(workspaceId: string) {
    const [subscription] = await this.db.select().from(subscriptions).where(eq(subscriptions.workspaceId, workspaceId)).limit(1);
    const [entitlement] = await this.db.select().from(entitlements).where(eq(entitlements.workspaceId, workspaceId)).limit(1);
    const [usage] = await this.db.select({ count: sql<number>`count(*)::int` }).from(workspaceMemberships).where(and(eq(workspaceMemberships.workspaceId, workspaceId), eq(workspaceMemberships.status, 'active')));
    return { subscription: subscription ?? null, entitlement: entitlement ?? { source: 'free', readEnabled: true, exportEnabled: true, mutationEnabled: false, seatLimit: 1 }, activeSeats: usage?.count ?? 0 };
  }
  async saveCustomer(workspaceId: string, customerId: string) {
    await this.db.insert(subscriptions).values({ workspaceId, stripeCustomerId: customerId }).onConflictDoNothing();
    await this.db.insert(entitlements).values({ workspaceId, source: 'stripe', seatLimit: 1 }).onConflictDoNothing();
  }
  async findCustomer(workspaceId: string) {
    const [record] = await this.db.select({ customerId: subscriptions.stripeCustomerId }).from(subscriptions).where(eq(subscriptions.workspaceId, workspaceId)).limit(1);
    return record?.customerId ?? null;
  }
  async setPendingSeatQuantity(workspaceId: string, quantity: number | null) {
    await this.db.update(subscriptions).set({ pendingSeatQuantity: quantity, updatedAt: new Date() }).where(eq(subscriptions.workspaceId, workspaceId));
  }
  async reconcile(event: { id: string; type: string; created: Date; workspaceId: string; snapshot: SubscriptionSnapshot }) {
    return this.db.transaction(async (tx) => {
      const inserted = await tx.insert(stripeWebhookEvents).values({ eventId: event.id, eventType: event.type, eventCreated: event.created, payload: event.snapshot }).onConflictDoNothing().returning({ id: stripeWebhookEvents.eventId });
      if (!inserted.length) return { duplicate: true, stale: false };
      const [current] = await tx.select().from(subscriptions).where(eq(subscriptions.workspaceId, event.workspaceId)).limit(1).for('update');
      if (current?.lastStripeEventCreated && current.lastStripeEventCreated > event.created) return { duplicate: false, stale: true };
      const graceUntil = event.snapshot.status === 'past_due' ? new Date(event.created.getTime() + this.graceDays * 86_400_000) : null;
      const access = deriveEntitlement({ status: event.snapshot.status, now: event.created.getTime(), graceUntil: graceUntil?.getTime() ?? null });
      const delayedDecrease = current && event.snapshot.quantity < current.seatQuantity && current.currentPeriodEnd && current.currentPeriodEnd > event.created;
      const effectiveQuantity = delayedDecrease ? current.seatQuantity : event.snapshot.quantity;
      await tx.insert(subscriptions).values({ workspaceId: event.workspaceId, stripeCustomerId: event.snapshot.customerId, stripeSubscriptionId: event.snapshot.subscriptionId, stripeSubscriptionItemId: event.snapshot.itemId, stripePriceId: event.snapshot.priceId, status: event.snapshot.status, seatQuantity: effectiveQuantity, pendingSeatQuantity: delayedDecrease ? event.snapshot.quantity : null, currentPeriodEnd: event.snapshot.currentPeriodEnd, graceUntil, cancelAtPeriodEnd: event.snapshot.cancelAtPeriodEnd, lastStripeEventCreated: event.created })
        .onConflictDoUpdate({ target: subscriptions.workspaceId, set: { stripeCustomerId: event.snapshot.customerId, stripeSubscriptionId: event.snapshot.subscriptionId, stripeSubscriptionItemId: event.snapshot.itemId, stripePriceId: event.snapshot.priceId, status: event.snapshot.status, seatQuantity: effectiveQuantity, pendingSeatQuantity: delayedDecrease ? event.snapshot.quantity : null, currentPeriodEnd: event.snapshot.currentPeriodEnd, graceUntil, cancelAtPeriodEnd: event.snapshot.cancelAtPeriodEnd, lastStripeEventCreated: event.created, updatedAt: new Date() } });
      await tx.insert(entitlements).values({ workspaceId: event.workspaceId, source: 'stripe', readEnabled: access.read, exportEnabled: access.export, mutationEnabled: access.mutate, seatLimit: effectiveQuantity })
        .onConflictDoUpdate({ target: entitlements.workspaceId, set: { source: 'stripe', readEnabled: access.read, exportEnabled: access.export, mutationEnabled: access.mutate, seatLimit: effectiveQuantity, updatedAt: new Date() } });
      return { duplicate: false, stale: false };
    });
  }
}
