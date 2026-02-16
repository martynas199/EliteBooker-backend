import { Router } from "express";
import Stripe from "stripe";
import GiftCard from "../models/GiftCard.js";
import Tenant from "../models/Tenant.js";
import Specialist from "../models/Specialist.js";
import { authenticateClient } from "../middleware/clientAuth.js";
import {
  sendGiftCardPurchaseConfirmation,
  sendGiftCardToRecipient,
  sendGiftCardSaleNotification,
} from "../emails/giftCardMailer.js";

const router = Router();
let stripeInstance = null;

function getStripe() {
  if (!stripeInstance) {
    const stripeKey = process.env.STRIPE_SECRET;
    if (!stripeKey) {
      throw new Error("STRIPE_SECRET not configured");
    }
    stripeInstance = new Stripe(stripeKey, { apiVersion: "2024-06-20" });
  }
  return stripeInstance;
}

const normalizeGiftCardCode = (code = "") =>
  String(code || "")
    .trim()
    .toUpperCase();

const sanitizeEmail = (email = "") =>
  String(email || "")
    .trim()
    .toLowerCase();

const isValidEmail = (email = "") =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ""));

const sanitizeAmount = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return NaN;
  return Math.round(parsed * 100) / 100;
};

const parseDeliveryDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const toMinorUnits = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return NaN;
  return Math.round(parsed * 100);
};

const buildExpiryDate = () => {
  const expiryDate = new Date();
  expiryDate.setFullYear(expiryDate.getFullYear() + 1);
  return expiryDate;
};

const normalizePlatformFeeMinor = (amountMinor) => {
  const configuredFee = Number(process.env.STRIPE_PLATFORM_FEE || 99);
  if (!Number.isFinite(configuredFee) || configuredFee < 0) return 0;
  return Math.min(Math.round(configuredFee), Math.max(0, amountMinor - 1));
};

const getGiftCardDestinationCandidates = async ({ tenantId, specialistId }) => {
  const candidates = [];
  const seen = new Set();

  const addCandidate = (candidate) => {
    if (!candidate?.accountId) return;
    const key = `${candidate.recipientType}:${candidate.recipientId}:${candidate.accountId}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(candidate);
  };

  if (specialistId) {
    const selectedSpecialist = await Specialist.findOne({
      _id: specialistId,
      tenantId,
      active: { $ne: false },
      stripeAccountId: { $exists: true, $ne: null },
      stripeStatus: "connected",
      stripePayoutsEnabled: true,
    })
      .select("_id stripeAccountId")
      .lean();

    if (selectedSpecialist?.stripeAccountId) {
      addCandidate({
        accountId: selectedSpecialist.stripeAccountId,
        recipientType: "specialist",
        recipientId: String(selectedSpecialist._id),
      });
    }
  }

  const tenant = await Tenant.findById(tenantId)
    .select("stripeAccountId")
    .lean();

  if (tenant?.stripeAccountId) {
    addCandidate({
      accountId: tenant.stripeAccountId,
      recipientType: "tenant",
      recipientId: String(tenantId),
    });
  }

  const fallbackSpecialists = await Specialist.find({
    tenantId,
    active: { $ne: false },
    stripeAccountId: { $exists: true, $ne: null },
    stripeStatus: "connected",
    stripePayoutsEnabled: true,
  })
    .sort({ createdAt: 1 })
    .select("_id stripeAccountId")
    .lean();

  fallbackSpecialists.forEach((specialist) => {
    addCandidate({
      accountId: specialist.stripeAccountId,
      recipientType: "specialist",
      recipientId: String(specialist._id),
    });
  });

  return candidates;
};

const validateStripeDestinationAccount = async ({ stripe, accountId }) => {
  const normalizedAccountId = String(accountId || "").trim();
  if (
    !normalizedAccountId ||
    !/^acct_[A-Za-z0-9]+$/.test(normalizedAccountId)
  ) {
    return {
      isValid: false,
      reason: "invalid_account_id",
    };
  }

  try {
    const account = await stripe.accounts.retrieve(normalizedAccountId);

    if (!account || account.deleted) {
      return {
        isValid: false,
        reason: "account_not_found",
      };
    }

    if (!account.charges_enabled) {
      return {
        isValid: false,
        reason: "charges_not_enabled",
      };
    }

    if (!account.payouts_enabled) {
      return {
        isValid: false,
        reason: "payouts_not_enabled",
      };
    }

    return {
      isValid: true,
      reason: "ok",
    };
  } catch (error) {
    const isMissingAccount = error?.code === "resource_missing";
    const isInvalidOrRevokedAccount =
      error?.code === "account_invalid" ||
      error?.type === "StripePermissionError" ||
      error?.statusCode === 403;

    if (isMissingAccount || isInvalidOrRevokedAccount) {
      return {
        isValid: false,
        reason: isMissingAccount
          ? "account_not_found"
          : "account_not_accessible",
      };
    }
    throw error;
  }
};

const generateUniqueGiftCardCode = async () => {
  let code;
  let codeExists = true;
  let attempts = 0;

  while (codeExists && attempts < 10) {
    code = GiftCard.generateCode();
    const existing = await GiftCard.findOne({ code }).select("_id").lean();
    codeExists = !!existing;
    attempts++;
  }

  if (codeExists) {
    throw new Error("Failed to generate unique code");
  }

  return code;
};

const sendGiftCardEmails = async (giftCardId) => {
  const populatedGiftCard = await GiftCard.findById(giftCardId)
    .populate("tenantId")
    .populate("specialistId");

  if (!populatedGiftCard) return;

  const tenant = populatedGiftCard.tenantId;
  const specialist = populatedGiftCard.specialistId;

  const now = new Date();
  const shouldSendRecipientNow =
    populatedGiftCard.deliveryType !== "scheduled" ||
    !populatedGiftCard.deliveryDate ||
    new Date(populatedGiftCard.deliveryDate) <= now;

  const updates = {};

  if (!populatedGiftCard.purchaseConfirmationSentAt) {
    await sendGiftCardPurchaseConfirmation({
      giftCard: populatedGiftCard,
      tenant,
      specialist,
    });
    updates.purchaseConfirmationSentAt = new Date();
  }

  if (!populatedGiftCard.saleNotificationSentAt) {
    await sendGiftCardSaleNotification({
      giftCard: populatedGiftCard,
      tenant,
      specialist,
    });
    updates.saleNotificationSentAt = new Date();
  }

  if (shouldSendRecipientNow && !populatedGiftCard.recipientEmailSentAt) {
    await sendGiftCardToRecipient({
      giftCard: populatedGiftCard,
      tenant,
      specialist,
    });
    updates.recipientEmailSentAt = new Date();
  }

  if (Object.keys(updates).length > 0) {
    await GiftCard.updateOne({ _id: populatedGiftCard._id }, { $set: updates });
  }
};

/**
 * GET /api/gift-cards/my/purchased
 * Get gift cards purchased by authenticated client
 * Requires authentication
 */
router.get("/my/purchased", authenticateClient, async (req, res) => {
  try {
    const giftCards = await GiftCard.find({ purchaserClientId: req.clientId })
      .populate("tenantId", "name slug")
      .populate("specialistId", "name")
      .sort({ purchaseDate: -1 });

    res.json({ giftCards });
  } catch (error) {
    console.error("[GIFT CARDS] Get purchased error:", error);
    res.status(500).json({ error: "Failed to fetch gift cards" });
  }
});

/**
 * GET /api/gift-cards/my/received
 * Get gift cards received by authenticated client
 * Requires authentication
 */
router.get("/my/received", authenticateClient, async (req, res) => {
  try {
    const giftCards = await GiftCard.find({
      recipientEmail: sanitizeEmail(req.client?.email),
    })
      .populate("tenantId", "name slug")
      .populate("specialistId", "name")
      .sort({ purchaseDate: -1 });

    res.json({ giftCards });
  } catch (error) {
    console.error("[GIFT CARDS] Get received error:", error);
    res.status(500).json({ error: "Failed to fetch gift cards" });
  }
});

/**
 * POST /api/gift-cards/create-session
 * Create Stripe checkout session for gift card purchase
 */
router.post("/create-session", authenticateClient, async (req, res) => {
  let giftCard = null;

  try {
    const {
      tenantId,
      specialistId,
      amount,
      recipientName,
      recipientEmail,
      message,
      deliveryType,
      deliveryAt,
    } = req.body || {};

    const sanitizedAmount = sanitizeAmount(amount);
    const amountMinor = toMinorUnits(sanitizedAmount);
    const sanitizedRecipientName = String(recipientName || "").trim();
    const sanitizedRecipientEmail = sanitizeEmail(recipientEmail);
    const sanitizedMessage = String(message || "").trim();
    const normalizedDeliveryType =
      deliveryType === "scheduled" ? "scheduled" : "immediate";
    const parsedDeliveryAt = parseDeliveryDate(deliveryAt);

    if (
      !tenantId ||
      !Number.isFinite(sanitizedAmount) ||
      !Number.isFinite(amountMinor) ||
      !sanitizedRecipientName ||
      !sanitizedRecipientEmail
    ) {
      return res.status(400).json({
        error:
          "Missing required fields: tenantId, amount, recipientName, recipientEmail",
      });
    }

    if (!isValidEmail(sanitizedRecipientEmail)) {
      return res.status(400).json({ error: "Invalid recipient email" });
    }

    if (sanitizedAmount < 10) {
      return res
        .status(400)
        .json({ error: "Gift card amount must be at least £10" });
    }

    if (sanitizedAmount > 2000) {
      return res
        .status(400)
        .json({ error: "Gift card amount cannot exceed £2000" });
    }

    if (sanitizedMessage.length > 500) {
      return res
        .status(400)
        .json({ error: "Message must be 500 characters or less" });
    }

    if (normalizedDeliveryType === "scheduled") {
      if (!parsedDeliveryAt) {
        return res
          .status(400)
          .json({ error: "Invalid scheduled delivery date" });
      }

      const now = Date.now();
      const minScheduledMs = now + 5 * 60 * 1000;
      const maxScheduledMs = now + 365 * 24 * 60 * 60 * 1000;

      if (parsedDeliveryAt.getTime() < minScheduledMs) {
        return res.status(400).json({
          error: "Scheduled delivery must be at least 5 minutes from now",
        });
      }

      if (parsedDeliveryAt.getTime() > maxScheduledMs) {
        return res.status(400).json({
          error: "Scheduled delivery cannot be more than 12 months ahead",
        });
      }
    }

    const tenant = await Tenant.findById(tenantId)
      .select("name slug features stripeAccountId")
      .lean();
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    if (!tenant.features?.enableGiftCards) {
      return res.status(400).json({
        error: "Gift cards are not enabled for this business",
      });
    }

    if (specialistId) {
      const specialist = await Specialist.findById(specialistId)
        .select("tenantId")
        .lean();
      if (!specialist || String(specialist.tenantId) !== String(tenantId)) {
        return res.status(404).json({ error: "Specialist not found" });
      }
    }

    const payoutCandidates = await getGiftCardDestinationCandidates({
      tenantId,
      specialistId,
    });

    if (payoutCandidates.length === 0) {
      return res.status(400).json({
        error:
          "This business is not yet ready to receive gift card payments. Please try another business.",
      });
    }

    const frontend = process.env.FRONTEND_URL || "http://localhost:5173";
    const tenantPath = tenant?.slug ? `/salon/${tenant.slug}` : "";
    const stripe = getStripe();
    const platformFeeMinor = normalizePlatformFeeMinor(amountMinor);

    let payoutDestination = null;
    for (const candidate of payoutCandidates) {
      const destinationValidation = await validateStripeDestinationAccount({
        stripe,
        accountId: candidate.accountId,
      });

      if (destinationValidation.isValid) {
        payoutDestination = candidate;
        break;
      }

      console.warn("[GIFT CARDS] Skipping invalid payout destination", {
        tenantId,
        specialistId,
        destinationAccount: candidate.accountId,
        reason: destinationValidation.reason,
      });
    }

    if (!payoutDestination?.accountId) {
      return res.status(400).json({
        error:
          "This business is not yet ready to receive gift card payments. Please try another business.",
      });
    }

    const code = await generateUniqueGiftCardCode();
    const expiryDate = buildExpiryDate();

    giftCard = await GiftCard.create({
      code,
      tenantId,
      specialistId,
      amount: sanitizedAmount,
      purchaserName: req.client.name,
      purchaserEmail: sanitizeEmail(req.client.email),
      purchaserClientId: req.clientId,
      recipientName: sanitizedRecipientName,
      recipientEmail: sanitizedRecipientEmail,
      message: sanitizedMessage || undefined,
      deliveryType: normalizedDeliveryType,
      deliveryDate:
        normalizedDeliveryType === "scheduled" ? parsedDeliveryAt : undefined,
      expiryDate,
      status: "pending",
    });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      client_reference_id: String(giftCard._id),
      success_url: `${frontend}${tenantPath}/gift-cards/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontend}${tenantPath}/gift-cards/cancel?giftCardId=${giftCard._id}`,
      payment_method_types: ["card"],
      customer_email: sanitizeEmail(req.client.email),
      billing_address_collection: "required",
      metadata: {
        giftCardId: String(giftCard._id),
        tenantId: String(tenantId),
        deliveryType: normalizedDeliveryType,
        deliveryAt:
          normalizedDeliveryType === "scheduled" && parsedDeliveryAt
            ? parsedDeliveryAt.toISOString()
            : "",
        payoutRecipientType: payoutDestination.recipientType,
        payoutRecipientId: payoutDestination.recipientId,
        type: "gift_card_purchase",
      },
      payment_intent_data: {
        application_fee_amount: platformFeeMinor,
        transfer_data: {
          destination: payoutDestination.accountId,
        },
        metadata: {
          giftCardId: String(giftCard._id),
          tenantId: String(tenantId),
          deliveryType: normalizedDeliveryType,
          deliveryAt:
            normalizedDeliveryType === "scheduled" && parsedDeliveryAt
              ? parsedDeliveryAt.toISOString()
              : "",
          payoutRecipientType: payoutDestination.recipientType,
          payoutRecipientId: payoutDestination.recipientId,
          type: "gift_card_purchase",
        },
      },
      line_items: [
        {
          price_data: {
            currency: "gbp",
            unit_amount: amountMinor,
            product_data: {
              name: `Gift Card - ${tenant.name || "Business"}`,
              description: `For ${sanitizedRecipientName} (${sanitizedRecipientEmail})`,
            },
          },
          quantity: 1,
        },
      ],
    });

    giftCard.stripeCheckoutSessionId = session.id;
    await giftCard.save();

    return res.json({
      sessionId: session.id,
      url: session.url,
      giftCardId: giftCard._id,
      code: giftCard.code,
      deliveryType: giftCard.deliveryType,
      deliveryDate: giftCard.deliveryDate,
    });
  } catch (error) {
    console.error("[GIFT CARDS] Create session error:", error);

    const isInvalidDestinationError =
      (error?.type === "StripeInvalidRequestError" &&
        error?.code === "resource_missing" &&
        String(error?.param || "").includes("transfer_data")) ||
      error?.code === "account_invalid" ||
      error?.type === "StripePermissionError";

    if (isInvalidDestinationError) {
      if (giftCard?._id) {
        await GiftCard.updateOne(
          { _id: giftCard._id, status: "pending" },
          { $set: { status: "cancelled" } },
        );
      }

      return res.status(400).json({
        error:
          "This business is not yet ready to receive gift card payments. Please try another business.",
      });
    }

    if (giftCard?._id) {
      await GiftCard.updateOne(
        { _id: giftCard._id, status: "pending" },
        { $set: { status: "cancelled" } },
      );
    }

    res
      .status(500)
      .json({ error: "Failed to create gift card checkout session" });
  }
});

/**
 * GET /api/gift-cards/confirm?session_id=...
 * Confirm Stripe checkout session and finalize gift card issuance
 */
router.get("/confirm", async (req, res) => {
  try {
    const sessionId = String(req.query?.session_id || "").trim();
    if (!sessionId) {
      return res.status(400).json({ error: "Missing session_id" });
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["payment_intent"],
    });

    if (!session) {
      return res.status(404).json({ error: "Checkout session not found" });
    }

    const paid =
      session.payment_status === "paid" || session.status === "complete";

    if (!paid) {
      return res.status(409).json({
        error: "Session not paid yet",
        session: {
          payment_status: session.payment_status,
          status: session.status,
        },
      });
    }

    const giftCardId =
      session.metadata?.giftCardId || session.client_reference_id;
    if (!giftCardId) {
      return res
        .status(400)
        .json({ error: "Gift card reference missing from session" });
    }

    const giftCard = await GiftCard.findById(giftCardId);
    if (!giftCard) {
      return res.status(404).json({ error: "Gift card not found" });
    }

    if (giftCard.status === "sent" || giftCard.status === "redeemed") {
      return res.json({
        ok: true,
        message: "Gift card already finalized",
        giftCard: {
          _id: giftCard._id,
          code: giftCard.code,
          amount: giftCard.amount,
          status: giftCard.status,
          deliveryType: giftCard.deliveryType,
          deliveryDate: giftCard.deliveryDate,
          remainingBalance: giftCard.getRemainingBalance(),
          recipientName: giftCard.recipientName,
          recipientEmail: giftCard.recipientEmail,
          expiryDate: giftCard.expiryDate,
        },
      });
    }

    const paymentIntent = session.payment_intent;
    const paymentIntentId =
      typeof paymentIntent === "string" ? paymentIntent : paymentIntent?.id;

    giftCard.status = "sent";
    giftCard.sentDate = giftCard.sentDate || new Date();
    giftCard.purchaseDate = giftCard.purchaseDate || new Date();
    giftCard.stripeCheckoutSessionId = session.id;
    giftCard.stripePaymentIntentId =
      paymentIntentId || giftCard.stripePaymentIntentId;
    if (typeof paymentIntent === "object" && paymentIntent?.latest_charge) {
      giftCard.stripeChargeId =
        typeof paymentIntent.latest_charge === "string"
          ? paymentIntent.latest_charge
          : paymentIntent.latest_charge?.id;
    }
    await giftCard.save();

    try {
      await sendGiftCardEmails(giftCard._id);
      console.log("[GIFT CARDS] Confirmation emails sent for:", giftCard.code);
    } catch (emailError) {
      console.error("[GIFT CARDS] Confirmation email send failed:", emailError);
    }

    return res.json({
      ok: true,
      message: "Gift card purchase confirmed",
      giftCard: {
        _id: giftCard._id,
        code: giftCard.code,
        amount: giftCard.amount,
        status: giftCard.status,
        deliveryType: giftCard.deliveryType,
        deliveryDate: giftCard.deliveryDate,
        remainingBalance: giftCard.getRemainingBalance(),
        recipientName: giftCard.recipientName,
        recipientEmail: giftCard.recipientEmail,
        expiryDate: giftCard.expiryDate,
      },
    });
  } catch (error) {
    console.error("[GIFT CARDS] Confirm error:", error);
    res.status(500).json({ error: "Failed to confirm gift card purchase" });
  }
});

/**
 * POST /api/gift-cards/cancel
 * Cancel pending gift card checkout when user abandons Stripe checkout
 */
router.post("/cancel", async (req, res) => {
  try {
    const giftCardId = String(req.body?.giftCardId || "").trim();
    const sessionId = String(req.body?.session_id || "").trim();

    if (!giftCardId && !sessionId) {
      return res
        .status(400)
        .json({ error: "Missing giftCardId or session_id" });
    }

    let giftCard = null;
    if (giftCardId) {
      giftCard = await GiftCard.findById(giftCardId);
    } else {
      giftCard = await GiftCard.findOne({ stripeCheckoutSessionId: sessionId });
    }

    if (!giftCard) {
      return res.status(404).json({ error: "Gift card not found" });
    }

    if (giftCard.status === "sent" || giftCard.status === "redeemed") {
      return res.json({
        ok: true,
        status: giftCard.status,
        message: "Gift card already paid and finalized",
      });
    }

    const stripe = getStripe();
    const sessionLookupId = sessionId || giftCard.stripeCheckoutSessionId;

    if (sessionLookupId) {
      const session = await stripe.checkout.sessions.retrieve(sessionLookupId);
      const paid =
        session?.payment_status === "paid" || session?.status === "complete";

      if (paid) {
        return res.status(409).json({
          error: "Session is already paid",
          status: "paid",
        });
      }
    }

    giftCard.status = "cancelled";
    await giftCard.save();

    return res.json({
      ok: true,
      status: giftCard.status,
      message: "Gift card purchase cancelled",
    });
  } catch (error) {
    console.error("[GIFT CARDS] Cancel error:", error);
    res.status(500).json({ error: "Failed to cancel gift card purchase" });
  }
});

/**
 * POST /api/gift-cards
 * Create a new gift card
 * Requires authentication
 */
router.post("/", authenticateClient, async (req, res) => {
  try {
    const {
      tenantId,
      specialistId,
      amount,
      recipientName,
      recipientEmail,
      message,
    } = req.body;

    const sanitizedAmount = sanitizeAmount(amount);
    const sanitizedRecipientName = String(recipientName || "").trim();
    const sanitizedRecipientEmail = sanitizeEmail(recipientEmail);
    const sanitizedMessage = String(message || "").trim();

    // Validation
    if (
      !tenantId ||
      !Number.isFinite(sanitizedAmount) ||
      !sanitizedRecipientName ||
      !sanitizedRecipientEmail
    ) {
      return res.status(400).json({
        error:
          "Missing required fields: tenantId, amount, recipientName, recipientEmail",
      });
    }

    if (!isValidEmail(sanitizedRecipientEmail)) {
      return res.status(400).json({ error: "Invalid recipient email" });
    }

    if (sanitizedAmount < 10) {
      return res.status(400).json({
        error: "Gift card amount must be at least £10",
      });
    }

    if (sanitizedAmount > 2000) {
      return res.status(400).json({
        error: "Gift card amount cannot exceed £2000",
      });
    }

    if (sanitizedMessage.length > 500) {
      return res
        .status(400)
        .json({ error: "Message must be 500 characters or less" });
    }

    // Verify tenant exists
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    if (!tenant.features?.enableGiftCards) {
      return res.status(400).json({
        error: "Gift cards are not enabled for this business",
      });
    }

    // Verify specialist if provided
    if (specialistId) {
      const specialist = await Specialist.findById(specialistId);
      if (!specialist || specialist.tenantId.toString() !== tenantId) {
        return res.status(404).json({ error: "Specialist not found" });
      }
    }

    // Generate unique code
    let code;
    let codeExists = true;
    let attempts = 0;
    while (codeExists && attempts < 10) {
      code = GiftCard.generateCode();
      const existing = await GiftCard.findOne({ code });
      codeExists = !!existing;
      attempts++;
    }

    if (codeExists) {
      return res.status(500).json({ error: "Failed to generate unique code" });
    }

    // Set expiry date (1 year from now)
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 1);

    // Create gift card
    const giftCard = new GiftCard({
      code,
      tenantId,
      specialistId,
      amount: sanitizedAmount,
      purchaserName: req.client.name,
      purchaserEmail: sanitizeEmail(req.client.email),
      purchaserClientId: req.clientId,
      recipientName: sanitizedRecipientName,
      recipientEmail: sanitizedRecipientEmail,
      message: sanitizedMessage || undefined,
      deliveryType: "immediate",
      expiryDate,
      status: "sent",
      sentDate: new Date(),
    });

    await giftCard.save();

    // Send emails (async, don't wait for them)
    (async () => {
      try {
        await sendGiftCardEmails(giftCard._id);
        console.log(
          "[GIFT CARDS] Gift card emails processed for:",
          giftCard.code,
        );
      } catch (emailError) {
        console.error("[GIFT CARDS] Email sending failed:", emailError);
        // Don't fail the request if emails fail
      }
    })();

    res.status(201).json({
      message: "Gift card created successfully",
      giftCard: {
        _id: giftCard._id,
        code: giftCard.code,
        amount: giftCard.amount,
        remainingBalance: giftCard.getRemainingBalance(),
        recipientName: giftCard.recipientName,
        recipientEmail: giftCard.recipientEmail,
        expiryDate: giftCard.expiryDate,
        status: giftCard.status,
      },
    });
  } catch (error) {
    console.error("[GIFT CARDS] Create error:", error);
    res.status(500).json({ error: "Failed to create gift card" });
  }
});

/**
 * GET /api/gift-cards/:code
 * Validate and get gift card details
 * Public endpoint (no auth required)
 */
router.get("/:code", async (req, res) => {
  try {
    const code = normalizeGiftCardCode(req.params.code);

    if (!code) {
      return res.status(400).json({ error: "Gift card code is required" });
    }

    const giftCard = await GiftCard.findOne({ code })
      .populate("tenantId", "name slug")
      .populate("specialistId", "name");

    if (!giftCard) {
      return res.status(404).json({ error: "Gift card not found" });
    }

    // Check if valid
    const isValid = giftCard.isValid();
    const remaining = giftCard.getRemainingBalance();

    res.json({
      giftCard: {
        code: giftCard.code,
        amount: giftCard.amount,
        redeemedAmount: giftCard.redeemedAmount,
        remainingBalance: remaining,
        status: giftCard.status,
        isValid,
        expiryDate: giftCard.expiryDate,
        tenant: giftCard.tenantId,
        specialist: giftCard.specialistId,
        recipientName: giftCard.recipientName,
      },
    });
  } catch (error) {
    console.error("[GIFT CARDS] Get error:", error);
    res.status(500).json({ error: "Failed to fetch gift card" });
  }
});

/**
 * PATCH /api/gift-cards/:code/redeem
 * Redeem a gift card
 * Requires authentication
 */
router.patch("/:code/redeem", authenticateClient, async (req, res) => {
  try {
    const code = normalizeGiftCardCode(req.params.code);
    const { amount, appointmentId } = req.body;
    const redeemAmount = sanitizeAmount(amount);

    if (!code) {
      return res.status(400).json({ error: "Gift card code is required" });
    }

    if (!Number.isFinite(redeemAmount) || redeemAmount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const giftCard = await GiftCard.findOne({ code });

    if (!giftCard) {
      return res.status(404).json({ error: "Gift card not found" });
    }

    if (!giftCard.isValid()) {
      return res.status(400).json({
        error: "Gift card is expired, already redeemed, or invalid",
      });
    }

    // Redeem
    await giftCard.redeem(redeemAmount, req.clientId, appointmentId);

    res.json({
      message: "Gift card redeemed successfully",
      remainingBalance: giftCard.getRemainingBalance(),
      status: giftCard.status,
    });
  } catch (error) {
    console.error("[GIFT CARDS] Redeem error:", error);
    res
      .status(400)
      .json({ error: error.message || "Failed to redeem gift card" });
  }
});

export default router;
