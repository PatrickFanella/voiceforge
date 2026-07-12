export type BillingStatus = 'free' | 'incomplete' | 'trialing' | 'active' | 'past_due' | 'unpaid' | 'paused' | 'canceled';

export function deriveEntitlement(input: { status: BillingStatus; now: number; graceUntil: number | null }) {
  const paid = input.status === 'active' || input.status === 'trialing';
  const inGrace = input.status === 'past_due' && input.graceUntil !== null && input.now <= input.graceUntil;
  return { read: true, export: true, mutate: paid || inGrace };
}

export function nextSeatChange(current: number, requested: number) {
  if (!Number.isInteger(requested) || requested < 1) throw new Error('Seat quantity must be a positive integer.');
  return requested >= current
    ? { stripeQuantity: requested, effectiveQuantity: requested, pendingQuantity: null }
    : { stripeQuantity: requested, effectiveQuantity: current, pendingQuantity: requested };
}
