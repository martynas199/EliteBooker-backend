import Stripe from "stripe";

let platformStripe;
const connectedStripeClients = new Map();

function getStripe(connectedAccountId = null) {
  if (!connectedAccountId) {
    if (!platformStripe) {
      const stripeKey = process.env.STRIPE_SECRET;
      if (!stripeKey) throw new Error("STRIPE_SECRET not configured");
      platformStripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });
    }
    return platformStripe;
  }

  const existingClient = connectedStripeClients.get(connectedAccountId);
  if (existingClient) {
    return existingClient;
  }

  const stripeKey = process.env.STRIPE_SECRET;
  if (!stripeKey) throw new Error("STRIPE_SECRET not configured");
  const connectedClient = new Stripe(stripeKey, {
    apiVersion: "2024-06-20",
    stripeAccount: connectedAccountId,
  });
  connectedStripeClients.set(connectedAccountId, connectedClient);
  return connectedClient;
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
  connectedAccountId = null,
}) {
  const s = getStripe(connectedAccountId);
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
  console.log(
    "[REFUND] Created:",
    refund.id,
    "Amount:",
    amount,
    "Connect:",
    {
      refundApplicationFee,
      reverseTransfer,
      connectedAccountId: connectedAccountId || "platform",
    }
  );
  return refund;
}

export { getStripe };
export default { refundPayment, getStripe };
