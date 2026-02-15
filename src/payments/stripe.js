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
  const requestedAmount = Math.trunc(Number(amount || 0));
  if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
    throw new Error("Invalid refund amount");
  }

  let safeAmount = requestedAmount;

  try {
    if (paymentIntentId) {
      const pi = await s.paymentIntents.retrieve(paymentIntentId);
      const paymentAmount = Math.trunc(Number(pi?.amount || 0));
      const applicationFee = Math.trunc(
        Number(pi?.application_fee_amount || 0),
      );
      if (paymentAmount > 0 && applicationFee > 0) {
        safeAmount = Math.min(
          safeAmount,
          Math.max(0, paymentAmount - applicationFee),
        );
      }
    } else if (chargeId) {
      const ch = await s.charges.retrieve(chargeId);
      const chargeAmount = Math.trunc(Number(ch?.amount || 0));
      const applicationFee = Math.trunc(
        Number(ch?.application_fee_amount || 0),
      );
      if (chargeAmount > 0 && applicationFee > 0) {
        safeAmount = Math.min(
          safeAmount,
          Math.max(0, chargeAmount - applicationFee),
        );
      }
    }
  } catch (lookupError) {
    console.warn(
      "[REFUND] Could not pre-calculate fee-safe refund cap:",
      lookupError?.message || lookupError,
    );
  }

  if (safeAmount <= 0) {
    throw new Error(
      "Refund amount is zero after excluding non-refundable application fee",
    );
  }

  const body = { amount: safeAmount };
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
    safeAmount,
    "Connect:",
    {
      requestedAmount,
      refundApplicationFee,
      reverseTransfer,
      connectedAccountId: connectedAccountId || "platform",
    },
  );
  return refund;
}

export { getStripe };
export default { refundPayment, getStripe };
