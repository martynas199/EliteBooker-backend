import { createLogger } from "./logger.js";

const PLATFORM_SOURCE = "platform";
const CONNECTED_SOURCE = "connected";
const defaultLogger = createLogger({ scope: "stripe-session-resolver" });

export function isStripeSessionResourceMissing(error) {
  return (
    error?.type === "StripeInvalidRequestError" &&
    error?.code === "resource_missing"
  );
}

export function getSessionLookupOrder({
  preferredSource = PLATFORM_SOURCE,
  connectedAccountId = null,
} = {}) {
  const normalizedPreferred =
    preferredSource === CONNECTED_SOURCE ? CONNECTED_SOURCE : PLATFORM_SOURCE;

  if (!connectedAccountId) {
    return [PLATFORM_SOURCE];
  }

  if (normalizedPreferred === CONNECTED_SOURCE) {
    return [CONNECTED_SOURCE, PLATFORM_SOURCE];
  }

  return [PLATFORM_SOURCE, CONNECTED_SOURCE];
}

export async function retrieveStripeCheckoutSession({
  sessionId,
  preferredSource = PLATFORM_SOURCE,
  connectedAccountId = null,
  getPlatformStripe,
  getConnectedStripe,
  expand = ["payment_intent"],
  logger = defaultLogger,
}) {
  if (!sessionId) {
    throw new Error("Missing Stripe checkout session id");
  }
  if (typeof getPlatformStripe !== "function") {
    throw new Error("Missing getPlatformStripe resolver");
  }

  const lookupOrder = getSessionLookupOrder({
    preferredSource,
    connectedAccountId,
  });

  let missingError = null;

  for (const source of lookupOrder) {
    const stripe =
      source === CONNECTED_SOURCE
        ? getConnectedStripe?.(connectedAccountId)
        : getPlatformStripe();

    if (!stripe?.checkout?.sessions?.retrieve) {
      throw new Error(`Invalid Stripe client for ${source} account`);
    }

    try {
      const session = await stripe.checkout.sessions.retrieve(String(sessionId), {
        expand,
      });

      return { session, source };
    } catch (error) {
      if (isStripeSessionResourceMissing(error)) {
        missingError = error;
        if (lookupOrder.length > 1) {
          logger?.warn?.(
            `[CHECKOUT CONFIRM] Session ${sessionId} not found on ${source} account, attempting fallback`
          );
        }
        continue;
      }
      throw error;
    }
  }

  if (missingError) {
    throw missingError;
  }

  throw new Error("Unable to retrieve Stripe checkout session");
}

export default {
  isStripeSessionResourceMissing,
  getSessionLookupOrder,
  retrieveStripeCheckoutSession,
};
