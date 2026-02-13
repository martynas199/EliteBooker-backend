import { describe, expect, it, jest } from "@jest/globals";
import {
  getSessionLookupOrder,
  isStripeSessionResourceMissing,
  retrieveStripeCheckoutSession,
} from "../../src/utils/stripeSessionResolver.js";

function createStripeClient(retrieveImpl) {
  return {
    checkout: {
      sessions: {
        retrieve: retrieveImpl,
      },
    },
  };
}

const makeResourceMissingError = () => ({
  type: "StripeInvalidRequestError",
  code: "resource_missing",
  statusCode: 404,
});

describe("stripeSessionResolver", () => {
  it("detects Stripe resource missing errors", () => {
    expect(isStripeSessionResourceMissing(makeResourceMissingError())).toBe(
      true
    );
    expect(
      isStripeSessionResourceMissing(new Error("network timeout"))
    ).toBe(false);
  });

  it("builds lookup order with platform fallback", () => {
    expect(getSessionLookupOrder({ connectedAccountId: "acct_123" })).toEqual([
      "platform",
      "connected",
    ]);

    expect(
      getSessionLookupOrder({
        preferredSource: "connected",
        connectedAccountId: "acct_123",
      })
    ).toEqual(["connected", "platform"]);

    expect(getSessionLookupOrder({})).toEqual(["platform"]);
  });

  it("uses platform session when available", async () => {
    const platformRetrieve = jest.fn().mockResolvedValue({ id: "cs_platform" });
    const connectedRetrieve = jest.fn();

    const result = await retrieveStripeCheckoutSession({
      sessionId: "cs_platform",
      connectedAccountId: "acct_123",
      getPlatformStripe: () => createStripeClient(platformRetrieve),
      getConnectedStripe: () => createStripeClient(connectedRetrieve),
      logger: { warn: jest.fn() },
    });

    expect(result).toEqual({
      session: { id: "cs_platform" },
      source: "platform",
    });
    expect(platformRetrieve).toHaveBeenCalledTimes(1);
    expect(connectedRetrieve).not.toHaveBeenCalled();
  });

  it("falls back to connected account when platform does not have session", async () => {
    const platformRetrieve = jest
      .fn()
      .mockRejectedValue(makeResourceMissingError());
    const connectedRetrieve = jest
      .fn()
      .mockResolvedValue({ id: "cs_connected" });
    const warn = jest.fn();

    const result = await retrieveStripeCheckoutSession({
      sessionId: "cs_connected",
      connectedAccountId: "acct_123",
      getPlatformStripe: () => createStripeClient(platformRetrieve),
      getConnectedStripe: () => createStripeClient(connectedRetrieve),
      logger: { warn },
    });

    expect(result).toEqual({
      session: { id: "cs_connected" },
      source: "connected",
    });
    expect(platformRetrieve).toHaveBeenCalledTimes(1);
    expect(connectedRetrieve).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("rethrows non-resource-missing Stripe errors", async () => {
    const platformRetrieve = jest
      .fn()
      .mockRejectedValue(new Error("Stripe API timeout"));

    await expect(
      retrieveStripeCheckoutSession({
        sessionId: "cs_platform",
        connectedAccountId: "acct_123",
        getPlatformStripe: () => createStripeClient(platformRetrieve),
        getConnectedStripe: () => createStripeClient(jest.fn()),
        logger: { warn: jest.fn() },
      })
    ).rejects.toThrow("Stripe API timeout");
  });
});
