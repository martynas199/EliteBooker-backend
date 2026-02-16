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

const sanitizeEmail = (email = "") => String(email || "").trim().toLowerCase();

const isValidEmail = (email = "") =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ""));

const sanitizeAmount = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return NaN;
  return Math.round(parsed * 100) / 100;
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

  await Promise.all([
    sendGiftCardPurchaseConfirmation({
      giftCard: populatedGiftCard,
      tenant,
      specialist,
    }),
    sendGiftCardToRecipient({
      giftCard: populatedGiftCard,
      tenant,
      specialist,
    }),
    sendGiftCardSaleNotification({
      giftCard: populatedGiftCard,
      tenant,
      specialist,
    }),
  ]);
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
  try {
    const { tenantId, specialistId, amount, recipientName, recipientEmail, message } =
      req.body || {};

    const sanitizedAmount = sanitizeAmount(amount);
    const amountMinor = toMinorUnits(sanitizedAmount);
    const sanitizedRecipientName = String(recipientName || "").trim();
    const sanitizedRecipientEmail = sanitizeEmail(recipientEmail);
    const sanitizedMessage = String(message || "").trim();

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

    const tenant = await Tenant.findById(tenantId).select("name slug features").lean();
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    if (!tenant.features?.enableGiftCards) {
      return res.status(400).json({
        error: "Gift cards are not enabled for this business",
      });
    }

    if (specialistId) {
      const specialist = await Specialist.findById(specialistId).select("tenantId").lean();
      if (!specialist || String(specialist.tenantId) !== String(tenantId)) {
        return res.status(404).json({ error: "Specialist not found" });
      }
    }

    const code = await generateUniqueGiftCardCode();
    const expiryDate = buildExpiryDate();

    const giftCard = await GiftCard.create({
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
      expiryDate,
      status: "pending",
    });

    const frontend = process.env.FRONTEND_URL || "http://localhost:5173";
    const tenantPath = tenant?.slug ? `/salon/${tenant.slug}` : "";
    const stripe = getStripe();

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
        type: "gift_card_purchase",
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
    });
  } catch (error) {
    console.error("[GIFT CARDS] Create session error:", error);
    res.status(500).json({ error: "Failed to create gift card checkout session" });
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
      session.payment_status === "paid" ||
      session.status === "complete";

    if (!paid) {
      return res.status(409).json({
        error: "Session not paid yet",
        session: {
          payment_status: session.payment_status,
          status: session.status,
        },
      });
    }

    const giftCardId = session.metadata?.giftCardId || session.client_reference_id;
    if (!giftCardId) {
      return res.status(400).json({ error: "Gift card reference missing from session" });
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
    giftCard.stripePaymentIntentId = paymentIntentId || giftCard.stripePaymentIntentId;
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
      expiryDate,
      status: "sent",
      sentDate: new Date(),
    });

    await giftCard.save();

    // Send emails (async, don't wait for them)
    (async () => {
      try {
        console.log(
          "[GIFT CARDS] Sending emails for gift card:",
          giftCard.code
        );

        // Get populated tenant and specialist data for emails
        const populatedGiftCard = await GiftCard.findById(giftCard._id)
          .populate("tenantId")
          .populate("specialistId");

        const tenant = populatedGiftCard.tenantId;
        const specialist = populatedGiftCard.specialistId;

        // Send all three emails in parallel
        await Promise.all([
          sendGiftCardPurchaseConfirmation({
            giftCard: populatedGiftCard,
            tenant,
            specialist,
          }),
          sendGiftCardToRecipient({
            giftCard: populatedGiftCard,
            tenant,
            specialist,
          }),
          sendGiftCardSaleNotification({
            giftCard: populatedGiftCard,
            tenant,
            specialist,
          }),
        ]);

        console.log(
          "[GIFT CARDS] All emails sent successfully for:",
          giftCard.code
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
