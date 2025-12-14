import { Router } from "express";
import GiftCard from "../models/GiftCard.js";
import Tenant from "../models/Tenant.js";
import Specialist from "../models/Specialist.js";
import { authenticateClient } from "../middleware/clientAuth.js";
import { optionalAuth } from "../middleware/optionalAuth.js";
import {
  sendGiftCardPurchaseConfirmation,
  sendGiftCardToRecipient,
  sendGiftCardSaleNotification,
} from "../emails/giftCardMailer.js";

const router = Router();

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

    // Validation
    if (!tenantId || !amount || !recipientName || !recipientEmail) {
      return res.status(400).json({
        error:
          "Missing required fields: tenantId, amount, recipientName, recipientEmail",
      });
    }

    if (amount < 10) {
      return res.status(400).json({
        error: "Gift card amount must be at least £10",
      });
    }

    // Verify tenant exists
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
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
      amount,
      purchaserName: req.client.name,
      purchaserEmail: req.client.email,
      purchaserClientId: req.clientId,
      recipientName,
      recipientEmail,
      message,
      expiryDate,
      status: "pending", // Will be set to "sent" after payment confirmation
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

        // Mark as sent after successful email delivery
        giftCard.status = "sent";
        giftCard.sentDate = new Date();
        await giftCard.save();

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
    const { code } = req.params;

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
    const { code } = req.params;
    const { amount, appointmentId } = req.body;

    if (!amount || amount <= 0) {
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
    await giftCard.redeem(amount, req.clientId, appointmentId);

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
    const giftCards = await GiftCard.find({ recipientEmail: req.client.email })
      .populate("tenantId", "name slug")
      .populate("specialistId", "name")
      .sort({ purchaseDate: -1 });

    res.json({ giftCards });
  } catch (error) {
    console.error("[GIFT CARDS] Get received error:", error);
    res.status(500).json({ error: "Failed to fetch gift cards" });
  }
});

export default router;
