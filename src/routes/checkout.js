import { Router } from "express";
import Stripe from "stripe";
import Service from "../models/Service.js";
import Specialist from "../models/Specialist.js";
import Appointment from "../models/Appointment.js";
import { sendConfirmationEmail } from "../emails/mailer.js";

const r = Router();
let stripeInstance = null;
function getStripe(connectedAccountId = null) {
  const key = process.env.STRIPE_SECRET;
  if (!key) throw new Error("STRIPE_SECRET not configured");

  // If no connected account specified, use cached platform instance
  if (!connectedAccountId) {
    if (!stripeInstance) {
      stripeInstance = new Stripe(key, { apiVersion: "2024-06-20" });
    }
    return stripeInstance;
  }

  // For connected accounts, create a new client instance
  // This allows us to make direct charges on the connected account
  return new Stripe(key, {
    apiVersion: "2024-06-20",
    stripeAccount: connectedAccountId,
  });
}

function toMinorUnits(amountFloat) {
  // Convert e.g. 12.34 (GBP) -> 1234 (pence)
  return Math.round((Number(amountFloat) || 0) * 100);
}

r.get("/confirm", async (req, res, next) => {
  try {
    const { session_id } = req.query || {};
    console.log("[CHECKOUT CONFIRM] called with session_id:", session_id);
    if (!session_id)
      return res.status(400).json({ error: "Missing session_id" });

    // Find appointment by session ID to determine which Stripe account to use
    const appt = await Appointment.findOne({
      "payment.sessionId": session_id,
    }).lean();

    if (!appt) {
      return res
        .status(404)
        .json({ error: "Appointment not found for this session" });
    }

    console.log("[CHECKOUT CONFIRM] Found appointment:", appt._id);

    // Get beautician to determine which Stripe account has the session
    const beautician = await Specialist.findById(appt.beauticianId).lean();

    // Retrieve session from the correct account
    let stripe;
    if (
      beautician?.stripeAccountId &&
      beautician?.stripeStatus === "connected"
    ) {
      // Direct charge - session is on beautician's account
      stripe = getStripe(Specialist.stripeAccountId);
      console.log(
        "[CHECKOUT CONFIRM] Retrieving from beautician account:",
        Specialist.stripeAccountId
      );
    } else {
      // Platform charge - session is on platform account
      stripe = getStripe();
      console.log("[CHECKOUT CONFIRM] Retrieving from platform account");
    }

    const session = await stripe.checkout.sessions.retrieve(
      String(session_id),
      { expand: ["payment_intent"] }
    );
    console.log("[CHECKOUT CONFIRM] Stripe session retrieved successfully");

    // If already confirmed, exit early
    if (
      [
        "cancelled_no_refund",
        "cancelled_partial_refund",
        "cancelled_full_refund",
        "confirmed",
      ].includes(appt.status)
    ) {
      console.log(
        "[CHECKOUT CONFIRM] Already confirmed or cancelled, status:",
        appt.status
      );
      return res.json({ ok: true, status: appt.status });
    }

    const paid =
      session.payment_status === "paid" || session.status === "complete";
    console.log(
      "[CHECKOUT CONFIRM] paid:",
      paid,
      "payment_status:",
      session.payment_status,
      "status:",
      session.status
    );
    if (!paid)
      return res.status(409).json({
        error: "Session not paid yet",
        session: {
          payment_status: session.payment_status,
          status: session.status,
        },
      });

    const pi = session.payment_intent;
    const amountTotal = Number(
      session.amount_total ||
        appt.payment?.amountTotal ||
        Math.round(Number(appt.price || 0) * 100)
    );
    console.log("[CHECKOUT CONFIRM] amountTotal:", amountTotal);

    // Platform fee (beautician already loaded above)
    const platformFee = Number(process.env.STRIPE_PLATFORM_FEE || 50);

    // Build stripe payment data
    const stripeData = {
      ...(appt.payment?.stripe || {}),
      paymentIntentId:
        typeof pi === "object" && pi?.id
          ? pi.id
          : typeof session.payment_intent === "string"
          ? session.payment_intent
          : undefined,
    };

    // Capture payment error details if payment intent has an error
    if (typeof pi === "object" && pi?.last_payment_error) {
      const error = pi.last_payment_error;
      stripeData.lastPaymentError = {
        code: error.code,
        message: error.message,
        declineCode: error.decline_code,
        type: error.type,
      };
      console.log(
        "[CHECKOUT CONFIRM] Payment error captured:",
        error.code,
        error.decline_code
      );
    }

    // Add Connect data if beautician was connected
    if (
      beautician?.stripeAccountId &&
      beautician?.stripeStatus === "connected"
    ) {
      stripeData.platformFee = platformFee;
      stripeData.beauticianStripeAccount = Specialist.stripeAccountId;
      console.log("[CHECKOUT CONFIRM] Stripe Connect payment tracked");

      // Update beautician's total earnings (amount minus platform fee, converted to pounds)
      const earningsInPounds = (amountTotal - platformFee) / 100;
      await Specialist.findByIdAndUpdate(appt.beauticianId, {
        $inc: { totalEarnings: earningsInPounds },
      });
    }

    await Appointment.findByIdAndUpdate(appt._id, {
      $set: {
        status: "confirmed",
        payment: {
          ...(appt.payment || {}),
          provider: "stripe",
          mode: appt.payment?.mode || "pay_now", // Preserve the original mode
          status: "succeeded",
          amountTotal,
          stripe: stripeData,
        },
      },
      $push: {
        audit: {
          at: new Date(),
          action: "checkout_confirm_reconcile",
          meta: { sessionId: session.id },
        },
      },
    });
    console.log("[CHECKOUT CONFIRM] Appointment updated to confirmed.");

    // Send confirmation email
    console.log("[CHECKOUT CONFIRM] About to send confirmation email...");
    try {
      console.log(
        "[CHECKOUT CONFIRM] Loading appointment with populated data..."
      );
      const confirmedAppt = await Appointment.findById(appt._id)
        .populate("serviceId")
        .populate("beauticianId");
      console.log(
        "[CHECKOUT CONFIRM] Loaded appointment:",
        confirmedAppt._id,
        "Client email:",
        confirmedAppt.client?.email
      );

      await sendConfirmationEmail({
        appointment: confirmedAppt,
        service: confirmedAppt.serviceId,
        beautician: confirmedAppt.beauticianId,
      });
      console.log(
        "[CHECKOUT CONFIRM] Confirmation email sent to:",
        confirmedAppt.client?.email
      );
    } catch (emailErr) {
      console.error(
        "[CHECKOUT CONFIRM] Failed to send confirmation email:",
        emailErr
      );
      // Don't fail the request if email fails
    }

    res.json({ ok: true, status: "confirmed" });
  } catch (err) {
    console.error("[CHECKOUT CONFIRM] Error:", err);
    next(err);
  }
});

r.post("/create-session", async (req, res, next) => {
  try {
    const { appointmentId, mode, currency: requestedCurrency } = req.body || {};
    let appt = null;
    let service = null;

    if (appointmentId) {
      appt = await Appointment.findById(appointmentId).lean();
      if (!appt)
        return res.status(404).json({ error: "Appointment not found" });
      if (appt.status !== "reserved_unpaid")
        return res
          .status(400)
          .json({ error: "Appointment not in payable state" });
      service = await Service.findById(appt.serviceId).lean();
      if (!service) return res.status(404).json({ error: "Service not found" });
    } else {
      // Create a reserved-unpaid appointment first (same logic as /api/appointments)
      const {
        beauticianId,
        any,
        serviceId,
        variantName,
        startISO,
        client,
        userId,
      } = req.body || {};
      service = await Service.findById(serviceId).lean();
      if (!service) return res.status(404).json({ error: "Service not found" });
      const variant = (service.variants || []).find(
        (v) => v.name === variantName
      );
      if (!variant) return res.status(404).json({ error: "Variant not found" });
      let beautician = null;
      if (any) {
        beautician = await Specialist.findOne({
          _id: { $in: service.beauticianIds },
          active: true,
        }).lean();
      } else {
        beautician = await Specialist.findById(beauticianId).lean();
      }
      if (!beautician)
        return res.status(400).json({ error: "No beautician available" });
      const start = new Date(startISO);
      const end = new Date(
        start.getTime() +
          (variant.durationMin +
            (variant.bufferBeforeMin || 0) +
            (variant.bufferAfterMin || 0)) *
            60000
      );
      const conflict = await Appointment.findOne({
        beauticianId: Specialist._id,
        start: { $lt: end },
        end: { $gt: start },
      }).lean();
      if (conflict)
        return res.status(409).json({ error: "Slot no longer available" });
      appt = await Appointment.create({
        client,
        beauticianId: Specialist._id,
        serviceId,
        variantName,
        start,
        end,
        price: variant.promoPrice || variant.price,
        status: "reserved_unpaid",
        tenantId: req.tenantId, // Add tenantId from middleware
        ...(userId ? { userId } : {}), // Add userId if provided (logged-in users)
      });
      appt = appt.toObject();
    }

    // Use requested currency or default to environment/gbp
    const currency = (
      requestedCurrency ||
      process.env.STRIPE_CURRENCY ||
      "gbp"
    ).toLowerCase();
    const frontend = process.env.FRONTEND_URL || "http://localhost:5173";

    const depositPct = Number(process.env.STRIPE_DEPOSIT_PERCENT || 0);

    const isDepositRequested = String(mode).toLowerCase() === "deposit";
    const isDeposit = isDepositRequested && depositPct > 0 && depositPct < 100;
    if (isDepositRequested && !isDeposit) {
      return res.status(400).json({
        error:
          "Deposit mode requested but STRIPE_DEPOSIT_PERCENT not configured (1-99)",
      });
    }
    // Get beautician to check payment settings and Stripe Connect status
    const beautician = await Specialist.findById(appt.beauticianId).lean();

    // Get tenant for platform fee, currency settings, and URLs
    const tenant = req.tenant;
    const tenantSlug = tenant?.slug || "";
    const tenantPath = tenantSlug ? `/salon/${tenantSlug}` : "";

    console.log("[CHECKOUT] Tenant slug:", tenantSlug);
    console.log("[CHECKOUT] Tenant path:", tenantPath);
    const platformFee =
      tenant?.paymentSettings?.platformFeePerBooking ||
      Number(process.env.STRIPE_PLATFORM_FEE || 50); // £0.50 in pence

    const baseAmount = Number(appt.price || 0);

    // If beautician accepts in-salon payment, charge only the booking fee
    let amountBeforeFee;
    if (beautician?.inSalonPayment) {
      amountBeforeFee = 0; // No service charge, only booking fee
    } else {
      // Normal payment flow
      amountBeforeFee = isDeposit
        ? (baseAmount * depositPct) / 100
        : baseAmount;
    }

    const amountToPay = amountBeforeFee + platformFee / 100; // Convert pence to pounds

    const unit_amount = toMinorUnits(amountToPay);
    if (unit_amount < 1)
      return res.status(400).json({ error: "Invalid amount" });

    // Multi-tenant Stripe Connect setup
    // Use platform Stripe account and transfer to beautician if they're connected
    const stripe = getStripe();
    const useConnect =
      beautician?.stripeAccountId && beautician?.stripeStatus === "connected";

    // Create or find Stripe customer with pre-filled information
    let stripeCustomerId = null;
    if (appt?.client?.email) {
      try {
        // Search for existing customer by email
        const existingCustomers = await stripe.customers.list({
          email: appt.client.email,
          limit: 1,
        });

        if (existingCustomers.data.length > 0) {
          stripeCustomerId = existingCustomers.data[0].id;
          console.log(
            "[CHECKOUT] Using existing Stripe customer:",
            stripeCustomerId
          );

          // Update existing customer with latest info
          try {
            await stripe.customers.update(stripeCustomerId, {
              name: appt.client.name || undefined,
              phone: appt.client.phone || undefined,
            });
            console.log("[CHECKOUT] Updated existing customer info");
          } catch (updateErr) {
            console.error("[CHECKOUT] Error updating customer:", updateErr);
          }
        } else {
          // Create new customer with pre-filled info
          const customer = await stripe.customers.create({
            email: appt.client.email,
            name: appt.client.name || undefined,
            phone: appt.client.phone || undefined,
            metadata: {
              appointmentId: String(appt._id),
            },
          });
          stripeCustomerId = customer.id;
          console.log(
            "[CHECKOUT] Created new Stripe customer:",
            stripeCustomerId
          );
        }
      } catch (err) {
        console.error("[CHECKOUT] Error creating/finding customer:", err);
        // Continue without customer ID - will fall back to email pre-fill
      }
    }

    // Build checkout session config
    let sessionConfig = {
      mode: "payment",
      client_reference_id: String(appt._id),
      success_url: `${frontend}${tenantPath}/success?appointmentId=${appt._id}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontend}${tenantPath}/cancel?appointmentId=${appt._id}`,
      metadata: {
        appointmentId: String(appt._id),
        beauticianId: String(appt.beauticianId),
        type: isDeposit ? "deposit" : "full",
      },
      line_items: [
        {
          price_data: {
            currency,
            unit_amount,
            product_data: {
              name: `${service.name} - ${appt.variantName}`,
              description: isDeposit
                ? `Deposit payment (${depositPct}% of total ${baseAmount.toFixed(
                    2
                  )})`
                : `Full payment (total ${baseAmount.toFixed(2)})`,
            },
          },
          quantity: 1,
        },
      ],
      allow_promotion_codes: true,
      billing_address_collection: "required",
    };

    // Use customer ID if we have one (this pre-fills all their info)
    if (stripeCustomerId) {
      sessionConfig.customer = stripeCustomerId;
      // Allow updating customer details - this ensures the form shows saved data
      sessionConfig.customer_update = {
        name: "auto",
        address: "auto",
        shipping: "auto",
      };
      // Enable phone collection to show saved phone
      sessionConfig.phone_number_collection = {
        enabled: true,
      };
    } else if (appt?.client?.email) {
      // Fall back to just email if no customer created
      sessionConfig.customer_email = appt.client.email;
      // Since we're creating a customer on the fly, set this
      sessionConfig.customer_creation = "always";
      // Enable phone collection for new customers
      sessionConfig.phone_number_collection = {
        enabled: true,
      };
    }

    // Multi-tenant Stripe Connect configuration
    // Use platform account and transfer to beautician after taking platform fee
    if (useConnect) {
      sessionConfig.payment_intent_data = {
        application_fee_amount: platformFee, // £0.50 to platform
        transfer_data: {
          destination: Specialist.stripeAccountId,
        },
        metadata: {
          appointmentId: String(appt._id),
          beauticianId: String(appt.beauticianId),
          tenantId: tenant?._id?.toString() || "default",
          type: isDeposit ? "deposit" : "full",
        },
      };
      console.log(
        "[CHECKOUT] Creating DIRECT CHARGE on connected account:",
        Specialist.stripeAccountId,
        "Platform fee:",
        platformFee
      );
    }

    // Create session using the stripe instance already created above
    const session = await stripe.checkout.sessions.create(sessionConfig);

    await Appointment.findByIdAndUpdate(appt._id, {
      $set: {
        payment: {
          provider: "stripe",
          sessionId: session.id,
          status: "pending",
          mode: isDeposit ? "deposit" : "pay_now", // Save the payment mode
          amountTotal: unit_amount, // Save intended amount in minor units (e.g. pence)
        },
      },
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/checkout/cancel-appointment - Delete unpaid appointment when payment is cancelled
r.delete("/cancel-appointment/:appointmentId", async (req, res, next) => {
  try {
    const { appointmentId } = req.params;

    // Find the appointment
    const appointment = await Appointment.findById(appointmentId);
    if (!appointment) {
      return res.status(404).json({ error: "Appointment not found" });
    }

    // Only delete if appointment is reserved_unpaid (hasn't been paid)
    if (appointment.status !== "reserved_unpaid") {
      return res.status(400).json({
        error: "Can only delete unpaid appointments",
        status: appointment.status,
      });
    }

    // Delete the appointment to free up the timeslot
    await Appointment.findByIdAndDelete(appointmentId);

    console.log(
      `[CHECKOUT CANCEL] Deleted unpaid appointment ${appointmentId}`
    );

    res.json({
      success: true,
      message: "Unpaid appointment deleted successfully",
    });
  } catch (err) {
    console.error("[CHECKOUT CANCEL] Error:", err);
    next(err);
  }
});

export default r;
