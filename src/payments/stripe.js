import Stripe from "stripe";

let stripe;
function getStripe() {
  if (!stripe) {
    const stripeKey = process.env.STRIPE_SECRET;
    if (!stripeKey) throw new Error("STRIPE_SECRET not configured");
    stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });
  }
  return stripe;
}

/**
 * Create a refund in Stripe in idempotent way.
 * @param {Object} p
 * @param {string} [p.paymentIntentId]
 * @param {string} [p.chargeId]
 * @param {number} p.amount // minor units
 * @param {string} p.idempotencyKey
 * @param {boolean} [p.refundApplicationFee] // For Stripe Connect - refund platform fee
 * @param {boolean} [p.reverseTransfer] // For Stripe Connect - reverse transfer to connected account
 */
export async function refundPayment({
  paymentIntentId,
  chargeId,
  amount,
  idempotencyKey,
  refundApplicationFee = true,
  reverseTransfer = true,
}) {
  const s = getStripe();
  const body = { amount };
  if (paymentIntentId) body.payment_intent = paymentIntentId;
  if (!paymentIntentId && chargeId) body.charge = chargeId;
  if (!body.payment_intent && !body.charge)
    throw new Error("No Stripe reference for refund");

  // Add Stripe Connect refund parameters
  if (refundApplicationFee) {
    body.refund_application_fee = true;
  }
  if (reverseTransfer) {
    body.reverse_transfer = true;
  }

  const refund = await s.refunds.create(body, { idempotencyKey });
  console.log("[REFUND] Created:", refund.id, "Amount:", amount, "Connect:", {
    refundApplicationFee,
    reverseTransfer,
  });
  return refund;
}

export { getStripe };
export default { refundPayment, getStripe };
