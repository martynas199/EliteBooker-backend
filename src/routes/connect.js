import express from "express";
import Stripe from "stripe";
import Beautician from "../models/Beautician.js";

const router = express.Router();

// Initialize Stripe with fallback to STRIPE_SECRET
let stripeInstance = null;
function getStripe() {
  if (!stripeInstance) {
    const key = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET;
    if (!key)
      throw new Error("STRIPE_SECRET_KEY or STRIPE_SECRET not configured");
    stripeInstance = new Stripe(key, { apiVersion: "2024-06-20" });
  }
  return stripeInstance;
}

/**
 * POST /api/connect/onboard
 * Create a Stripe Connect Express account for a beautician
 * and return the onboarding link
 */
router.post("/onboard", async (req, res) => {
  try {
    const { beauticianId, email, refreshUrl, returnUrl } = req.body;

    if (!beauticianId || !email) {
      return res.status(400).json({
        error: "Missing required fields: beauticianId and email",
      });
    }

    const beautician = await Beautician.findById(beauticianId);
    if (!beautician) {
      return res.status(404).json({ error: "Beautician not found" });
    }

    let stripeAccountId = beautician.stripeAccountId;

    const stripe = getStripe();

    // Check if existing account ID is valid (handles test->live mode migration)
    if (stripeAccountId) {
      try {
        await stripe.accounts.retrieve(stripeAccountId);
      } catch (error) {
        // Account doesn't exist in current mode (likely test account with live keys)
        console.log(
          `Clearing invalid Stripe account ID for beautician ${beauticianId}`
        );
        stripeAccountId = null;
        beautician.stripeAccountId = null;
        beautician.stripeStatus = "not_connected";
        beautician.stripeOnboardingCompleted = false;
        await beautician.save();
      }
    }

    // Create new Stripe Connect account if doesn't exist
    if (!stripeAccountId) {
      const account = await stripe.accounts.create({
        type: "express",
        country: "GB",
        email: email,
        capabilities: {
          transfers: { requested: true },
          card_payments: { requested: true },
        },
        business_type: "individual",
      });

      stripeAccountId = account.id;

      // Save Stripe account ID to database
      beautician.stripeAccountId = stripeAccountId;
      beautician.stripeStatus = "pending";
      await beautician.save();
    }

    // Create account link for onboarding
    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url:
        refreshUrl || `${process.env.FRONTEND_URL}/admin/settings/reauth`,
      return_url:
        returnUrl ||
        `${process.env.FRONTEND_URL}/admin/settings/onboarding-complete`,
      type: "account_onboarding",
    });

    res.json({
      success: true,
      url: accountLink.url,
      stripeAccountId: stripeAccountId,
    });
  } catch (error) {
    console.error("Stripe Connect onboarding error:", error);
    res.status(500).json({
      error: "Failed to create onboarding link",
      message: error.message,
    });
  }
});

/**
 * GET /api/connect/status/:beauticianId
 * Check the status of a beautician's Stripe Connect account
 */
router.get("/status/:beauticianId", async (req, res) => {
  try {
    const { beauticianId } = req.params;

    const beautician = await Beautician.findById(beauticianId);
    if (!beautician) {
      return res.status(404).json({ error: "Beautician not found" });
    }

    if (!beautician.stripeAccountId) {
      return res.json({
        status: "not_connected",
        connected: false,
        stripeAccountId: null,
      });
    }

    const stripe = getStripe();

    // Fetch account details from Stripe
    let account;
    try {
      account = await stripe.accounts.retrieve(beautician.stripeAccountId);
    } catch (error) {
      // Account doesn't exist (likely test account with live keys)
      console.log(
        `Invalid Stripe account ID for beautician ${beauticianId}, clearing...`
      );
      beautician.stripeAccountId = null;
      beautician.stripeStatus = "not_connected";
      beautician.stripeOnboardingCompleted = false;
      await beautician.save();

      return res.json({
        status: "not_connected",
        connected: false,
        stripeAccountId: null,
        message:
          "Previous account was invalid and has been cleared. Please reconnect.",
      });
    }

    // Check if onboarding is complete
    const isComplete = account.details_submitted && account.charges_enabled;

    // Update beautician status in database
    if (isComplete && beautician.stripeStatus !== "connected") {
      beautician.stripeStatus = "connected";
      beautician.stripeOnboardingCompleted = true;
      await beautician.save();
    } else if (!isComplete && beautician.stripeStatus === "connected") {
      beautician.stripeStatus = "pending";
      beautician.stripeOnboardingCompleted = false;
      await beautician.save();
    }

    res.json({
      status: beautician.stripeStatus,
      connected: isComplete,
      stripeAccountId: beautician.stripeAccountId,
      chargesEnabled: account.charges_enabled,
      detailsSubmitted: account.details_submitted,
      payoutsEnabled: account.payouts_enabled,
      requirementsCurrentlyDue: account.requirements?.currently_due || [],
    });
  } catch (error) {
    console.error("Stripe Connect status check error:", error);
    res.status(500).json({
      error: "Failed to check account status",
      message: error.message,
    });
  }
});

/**
 * POST /api/connect/dashboard-link/:beauticianId
 * Generate a login link for beautician to access their Stripe Express dashboard
 */
router.post("/dashboard-link/:beauticianId", async (req, res) => {
  try {
    const { beauticianId } = req.params;

    const beautician = await Beautician.findById(beauticianId);
    if (!beautician || !beautician.stripeAccountId) {
      return res.status(404).json({
        error: "Beautician not found or Stripe account not connected",
      });
    }

    const stripe = getStripe();
    const loginLink = await stripe.accounts.createLoginLink(
      beautician.stripeAccountId
    );

    res.json({
      success: true,
      url: loginLink.url,
    });
  } catch (error) {
    console.error("Stripe dashboard link error:", error);
    res.status(500).json({
      error: "Failed to create dashboard link",
      message: error.message,
    });
  }
});

/**
 * DELETE /api/connect/disconnect/:beauticianId
 * Disconnect a beautician's Stripe account (for testing/admin purposes)
 */
router.delete("/disconnect/:beauticianId", async (req, res) => {
  try {
    const { beauticianId } = req.params;

    const beautician = await Beautician.findById(beauticianId);
    if (!beautician) {
      return res.status(404).json({ error: "Beautician not found" });
    }

    if (beautician.stripeAccountId) {
      // Optionally delete the account from Stripe
      // await stripe.accounts.del(beautician.stripeAccountId);

      // Clear Stripe fields from database
      beautician.stripeAccountId = null;
      beautician.stripeStatus = "not_connected";
      beautician.stripeOnboardingCompleted = false;
      await beautician.save();
    }

    res.json({
      success: true,
      message: "Stripe account disconnected successfully",
    });
  } catch (error) {
    console.error("Stripe disconnect error:", error);
    res.status(500).json({
      error: "Failed to disconnect account",
      message: error.message,
    });
  }
});

export default router;
