import { Router } from "express";
import Stripe from "stripe";
import Subscription from "../models/Subscription.js";

const router = Router();

let stripeInstance = null;
function getStripe() {
  if (!stripeInstance) {
    const key = process.env.STRIPE_SECRET || process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET not configured");
    stripeInstance = new Stripe(key, { apiVersion: "2024-06-20" });
  }
  return stripeInstance;
}

// GET /api/subscriptions/status - Get current subscription status
router.get("/status", async (req, res) => {
  try {
    console.log("[SUBSCRIPTIONS] Checking status...");
    const stripe = getStripe();

    // For now, using a single salon ID. In production, get from authenticated user
    const salonId = "default";

    // Find subscription in database
    const subscriptionDoc = await Subscription.findOne({ salonId });
    console.log(
      "[SUBSCRIPTIONS] Subscription doc from DB:",
      subscriptionDoc
        ? {
            id: subscriptionDoc._id,
            stripeSubscriptionId: subscriptionDoc.stripeSubscriptionId,
            status: subscriptionDoc.status,
          }
        : null
    );

    if (!subscriptionDoc) {
      console.log("[SUBSCRIPTIONS] No subscription found in database");
      return res.json({
        status: "none",
        hasSubscription: false,
        message: "No active subscription",
      });
    }

    // Fetch latest subscription data from Stripe
    let subscription;
    try {
      console.log(
        "[SUBSCRIPTIONS] Fetching from Stripe:",
        subscriptionDoc.stripeSubscriptionId
      );
      subscription = await stripe.subscriptions.retrieve(
        subscriptionDoc.stripeSubscriptionId
      );
      console.log(
        "[SUBSCRIPTIONS] Stripe subscription status:",
        subscription.status
      );
    } catch (error) {
      // Subscription doesn't exist in current mode (test vs live)
      console.log(
        `[SUBSCRIPTIONS] Invalid subscription ID, clearing: ${subscriptionDoc.stripeSubscriptionId}`,
        error.message
      );
      await Subscription.deleteOne({ salonId });
      return res.json({
        status: "none",
        hasSubscription: false,
        message: "Previous subscription was invalid and has been cleared.",
      });
    }

    // Update database with latest info
    subscriptionDoc.status = subscription.status;
    subscriptionDoc.currentPeriodStart = subscription.current_period_start;
    subscriptionDoc.currentPeriodEnd = subscription.current_period_end;
    subscriptionDoc.cancelAtPeriodEnd = subscription.cancel_at_period_end;
    subscriptionDoc.trialEnd = subscription.trial_end;
    if (subscription.canceled_at) {
      subscriptionDoc.canceledAt = subscription.canceled_at;
    }
    await subscriptionDoc.save();

    res.json({
      subscriptionId: subscription.id,
      customerId: subscription.customer,
      status: subscription.status,
      current_period_start: subscription.current_period_start,
      current_period_end: subscription.current_period_end,
      cancel_at_period_end: subscription.cancel_at_period_end,
      trial_end: subscription.trial_end,
    });
  } catch (error) {
    console.error("Error fetching subscription status:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/subscriptions/sync - Manually sync subscription from Stripe (useful for initial setup)
router.post("/sync", async (req, res) => {
  try {
    const stripe = getStripe();
    const salonId = "default";

    // Try to find existing subscription in database
    let subscriptionDoc = await Subscription.findOne({ salonId });

    if (subscriptionDoc) {
      // Sync existing subscription
      const subscription = await stripe.subscriptions.retrieve(
        subscriptionDoc.stripeSubscriptionId
      );

      subscriptionDoc.status = subscription.status;
      subscriptionDoc.currentPeriodStart = subscription.current_period_start;
      subscriptionDoc.currentPeriodEnd = subscription.current_period_end;
      subscriptionDoc.cancelAtPeriodEnd = subscription.cancel_at_period_end;
      subscriptionDoc.trialEnd = subscription.trial_end;
      if (subscription.canceled_at) {
        subscriptionDoc.canceledAt = subscription.canceled_at;
      }
      await subscriptionDoc.save();

      return res.json({
        success: true,
        message: "Subscription synced from Stripe",
        subscription: subscriptionDoc,
      });
    }

    // No subscription in database - search for active subscription in Stripe
    const customers = await stripe.customers.list({
      limit: 10,
    });

    for (const customer of customers.data) {
      const subscriptions = await stripe.subscriptions.list({
        customer: customer.id,
        status: "all",
        limit: 10,
      });

      if (subscriptions.data.length > 0) {
        // Found subscription(s) - use the first active one or most recent
        const subscription = subscriptions.data[0];

        // Create subscription in database
        subscriptionDoc = await Subscription.create({
          salonId,
          stripeCustomerId: customer.id,
          stripeSubscriptionId: subscription.id,
          stripePriceId: subscription.items.data[0].price.id,
          status: subscription.status,
          currentPeriodStart: subscription.current_period_start,
          currentPeriodEnd: subscription.current_period_end,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          trialEnd: subscription.trial_end,
          canceledAt: subscription.canceled_at,
        });

        console.log(
          "[SUBSCRIPTION] Synced subscription from Stripe:",
          subscription.id
        );

        return res.json({
          success: true,
          message: "Subscription found in Stripe and synced to database",
          subscription: subscriptionDoc,
        });
      }
    }

    res.status(404).json({ error: "No subscription found in Stripe" });
  } catch (error) {
    console.error("Error syncing subscription:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/subscriptions/invoices - Get subscription invoices/receipts
router.get("/invoices", async (req, res) => {
  try {
    const stripe = getStripe();
    const salonId = "default";

    // Find subscription in database
    const subscriptionDoc = await Subscription.findOne({ salonId });

    if (!subscriptionDoc) {
      return res.json([]);
    }

    // Fetch all invoices for this customer
    const invoices = await stripe.invoices.list({
      customer: subscriptionDoc.stripeCustomerId,
      limit: 100, // Get last 100 invoices
    });

    // Format invoice data for frontend
    const formattedInvoices = invoices.data.map((invoice) => ({
      id: invoice.id,
      number: invoice.number,
      amount_paid: invoice.amount_paid / 100, // Convert from pence to pounds
      currency: invoice.currency,
      status: invoice.status,
      created: invoice.created,
      period_start: invoice.period_start,
      period_end: invoice.period_end,
      invoice_pdf: invoice.invoice_pdf,
      hosted_invoice_url: invoice.hosted_invoice_url,
    }));

    res.json(formattedInvoices);
  } catch (error) {
    console.error("Error fetching invoices:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/subscriptions/invoices/:invoiceId - Get specific invoice details
router.get("/invoices/:invoiceId", async (req, res) => {
  try {
    const stripe = getStripe();
    const { invoiceId } = req.params;

    const invoice = await stripe.invoices.retrieve(invoiceId);

    res.json({
      id: invoice.id,
      number: invoice.number,
      amount_paid: invoice.amount_paid / 100,
      currency: invoice.currency,
      status: invoice.status,
      created: invoice.created,
      period_start: invoice.period_start,
      period_end: invoice.period_end,
      invoice_pdf: invoice.invoice_pdf,
      hosted_invoice_url: invoice.hosted_invoice_url,
    });
  } catch (error) {
    console.error("Error fetching invoice:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/subscriptions/create-checkout - Create Stripe Checkout session for subscription
router.post("/create-checkout", async (req, res) => {
  try {
    const stripe = getStripe();
    const salonId = "default"; // In production, get from authenticated user
    const frontend = process.env.FRONTEND_URL || "http://localhost:5173";

    // Create or get price for £19/month
    let priceId = process.env.SUBSCRIPTION_PRICE_ID;

    if (!priceId) {
      // Create product and price if not exists
      const product = await stripe.products.create({
        name: "E-Commerce Store Subscription",
        description:
          "Monthly subscription to access the e-commerce store features",
      });

      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: 1900, // £19.00 in pence
        currency: "gbp",
        recurring: {
          interval: "month",
        },
      });

      priceId = price.id;
      console.log("[SUBSCRIPTION] Created new price:", priceId);
      console.log(
        "[SUBSCRIPTION] Add SUBSCRIPTION_PRICE_ID=" +
          priceId +
          " to your .env file"
      );
    }

    // Check if customer already exists in database
    let customerId;
    const existingSubscription = await Subscription.findOne({ salonId });

    if (existingSubscription?.stripeCustomerId) {
      // Verify customer exists in current Stripe mode
      try {
        await stripe.customers.retrieve(existingSubscription.stripeCustomerId);
        customerId = existingSubscription.stripeCustomerId;
      } catch (error) {
        // Customer doesn't exist in current mode (test vs live)
        console.log(
          `Invalid customer ID, creating new: ${existingSubscription.stripeCustomerId}`
        );
        const customer = await stripe.customers.create({
          metadata: { salonId },
        });
        customerId = customer.id;

        // Clear old subscription data
        await Subscription.deleteOne({ salonId });
      }
    } else {
      // Create new customer
      const customer = await stripe.customers.create({
        metadata: {
          salonId,
        },
      });
      customerId = customer.id;
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${frontend}/admin/subscription?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontend}/admin/subscription?canceled=true`,
      metadata: {
        salonId,
      },
    });

    res.json({
      url: session.url,
      sessionId: session.id,
    });
  } catch (error) {
    console.error("Error creating subscription checkout:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/subscriptions/webhook - Handle Stripe webhook events
router.post("/webhook", async (req, res) => {
  try {
    const stripe = getStripe();
    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.warn("[SUBSCRIPTION] No webhook secret configured");
      return res.status(400).json({ error: "Webhook secret not configured" });
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      console.error(
        "[SUBSCRIPTION] Webhook signature verification failed:",
        err.message
      );
      return res.status(400).json({ error: `Webhook Error: ${err.message}` });
    }

    const salonId = event.data.object.metadata?.salonId || "default";

    // Handle the event
    switch (event.type) {
      case "checkout.session.completed":
        const session = event.data.object;
        if (session.mode === "subscription") {
          // Create or update subscription in database
          await Subscription.findOneAndUpdate(
            { salonId },
            {
              salonId,
              stripeCustomerId: session.customer,
              stripeSubscriptionId: session.subscription,
              stripePriceId:
                session.line_items?.data[0]?.price?.id ||
                process.env.SUBSCRIPTION_PRICE_ID,
              status: "active",
              currentPeriodStart: Date.now() / 1000,
              currentPeriodEnd: Date.now() / 1000 + 30 * 24 * 60 * 60, // Approximate
              cancelAtPeriodEnd: false,
            },
            { upsert: true, new: true }
          );
          console.log(
            "[SUBSCRIPTION] Checkout completed:",
            session.subscription
          );
        }
        break;

      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        const subscription = event.data.object;
        await Subscription.findOneAndUpdate(
          { stripeSubscriptionId: subscription.id },
          {
            status: subscription.status,
            currentPeriodStart: subscription.current_period_start,
            currentPeriodEnd: subscription.current_period_end,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            canceledAt: subscription.canceled_at,
            trialEnd: subscription.trial_end,
          }
        );
        console.log(
          "[SUBSCRIPTION] Subscription updated:",
          subscription.id,
          subscription.status
        );
        break;

      case "invoice.payment_failed":
        const invoice = event.data.object;
        console.error("[SUBSCRIPTION] Payment failed:", invoice.id);
        // Update subscription status if needed
        if (invoice.subscription) {
          await Subscription.findOneAndUpdate(
            { stripeSubscriptionId: invoice.subscription },
            { status: "past_due" }
          );
        }
        break;

      default:
        console.log(`[SUBSCRIPTION] Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error("Error processing webhook:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/subscriptions/cancel - Cancel subscription at period end
router.post("/cancel", async (req, res) => {
  try {
    const stripe = getStripe();
    const salonId = "default";

    // Find subscription in database
    const subscriptionDoc = await Subscription.findOne({ salonId });

    if (!subscriptionDoc) {
      return res.status(404).json({ error: "No subscription found" });
    }

    // Cancel at period end (don't cancel immediately)
    const subscription = await stripe.subscriptions.update(
      subscriptionDoc.stripeSubscriptionId,
      {
        cancel_at_period_end: true,
      }
    );

    // Update database
    subscriptionDoc.cancelAtPeriodEnd = true;
    await subscriptionDoc.save();

    res.json({
      success: true,
      message:
        "Subscription will be cancelled at the end of the billing period",
      subscription,
    });
  } catch (error) {
    console.error("Error cancelling subscription:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/subscriptions/reactivate - Reactivate a cancelled subscription
router.post("/reactivate", async (req, res) => {
  try {
    const stripe = getStripe();
    const salonId = "default";

    // Find subscription in database
    const subscriptionDoc = await Subscription.findOne({ salonId });

    if (!subscriptionDoc) {
      return res.status(404).json({ error: "No subscription found" });
    }

    // Remove cancellation
    const subscription = await stripe.subscriptions.update(
      subscriptionDoc.stripeSubscriptionId,
      {
        cancel_at_period_end: false,
      }
    );

    // Update database
    subscriptionDoc.cancelAtPeriodEnd = false;
    subscriptionDoc.status = subscription.status;
    await subscriptionDoc.save();

    res.json({
      success: true,
      message: "Subscription reactivated successfully",
      subscription,
    });
  } catch (error) {
    console.error("Error reactivating subscription:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
