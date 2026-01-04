import { Router } from "express";
import Specialist from "../models/Specialist.js";
import Stripe from "stripe";
import { requireAdmin } from "../middleware/requireAdmin.js";

const router = Router();

// Initialize Stripe
function getStripe() {
  const key = process.env.STRIPE_SECRET || process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET not configured");
  return new Stripe(key, { apiVersion: "2024-06-20" });
}

/**
 * GET /api/features/:specialistId
 * Get subscription status for a specialist
 */
router.get("/:specialistId", requireAdmin, async (req, res) => {
  try {
    const { specialistId } = req.params;

    const specialist = await Specialist.findById(specialistId).lean();
    if (!specialist) {
      return res.status(404).json({ error: "Specialist not found" });
    }

    const responseData = {
      noFeeBookings: {
        enabled: specialist.subscription?.noFeeBookings?.enabled || false,
        status: specialist.subscription?.noFeeBookings?.status || "inactive",
        currentPeriodEnd:
          specialist.subscription?.noFeeBookings?.currentPeriodEnd || null,
      },
      smsConfirmations: {
        enabled: specialist.subscription?.smsConfirmations?.enabled || false,
        status: specialist.subscription?.smsConfirmations?.status || "inactive",
        currentPeriodEnd:
          specialist.subscription?.smsConfirmations?.currentPeriodEnd || null,
      },
    };

    console.log(
      "[FEATURES GET] specialist:",
      specialistId,
      "returning:",
      JSON.stringify(responseData)
    );

    res.json(responseData);
  } catch (err) {
    console.error("Error fetching features:", err);
    res.status(500).json({ error: err.message || "Failed to fetch features" });
  }
});

/**
 * POST /api/features/:specialistId/subscribe-no-fee
 * Create subscription checkout session
 */
router.post(
  "/:specialistId/subscribe-no-fee",
  requireAdmin,
  async (req, res) => {
    try {
      const { specialistId } = req.params;

      console.log(
        "Subscribe request - specialistId from params:",
        specialistId
      );
      console.log(
        "Subscribe request - admin specialistId:",
        req.admin?.specialistId
      );
      console.log("specialistId type:", typeof specialistId);

      const specialist = await Specialist.findById(specialistId);
      console.log("Found specialist:", specialist ? specialist._id : "null");

      if (!specialist) {
        return res.status(404).json({ error: "Specialist not found" });
      }

      // Check if already subscribed
      if (specialist.subscription?.noFeeBookings?.enabled) {
        return res
          .status(400)
          .json({ error: "Already subscribed to this feature" });
      }

      const stripe = getStripe();

      // Create or get Stripe customer
      let customerId = specialist.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: specialist.email,
          name: specialist.name,
          metadata: {
            specialistId: specialist._id.toString(),
          },
        });
        customerId = customer.id;
        specialist.stripeCustomerId = customerId;
        await specialist.save();
      }

      // Get price ID from environment variable
      const priceId = process.env.NO_FEE_BOOKINGS_PRICE_ID;
      if (!priceId) {
        return res
          .status(500)
          .json({ error: "Subscription price not configured" });
      }

      // Create checkout session for subscription
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        success_url: `${process.env.FRONTEND_URL}/admin/platform-features?success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.FRONTEND_URL}/admin/platform-features?canceled=true`,
        metadata: {
          specialistId: specialist._id.toString(),
          feature: "no_fee_bookings",
        },
        subscription_data: {
          metadata: {
            specialistId: specialist._id.toString(),
            feature: "no_fee_bookings",
          },
        },
      });

      res.json({ checkoutUrl: session.url });
    } catch (err) {
      console.error("Error creating subscription:", err);
      res
        .status(500)
        .json({ error: err.message || "Failed to create subscription" });
    }
  }
);

/**
 * POST /api/features/:specialistId/cancel-no-fee
 * Cancel subscription (at end of period)
 */
router.post("/:specialistId/cancel-no-fee", requireAdmin, async (req, res) => {
  try {
    const { specialistId } = req.params;

    const specialist = await Specialist.findById(specialistId);
    if (!specialist) {
      return res.status(404).json({ error: "Specialist not found" });
    }

    const subscriptionId =
      specialist.subscription?.noFeeBookings?.stripeSubscriptionId;
    if (!subscriptionId) {
      return res.status(400).json({ error: "No active subscription found" });
    }

    const stripe = getStripe();

    // Cancel at period end (don't cancel immediately)
    await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });

    res.json({
      message: "Subscription will be canceled at the end of the billing period",
    });
  } catch (err) {
    console.error("Error canceling subscription:", err);
    res
      .status(500)
      .json({ error: err.message || "Failed to cancel subscription" });
  }
});

/**
 * POST /api/features/:specialistId/subscribe-sms
 * Create SMS subscription checkout session
 */
router.post("/:specialistId/subscribe-sms", requireAdmin, async (req, res) => {
  try {
    const { specialistId } = req.params;

    const specialist = await Specialist.findById(specialistId);
    if (!specialist) {
      return res.status(404).json({ error: "Specialist not found" });
    }

    // Check if already subscribed
    if (specialist.subscription?.smsConfirmations?.enabled) {
      return res
        .status(400)
        .json({ error: "Already subscribed to SMS confirmations" });
    }

    const stripe = getStripe();

    // Create or get Stripe customer
    let customerId = specialist.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: specialist.email,
        name: specialist.name,
        metadata: {
          specialistId: specialist._id.toString(),
        },
      });
      customerId = customer.id;
      specialist.stripeCustomerId = customerId;
      await specialist.save();
    }

    // Get price ID from environment variable
    const priceId = process.env.SMS_CONFIRMATIONS_PRICE_ID;
    if (!priceId) {
      return res
        .status(500)
        .json({ error: "SMS subscription price not configured" });
    }

    // Create checkout session for subscription
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${process.env.FRONTEND_URL}/admin/platform-features?success=true&type=sms&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/admin/platform-features?canceled=true`,
      metadata: {
        specialistId: specialist._id.toString(),
        feature: "sms_confirmations",
      },
      subscription_data: {
        metadata: {
          specialistId: specialist._id.toString(),
          feature: "sms_confirmations",
        },
      },
    });

    res.json({ checkoutUrl: session.url });
  } catch (err) {
    console.error("Error creating SMS subscription:", err);
    res
      .status(500)
      .json({ error: err.message || "Failed to create SMS subscription" });
  }
});

/**
 * POST /api/features/:specialistId/cancel-sms
 * Cancel SMS subscription (at end of period)
 */
router.post("/:specialistId/cancel-sms", requireAdmin, async (req, res) => {
  try {
    const { specialistId } = req.params;

    const specialist = await Specialist.findById(specialistId);
    if (!specialist) {
      return res.status(404).json({ error: "Specialist not found" });
    }

    const subscriptionId =
      specialist.subscription?.smsConfirmations?.stripeSubscriptionId;
    if (!subscriptionId) {
      return res
        .status(400)
        .json({ error: "No active SMS subscription found" });
    }

    const stripe = getStripe();

    // Cancel at period end (don't cancel immediately)
    await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });

    res.json({
      message:
        "SMS subscription will be canceled at the end of the billing period",
    });
  } catch (err) {
    console.error("Error canceling SMS subscription:", err);
    res
      .status(500)
      .json({ error: err.message || "Failed to cancel SMS subscription" });
  }
});

export default router;
