import { Router } from "express";
import Stripe from "stripe";
import Service from "../models/Service.js";
import Specialist from "../models/Specialist.js";
import Appointment from "../models/Appointment.js";
import Tenant from "../models/Tenant.js";
import { sendConfirmationEmail } from "../emails/mailer.js";
import ClientService from "../services/clientService.js";
import AppointmentService from "../services/appointmentService.js";
import jwt from "jsonwebtoken";
import Client from "../models/Client.js";
import smsService from "../services/smsService.js";

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

    // Get specialist to determine which Stripe account has the session
    const specialist = await Specialist.findById(appt.specialistId).lean();

    // Retrieve session from the correct account
    let stripe;
    if (
      specialist?.stripeAccountId &&
      specialist?.stripeStatus === "connected"
    ) {
      // Direct charge - session is on specialist's account
      stripe = getStripe(Specialist.stripeAccountId);
      console.log(
        "[CHECKOUT CONFIRM] Retrieving from specialist account:",
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

    // Platform fee (specialist already loaded above)
    const platformFee = Number(process.env.STRIPE_PLATFORM_FEE || 99);

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

    // Add Connect data if specialist was connected
    if (
      specialist?.stripeAccountId &&
      specialist?.stripeStatus === "connected"
    ) {
      stripeData.platformFee = platformFee;
      stripeData.beauticianStripeAccount = Specialist.stripeAccountId;
      console.log("[CHECKOUT CONFIRM] Stripe Connect payment tracked");

      // Update specialist's total earnings (amount minus platform fee, converted to pounds)
      const earningsInPounds = (amountTotal - platformFee) / 100;
      await Specialist.findByIdAndUpdate(appt.specialistId, {
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

    // Update client metrics after successful booking
    if (appt.clientId) {
      try {
        await ClientService.updateTenantClientMetrics(
          appt.tenantId,
          appt.clientId
        );
        console.log("[CHECKOUT CONFIRM] Client metrics updated");
      } catch (error) {
        console.error(
          "[CHECKOUT CONFIRM] Failed to update client metrics:",
          error.message
        );
        // Don't fail the request if metrics update fails
      }
    }

    // Send confirmation email
    console.log("[CHECKOUT CONFIRM] About to send confirmation email...");
    try {
      console.log(
        "[CHECKOUT CONFIRM] Loading appointment with populated data..."
      );
      const confirmedAppt = await Appointment.findById(appt._id)
        .populate("serviceId")
        .populate("specialistId", "name email subscription");
      console.log(
        "[CHECKOUT CONFIRM] Loaded appointment:",
        confirmedAppt._id,
        "Client email:",
        confirmedAppt.client?.email
      );

      // For multi-service bookings, fetch service details
      let serviceForEmail = confirmedAppt.serviceId;
      if (!serviceForEmail && confirmedAppt.services?.length > 0) {
        // Bulk fetch all services for multi-service appointment
        const serviceIds = confirmedAppt.services
          .map((s) => s.serviceId)
          .filter(Boolean);
        if (serviceIds.length > 0) {
          const services = await Service.find({
            _id: { $in: serviceIds },
          }).lean();
          // Use first service for email display (or combine names)
          serviceForEmail = services[0] || {
            name: confirmedAppt.services[0].serviceName || "Service",
          };
        }
      }

      // Email is sent by webhook handler to avoid duplicates
      console.log(
        "[CHECKOUT CONFIRM] Skipping email - will be sent by webhook"
      );

      // Send SMS confirmation
      if (confirmedAppt.client?.phone) {
        let serviceName = "your service";

        // Handle both single and multi-service appointments
        if (confirmedAppt.serviceId?.name) {
          serviceName = confirmedAppt.serviceId.name;
        } else if (confirmedAppt.services?.length > 0) {
          // For multi-service: show first service name or combine
          serviceName =
            confirmedAppt.services[0].serviceName || "your services";
        } else if (confirmedAppt.serviceName) {
          serviceName = confirmedAppt.serviceName;
        }

        // Extract time from start Date object
        const startDate = new Date(confirmedAppt.start);
        const timeStr = startDate.toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
        });

        console.log("[CHECKOUT CONFIRM] SMS data:", {
          serviceName,
          start: confirmedAppt.start,
          extractedTime: timeStr,
          phone: confirmedAppt.client.phone,
        });

        // Check if specialist has active SMS subscription AND tenant has SMS enabled
        const Specialist = mongoose.model("Specialist");
        const specialist = await Specialist.findById(
          confirmedAppt.specialistId
        ).select("subscription");

        const Tenant = mongoose.model("Tenant");
        const tenant = await Tenant.findById(confirmedAppt.tenantId).select(
          "features"
        );

        const hasActiveSmsSubscription =
          specialist?.subscription?.smsConfirmations?.enabled === true;
        const tenantSmsEnabled = tenant?.features?.smsConfirmations === true;

        if (!hasActiveSmsSubscription) {
          console.log(
            "[CHECKOUT CONFIRM] Specialist does not have active SMS subscription (enabled=" +
              specialist?.subscription?.smsConfirmations?.enabled +
              "), skipping SMS"
          );
        } else if (!tenantSmsEnabled) {
          console.log(
            "[CHECKOUT CONFIRM] Tenant SMS feature is disabled, skipping SMS"
          );
        } else {
          smsService
            .sendBookingConfirmation({
              serviceName: serviceName,
              date: confirmedAppt.start,
              startTime: timeStr,
              customerPhone: confirmedAppt.client.phone,
            })
            .then(() =>
              console.log(
                "[CHECKOUT CONFIRM] SMS confirmation sent to:",
                confirmedAppt.client.phone
              )
            )
            .catch((err) =>
              console.error("[CHECKOUT CONFIRM] SMS failed:", err.message)
            );
        }
      } else {
        console.log("[CHECKOUT CONFIRM] No phone number, skipping SMS");
      }
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
        specialistId,
        any,
        serviceId,
        variantName,
        services, // NEW: Support multiple services
        startISO,
        client,
        userId,
        locationId,
      } = req.body || {};

      // Handle multiple services
      let totalPrice = 0;
      let totalDuration = 0;
      let servicesData = [];

      if (services && Array.isArray(services) && services.length > 0) {
        // Multi-service booking
        for (const svc of services) {
          const fullService = await Service.findById(svc.serviceId).lean();
          if (!fullService) continue;

          const variant = (fullService.variants || []).find(
            (v) => v.name === svc.variantName
          );
          if (!variant) continue;

          const servicePrice = variant.promoPrice || variant.price || 0;
          const serviceDuration =
            variant.durationMin +
            (variant.bufferBeforeMin || 0) +
            (variant.bufferAfterMin || 0);

          totalPrice += servicePrice;
          totalDuration += serviceDuration;

          servicesData.push({
            serviceId: svc.serviceId,
            serviceName: fullService.name,
            variantName: svc.variantName,
            price: servicePrice,
            duration: serviceDuration,
          });
        }
      } else {
        // Legacy single service booking
        service = await Service.findById(serviceId).lean();
        if (!service)
          return res.status(404).json({ error: "Service not found" });
        const variant = (service.variants || []).find(
          (v) => v.name === variantName
        );
        if (!variant)
          return res.status(404).json({ error: "Variant not found" });

        totalPrice = variant.promoPrice || variant.price;
        totalDuration =
          variant.durationMin +
          (variant.bufferBeforeMin || 0) +
          (variant.bufferAfterMin || 0);

        servicesData.push({
          serviceId,
          serviceName: service.name,
          variantName,
          price: totalPrice,
          duration: totalDuration,
        });
      }
      let specialist = null;
      if (any) {
        // Get first service to find available specialists
        const firstServiceId = servicesData[0]?.serviceId || serviceId;
        const firstService = await Service.findById(firstServiceId).lean();
        specialist = await Specialist.findOne({
          _id: { $in: firstService.beauticianIds },
          active: true,
        }).lean();
      } else {
        specialist = await Specialist.findById(specialistId).lean();
      }
      if (!specialist)
        return res.status(400).json({ error: "No specialist available" });

      const start = new Date(startISO);
      const end = new Date(start.getTime() + totalDuration * 60000);

      console.log("[CHECKOUT] Checking slot availability:", {
        specialistId: specialist._id,
        start: start.toISOString(),
        end: end.toISOString(),
        totalDuration,
        servicesCount: servicesData.length,
      });

      // Check for conflicts, excluding:
      // - Cancelled appointments
      // - reserved_unpaid appointments older than 3 minutes (expired)
      const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000);
      const conflict = await Appointment.findOne({
        specialistId: specialist._id,
        start: { $lt: end },
        end: { $gt: start },
        $and: [
          { status: { $not: /^cancelled/ } },
          {
            $or: [
              { status: { $ne: "reserved_unpaid" } },
              { createdAt: { $gte: threeMinutesAgo } },
            ],
          },
        ],
      }).lean();

      if (conflict) {
        console.log("[CHECKOUT] Slot conflict detected:", {
          conflictingAppointmentId: conflict._id,
          conflictStart: conflict.start,
          conflictEnd: conflict.end,
          conflictStatus: conflict.status,
          requestedStart: start.toISOString(),
          requestedEnd: end.toISOString(),
        });
        return res.status(409).json({ error: "Slot no longer available" });
      }

      console.log("[CHECKOUT] No conflicts found, slot is available");

      // Check if client is logged in via clientToken cookie
      let globalClient = null;
      const clientToken = req.cookies?.clientToken;

      if (clientToken) {
        try {
          const decoded = jwt.verify(clientToken, process.env.JWT_SECRET);
          if (decoded.type === "client" && decoded.clientId) {
            globalClient = await Client.findById(decoded.clientId);
            console.log(
              `[Checkout] Using logged-in client: ${globalClient._id} (${globalClient.email})`
            );
          }
        } catch (err) {
          console.log("[Checkout] Invalid clientToken, creating new client");
        }
      }

      // If not logged in, create or find client by email (soft signup)
      if (!globalClient) {
        globalClient = await ClientService.findOrCreateClient({
          email: client.email,
          name: client.name,
          phone: client.phone,
        });
        console.log(
          `[Checkout] Created/found client by email: ${globalClient._id} (${globalClient.email})`
        );
      }

      // Create or find tenant-client relationship
      await ClientService.findOrCreateTenantClient(
        req.tenantId,
        globalClient._id,
        { name: globalClient.name }
      );

      appt = await Appointment.create({
        client,
        clientId: globalClient._id, // Link to global client
        specialistId: specialist._id,
        // Multi-service support
        services: servicesData,
        totalDuration,
        // Legacy single service fields (for backward compatibility)
        serviceId: servicesData[0]?.serviceId,
        variantName: servicesData[0]?.variantName,
        start,
        end,
        price: totalPrice,
        status: "reserved_unpaid",
        tenantId: req.tenantId,
        ...(userId ? { userId } : {}),
        ...(locationId ? { locationId } : {}),
      });

      console.log(
        `[Checkout] Created appointment with clientId: ${globalClient._id}, appointmentId: ${appt._id}`
      );

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
    // Get specialist and tenant to check payment settings
    const specialist = await Specialist.findById(appt.specialistId).lean();
    const tenantForFlags = await Tenant.findById(appt.tenantId)
      .select("features")
      .lean();

    // Check if specialist has active no-fee subscription
    const hasNoFeeSubscription =
      specialist?.subscription?.noFeeBookings?.enabled === true &&
      specialist?.subscription?.noFeeBookings?.status === "active";

    console.log(
      "[CHECKOUT] Specialist has no-fee subscription:",
      hasNoFeeSubscription
    );

    // Require Stripe connection for online payments UNLESS specialist has no-fee subscription
    if (
      !hasNoFeeSubscription &&
      (!specialist?.stripeAccountId || specialist?.stripeStatus !== "connected")
    ) {
      return res.status(400).json({
        error: "Online payments not available",
        message:
          "This specialist has not connected their Stripe account yet. Please contact them to set up online payments, or choose a different payment method.",
        code: "STRIPE_NOT_CONNECTED",
      });
    }

    // Get tenant for platform fee, currency settings, and URLs
    const tenant = req.tenant;
    const tenantSlug = tenant?.slug || "";
    const tenantPath = tenantSlug ? `/salon/${tenantSlug}` : "";

    console.log("[CHECKOUT] Tenant slug:", tenantSlug);
    console.log("[CHECKOUT] Tenant path:", tenantPath);

    // Apply booking fee only if specialist doesn't have subscription
    // Platform fee is controlled by the platform, not individual tenants
    const platformFee = hasNoFeeSubscription
      ? 0
      : Number(process.env.STRIPE_PLATFORM_FEE || 99); // £0.99 in pence

    console.log("[CHECKOUT] Platform fee (pence):", platformFee);
    console.log("[CHECKOUT] Platform fee (pounds):", platformFee / 100);

    const baseAmount = Number(appt.price || 0);

    // If specialist accepts in-salon payment, charge only the booking fee
    let amountBeforeFee;
    if (specialist?.inSalonPayment) {
      amountBeforeFee = 0; // No service charge, only booking fee
    } else {
      // Normal payment flow
      amountBeforeFee = isDeposit
        ? (baseAmount * depositPct) / 100
        : baseAmount;
    }

    console.log("[CHECKOUT] Base amount:", baseAmount);
    console.log("[CHECKOUT] Amount before fee:", amountBeforeFee);

    const amountToPay = amountBeforeFee + platformFee / 100; // Convert pence to pounds

    console.log("[CHECKOUT] Amount to pay (with fee):", amountToPay);

    const unit_amount = toMinorUnits(amountToPay);
    console.log("[CHECKOUT] Unit amount (pence):", unit_amount);

    if (unit_amount < 1)
      return res.status(400).json({ error: "Invalid amount" });

    // Build service name for Stripe checkout
    let serviceName;
    let serviceDescription;
    if (appt.services && appt.services.length > 0) {
      // Multi-service booking - use bulk service fetch for performance
      const serviceIds = appt.services.map((s) => s.serviceId).filter(Boolean);
      const serviceMap = await AppointmentService.getServiceMapByIds(
        serviceIds
      );

      if (appt.services.length === 1) {
        const svc = serviceMap.get(appt.services[0].serviceId.toString());
        serviceName = svc
          ? `${svc.name} - ${appt.services[0].variantName}`
          : "Service";
      } else {
        serviceName = `${appt.services.length} Services`;
        const serviceNames = appt.services.map((s) => {
          const svc = serviceMap.get(s.serviceId.toString());
          return svc ? `${svc.name} (${s.variantName})` : "Service";
        });
        serviceDescription = serviceNames.join(", ");
      }
    } else if (service) {
      // Legacy single service
      serviceName = `${service.name} - ${appt.variantName}`;
    } else {
      serviceName = "Service";
    }

    // Multi-tenant Stripe Connect setup
    // Use platform Stripe account and transfer to specialist if they're connected
    const stripe = getStripe();
    const useConnect =
      specialist?.stripeAccountId && specialist?.stripeStatus === "connected";

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
        specialistId: String(appt.specialistId),
        type: isDeposit ? "deposit" : "full",
        ...(isDeposit ? { depositPercentage: String(depositPct) } : {}),
      },
      line_items: [
        {
          price_data: {
            currency,
            unit_amount,
            product_data: {
              name: serviceName,
              description:
                serviceDescription ||
                (isDeposit
                  ? `Deposit payment (${depositPct}% of total ${baseAmount.toFixed(
                      2
                    )})`
                  : `Full payment (total ${baseAmount.toFixed(2)})`),
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
    // Use platform account and transfer to specialist after taking platform fee
    if (useConnect) {
      sessionConfig.payment_intent_data = {
        application_fee_amount: platformFee, // £0.99 to platform
        transfer_data: {
          destination: specialist.stripeAccountId,
        },
        metadata: {
          appointmentId: String(appt._id),
          specialistId: String(appt.specialistId),
          tenantId: tenant?._id?.toString() || "default",
          type: isDeposit ? "deposit" : "full",
        },
      };
      console.log(
        "[CHECKOUT] Creating DIRECT CHARGE on connected account:",
        specialist.stripeAccountId,
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
