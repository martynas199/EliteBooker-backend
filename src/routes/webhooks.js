import { Router } from "express";
import Stripe from "stripe";
import mongoose from "mongoose";
import Appointment from "../models/Appointment.js";
import Specialist from "../models/Specialist.js";
import Order from "../models/Order.js";
import Payment from "../models/Payment.js";
import {
  sendConfirmationEmail,
  sendOrderConfirmationEmail,
  sendAdminOrderNotification,
  sendBeauticianProductOrderNotification,
} from "../emails/mailer.js";
import smsService from "../services/smsService.js";

const r = Router();
let stripeInstance = null;
function getStripe() {
  if (!stripeInstance) {
    const key = process.env.STRIPE_SECRET || process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET not configured");
    stripeInstance = new Stripe(key, { apiVersion: "2024-06-20" });
  }
  return stripeInstance;
}

// Note: This route expects the raw request body. Ensure server mounts it with express.raw for this path.
r.post("/stripe", async (req, res) => {
  console.log("[WEBHOOK] ========================================");
  console.log("[WEBHOOK] Received Stripe webhook");
  console.log("[WEBHOOK] Timestamp:", new Date().toISOString());
  console.log("[WEBHOOK] ========================================");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  console.log(
    "[WEBHOOK] Webhook secret configured:",
    webhookSecret ? "YES" : "NO"
  );
  if (!process.env.STRIPE_SECRET || !webhookSecret) {
    console.error("[WEBHOOK] Stripe not configured");
    return res.status(500).send("Stripe not configured");
  }

  const sig = req.headers["stripe-signature"];
  let event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    console.log("[WEBHOOK] Event verified:", event.type, "ID:", event.id);
  } catch (err) {
    console.error("[WEBHOOK] Signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const apptId =
          session.client_reference_id || session.metadata?.appointmentId;
        const orderId = session.metadata?.orderId;

        console.log(
          "[WEBHOOK] checkout.session.completed - apptId:",
          apptId,
          "orderId:",
          orderId,
          "session:",
          session.id
        );

        // Handle appointment confirmation
        if (apptId) {
          try {
            // Determine payment mode from session metadata
            const isDepositPayment = session.metadata?.type === "deposit";
            const paymentMode = isDepositPayment ? "deposit" : "pay_now";

            const appointment = await Appointment.findByIdAndUpdate(
              apptId,
              {
                $set: {
                  status: "confirmed",
                  "payment.status": "succeeded",
                  "payment.provider": "stripe",
                  "payment.mode": paymentMode,
                  "payment.sessionId": session.id,
                  ...(session.amount_total != null
                    ? { "payment.amountTotal": Number(session.amount_total) }
                    : {}),
                  ...(isDepositPayment && session.metadata?.depositPercentage
                    ? {
                        "payment.depositPercentage": Number(
                          session.metadata.depositPercentage
                        ),
                      }
                    : {}),
                },
                $push: {
                  audit: {
                    at: new Date(),
                    action: "webhook_checkout_completed",
                    meta: { eventId: event.id },
                  },
                },
              },
              { new: true }
            )
              .populate("serviceId")
              .populate("specialistId", "name email subscription");

            console.log(
              "[WEBHOOK] Appointment",
              apptId,
              "updated to confirmed"
            );

            // Send confirmation email
            if (appointment) {
              try {
                await sendConfirmationEmail({
                  appointment,
                  service: appointment.serviceId,
                  specialist: appointment.specialistId,
                });
                console.log(
                  "[WEBHOOK] Confirmation email sent for appointment",
                  apptId
                );
              } catch (emailErr) {
                console.error(
                  "[WEBHOOK] Failed to send confirmation email:",
                  emailErr
                );
              }

              // Send SMS confirmation
              if (appointment.client?.phone) {
                console.log("[WEBHOOK] Sending SMS with data:", {
                  services: appointment.services,
                  serviceId: appointment.serviceId?.name,
                  specialist: appointment.specialistId?.name,
                  phone: appointment.client.phone,
                });

                // Check if SMS confirmations feature is enabled in tenant settings
                const Tenant = mongoose.model("Tenant");
                const tenant = await Tenant.findById(
                  appointment.tenantId
                ).select("features");
                const smsConfirmationsEnabled =
                  tenant?.features?.smsConfirmations === true;

                if (!smsConfirmationsEnabled) {
                  console.log(
                    "[WEBHOOK] SMS Confirmations feature is disabled, skipping SMS"
                  );
                } else {
                  smsService
                    .sendBookingConfirmation({
                      services: appointment.services,
                      serviceName:
                        appointment.serviceId?.name || appointment.serviceName,
                      date: appointment.start,
                      specialistName: appointment.specialistId?.name,
                      customerPhone: appointment.client.phone,
                    })
                    .then(() =>
                      console.log(
                        "[WEBHOOK] SMS confirmation sent to:",
                        appointment.client.phone
                      )
                    )
                    .catch((err) =>
                      console.error("[WEBHOOK] SMS failed:", err.message)
                    );
                }
              } else {
                console.log("[WEBHOOK] No phone number, skipping SMS");
              }
            }
          } catch (e) {
            console.error("[WEBHOOK] update err", e);
          }
        }

        // Handle product order confirmation
        if (orderId) {
          try {
            const order = await Order.findByIdAndUpdate(
              orderId,
              {
                $set: {
                  paymentStatus: "paid",
                  status: "processing",
                },
              },
              { new: true }
            );

            console.log("[WEBHOOK] Order", orderId, "updated to paid");

            // Send order confirmation email to customer
            if (order) {
              try {
                await sendOrderConfirmationEmail({ order });
                console.log(
                  "[WEBHOOK] Order confirmation email sent to customer for order",
                  orderId
                );
              } catch (emailErr) {
                console.error(
                  "[WEBHOOK] Failed to send order confirmation email:",
                  emailErr
                );
              }

              // Send admin notification
              try {
                await sendAdminOrderNotification({ order });
                console.log(
                  "[WEBHOOK] Admin notification sent for order",
                  orderId
                );
              } catch (emailErr) {
                console.error(
                  "[WEBHOOK] Failed to send admin notification:",
                  emailErr
                );
              }

              // Send notifications to specialists for their products
              const itemsByBeautician = {};
              for (const item of order.items) {
                const specialistId = item.productId?.specialistId;
                if (specialistId) {
                  const beauticianIdStr = specialistId.toString();
                  if (!itemsByBeautician[beauticianIdStr]) {
                    itemsByBeautician[beauticianIdStr] = [];
                  }
                  itemsByBeautician[beauticianIdStr].push(item);
                }
              }

              for (const [specialistId, items] of Object.entries(
                itemsByBeautician
              )) {
                try {
                  const specialist = await Specialist.findById(specialistId);
                  if (specialist?.email) {
                    await sendBeauticianProductOrderNotification({
                      order,
                      specialist,
                      beauticianItems: items,
                    });
                    console.log(
                      `[WEBHOOK] Specialist notification sent to ${Specialist.email} for ${items.length} product(s) in order ${orderId}`
                    );
                  }
                } catch (beauticianEmailErr) {
                  console.error(
                    `[WEBHOOK] Failed to send specialist notification to ${specialistId}:`,
                    beauticianEmailErr
                  );
                  // Continue with other specialists
                }
              }
            }
          } catch (e) {
            console.error("[WEBHOOK] order update err", e);
          }
        }

        if (!apptId && !orderId) {
          console.warn(
            "[WEBHOOK] checkout.session.completed missing both apptId and orderId"
          );
        }
        break;
      }
      case "payment_intent.succeeded": {
        const pi = event.data.object;
        const apptId = pi.metadata?.appointmentId;
        const orderId = pi.metadata?.orderId;
        const tenantId = pi.metadata?.tenantId;

        console.log(
          "[WEBHOOK] payment_intent.succeeded - apptId:",
          apptId,
          "orderId:",
          orderId,
          "tenantId:",
          tenantId,
          "pi:",
          pi.id
        );

        // Track platform fee if present
        if (pi.application_fee_amount && tenantId) {
          console.log(
            `[WEBHOOK] Platform fee collected: £${
              pi.application_fee_amount / 100
            } for tenant ${tenantId}`
          );
        }

        if (apptId) {
          try {
            const updateData = {
              $set: {
                status: "confirmed",
                "payment.status": "succeeded",
                "payment.provider": "stripe",
                "payment.mode": "pay_now",
                "payment.stripe.paymentIntentId": pi.id,
              },
              $push: {
                audit: {
                  at: new Date(),
                  action: "webhook_pi_succeeded",
                  meta: {
                    eventId: event.id,
                    platformFee: pi.application_fee_amount || 0,
                  },
                },
              },
            };

            // Store platform fee info if present
            if (pi.application_fee_amount) {
              updateData.$set["payment.stripe.platformFee"] =
                pi.application_fee_amount;
            }

            const appointment = await Appointment.findByIdAndUpdate(
              apptId,
              updateData,
              { new: true }
            )
              .populate("serviceId")
              .populate("specialistId");

            console.log(
              "[WEBHOOK] Appointment",
              apptId,
              "updated to confirmed via PI"
            );

            // Note: Confirmation email is sent in checkout.session.completed
            // We don't send it here to avoid duplicates
          } catch (e) {
            console.error("[WEBHOOK] update err", e);
          }
        }

        // Handle product order payment success
        if (orderId) {
          try {
            const updateData = {
              $set: {
                paymentStatus: "paid",
              },
            };

            // Store platform fee info if present
            if (pi.application_fee_amount) {
              updateData.$set.platformFee = pi.application_fee_amount;
            }

            await Order.findByIdAndUpdate(orderId, updateData);
            console.log("[WEBHOOK] Order", orderId, "marked as paid via PI");
          } catch (e) {
            console.error("[WEBHOOK] order PI update err", e);
          }
        }
        break;
      }
      case "charge.refunded": {
        const charge = event.data.object;
        const apptId = charge.metadata?.appointmentId;
        const orderId = charge.metadata?.orderId;

        console.log(
          "[WEBHOOK] charge.refunded - apptId:",
          apptId,
          "orderId:",
          orderId
        );

        if (apptId) {
          try {
            await Appointment.findByIdAndUpdate(apptId, {
              $set: { "payment.status": "refunded" },
              $push: {
                audit: {
                  at: new Date(),
                  action: "stripe_refund_webhook",
                  meta: { eventId: event.id },
                },
              },
            });
            console.log("[WEBHOOK] Appointment", apptId, "marked as refunded");
          } catch (e) {
            console.error("[WEBHOOK] refund update err", e);
          }
        }

        if (orderId) {
          try {
            await Order.findByIdAndUpdate(orderId, {
              $set: {
                paymentStatus: "refunded",
                refundStatus: "full",
                refundedAt: new Date(),
              },
            });
            console.log("[WEBHOOK] Order", orderId, "marked as refunded");
          } catch (e) {
            console.error("[WEBHOOK] order refund update err", e);
          }
        }
        break;
      }

      case "account.updated": {
        // Stripe Connect account status changed
        const account = event.data.object;
        console.log("[WEBHOOK] account.updated - account:", account.id);

        try {
          const specialist = await Specialist.findOne({
            stripeAccountId: account.id,
          });
          if (specialist) {
            const isComplete =
              account.details_submitted && account.charges_enabled;
            Specialist.stripeStatus = isComplete ? "connected" : "pending";
            Specialist.stripeOnboardingCompleted = isComplete;

            // Track payouts enabled status
            if (account.payouts_enabled !== undefined) {
              Specialist.stripePayoutsEnabled = account.payouts_enabled;
            }

            await Specialist.save();
            console.log(
              "[WEBHOOK] Specialist",
              Specialist._id,
              "status updated to",
              Specialist.stripeStatus,
              "payouts:",
              account.payouts_enabled
            );
          }
        } catch (e) {
          console.error("[WEBHOOK] account update err", e);
        }
        break;
      }

      case "account.application.authorized": {
        // Specialist authorized the platform to access their Connect account
        const application = event.data.object;
        console.log(
          "[WEBHOOK] account.application.authorized - account:",
          event.account
        );

        try {
          const specialist = await Specialist.findOne({
            stripeAccountId: event.account,
          });
          if (specialist) {
            Specialist.stripeStatus = "connected";
            Specialist.stripeOnboardingCompleted = true;
            await Specialist.save();
            console.log(
              "[WEBHOOK] Specialist",
              Specialist._id,
              "authorized platform access"
            );
          }
        } catch (e) {
          console.error("[WEBHOOK] account authorization err", e);
        }
        break;
      }

      case "account.application.deauthorized": {
        // Specialist revoked platform access to their Connect account
        const application = event.data.object;
        console.log(
          "[WEBHOOK] account.application.deauthorized - account:",
          event.account
        );

        try {
          const specialist = await Specialist.findOne({
            stripeAccountId: event.account,
          });
          if (specialist) {
            Specialist.stripeStatus = "disconnected";
            Specialist.stripeOnboardingCompleted = false;
            Specialist.stripeAccountId = null;
            await Specialist.save();
            console.log(
              "[WEBHOOK] Specialist",
              Specialist._id,
              "deauthorized - Stripe account disconnected"
            );
          }
        } catch (e) {
          console.error("[WEBHOOK] account deauthorization err", e);
        }
        break;
      }

      case "payout.paid": {
        // Payout successfully sent to specialist's bank
        const payout = event.data.object;
        console.log(
          "[WEBHOOK] payout.paid - amount:",
          payout.amount,
          "account:",
          event.account
        );

        try {
          const specialist = await Specialist.findOne({
            stripeAccountId: event.account,
          });
          if (specialist) {
            Specialist.totalPayouts += payout.amount / 100; // Convert from pence to pounds
            Specialist.lastPayoutDate = new Date(payout.arrival_date * 1000);
            await Specialist.save();
            console.log(
              "[WEBHOOK] Specialist",
              Specialist._id,
              "payout recorded"
            );
          }
        } catch (e) {
          console.error("[WEBHOOK] payout update err", e);
        }
        break;
      }

      case "payment_intent.payment_failed": {
        const pi = event.data.object;
        const apptId = pi.metadata?.appointmentId;
        const orderId = pi.metadata?.orderId;

        console.log(
          "[WEBHOOK] payment_intent.payment_failed - apptId:",
          apptId,
          "orderId:",
          orderId,
          "error:",
          pi.last_payment_error?.code,
          pi.last_payment_error?.decline_code
        );

        if (apptId) {
          try {
            const updateData = {
              $set: { "payment.status": "unpaid", status: "reserved_unpaid" },
              $push: {
                audit: {
                  at: new Date(),
                  action: "payment_failed",
                  meta: {
                    eventId: event.id,
                    error: pi.last_payment_error?.message,
                  },
                },
              },
            };

            // Capture detailed payment error information
            if (pi.last_payment_error) {
              const error = pi.last_payment_error;
              updateData.$set["payment.stripe.lastPaymentError"] = {
                code: error.code,
                message: error.message,
                declineCode: error.decline_code,
                type: error.type,
              };
            }

            await Appointment.findByIdAndUpdate(apptId, updateData);
          } catch (e) {
            console.error("[WEBHOOK] payment failed update err", e);
          }
        }

        if (orderId) {
          try {
            const orderUpdateData = {
              $set: { paymentStatus: "failed" },
            };

            // Capture detailed payment error information for orders
            if (pi.last_payment_error) {
              const error = pi.last_payment_error;
              orderUpdateData.$set.lastPaymentError = {
                code: error.code,
                message: error.message,
                declineCode: error.decline_code,
                type: error.type,
              };
            }

            await Order.findByIdAndUpdate(orderId, orderUpdateData);
          } catch (e) {
            console.error("[WEBHOOK] order payment failed update err", e);
          }
        }
        break;
      }

      case "customer.subscription.created": {
        // Handle subscription creation (triggered after checkout)
        const subscription = event.data.object;
        console.log(
          "[WEBHOOK] customer.subscription.created - subscription:",
          subscription.id,
          "customer:",
          subscription.customer,
          "status:",
          subscription.status
        );

        // Check if this is a no_fee_bookings subscription
        if (subscription.metadata?.feature === "no_fee_bookings") {
          const specialistId = subscription.metadata.specialistId;

          try {
            const specialist = await Specialist.findById(specialistId);
            if (!specialist) {
              console.error("[WEBHOOK] Specialist not found:", specialistId);
              break;
            }

            // RACE CONDITION FIX: Check if we already have this subscription with a better status
            const existingStatus =
              specialist.subscription?.noFeeBookings?.status;
            const existingSubId =
              specialist.subscription?.noFeeBookings?.stripeSubscriptionId;

            if (
              existingSubId === subscription.id &&
              existingStatus === "active" &&
              subscription.status === "incomplete"
            ) {
              console.log(
                "[WEBHOOK] Skipping subscription.created - already has active status (race condition avoided)"
              );
              break;
            }

            // Update specialist subscription
            specialist.subscription = specialist.subscription || {};
            specialist.subscription.noFeeBookings = {
              enabled:
                subscription.status === "active" ||
                subscription.status === "trialing",
              stripeSubscriptionId: subscription.id,
              stripePriceId: subscription.items.data[0].price.id,
              status: subscription.status,
              currentPeriodStart: new Date(
                subscription.current_period_start * 1000
              ),
              currentPeriodEnd: new Date(
                subscription.current_period_end * 1000
              ),
            };

            await specialist.save();
            console.log(
              "[WEBHOOK] Subscription saved for specialist:",
              specialistId,
              "status:",
              subscription.status,
              "enabled:",
              specialist.subscription.noFeeBookings.enabled
            );
          } catch (err) {
            console.error("[WEBHOOK] subscription creation error:", err);
          }
        }
        break;
      }

      case "customer.subscription.updated": {
        // Handle subscription updates (renewals, cancellations, etc.)
        const subscription = event.data.object;
        console.log(
          "[WEBHOOK] customer.subscription.updated - subscription:",
          subscription.id,
          "status:",
          subscription.status
        );

        try {
          // Find specialist by subscription ID - check both noFeeBookings and smsConfirmations
          let specialist = await Specialist.findOne({
            $or: [
              {
                "subscription.noFeeBookings.stripeSubscriptionId":
                  subscription.id,
              },
              {
                "subscription.smsConfirmations.stripeSubscriptionId":
                  subscription.id,
              },
            ],
          });

          // FALLBACK: If not found by subscription ID, try by customer ID (for race conditions)
          if (!specialist && subscription.customer) {
            console.log(
              "[WEBHOOK] Subscription ID lookup failed, trying customer ID:",
              subscription.customer
            );
            specialist = await Specialist.findOne({
              stripeCustomerId: subscription.customer,
            });
          }

          // FALLBACK 2: Try by metadata specialistId
          if (!specialist && subscription.metadata?.specialistId) {
            console.log(
              "[WEBHOOK] Customer ID lookup failed, trying metadata specialistId:",
              subscription.metadata.specialistId
            );
            specialist = await Specialist.findById(
              subscription.metadata.specialistId
            );
          }

          if (!specialist) {
            console.error(
              "[WEBHOOK] Specialist not found for subscription:",
              subscription.id
            );
            break;
          }

          // Determine which subscription this is by checking the price ID
          const priceId = subscription.items.data[0].price.id;
          const noFeePriceId = process.env.NO_FEE_BOOKINGS_PRICE_ID;
          const smsPriceId = process.env.SMS_CONFIRMATIONS_PRICE_ID;

          let subscriptionType = "unknown";
          if (priceId === noFeePriceId) {
            subscriptionType = "noFeeBookings";
          } else if (priceId === smsPriceId) {
            subscriptionType = "smsConfirmations";
          }

          console.log(
            "[WEBHOOK] Detected subscription type:",
            subscriptionType,
            "for price:",
            priceId
          );

          // Update the appropriate subscription
          if (subscriptionType === "noFeeBookings") {
            specialist.subscription.noFeeBookings.status = subscription.status;
            specialist.subscription.noFeeBookings.enabled =
              subscription.status === "active" ||
              subscription.status === "trialing";
            specialist.subscription.noFeeBookings.stripeSubscriptionId =
              subscription.id;
            specialist.subscription.noFeeBookings.stripePriceId = priceId;
            specialist.subscription.noFeeBookings.currentPeriodStart = new Date(
              subscription.current_period_start * 1000
            );
            specialist.subscription.noFeeBookings.currentPeriodEnd = new Date(
              subscription.current_period_end * 1000
            );

            if (subscription.cancel_at_period_end) {
              specialist.subscription.noFeeBookings.enabled = false;
            }
          } else if (subscriptionType === "smsConfirmations") {
            const isActive =
              subscription.status === "active" ||
              subscription.status === "trialing";

            specialist.subscription.smsConfirmations.status =
              subscription.status;
            specialist.subscription.smsConfirmations.enabled = isActive;
            specialist.subscription.smsConfirmations.stripeSubscriptionId =
              subscription.id;
            specialist.subscription.smsConfirmations.stripePriceId = priceId;
            specialist.subscription.smsConfirmations.currentPeriodStart =
              new Date(subscription.current_period_start * 1000);
            specialist.subscription.smsConfirmations.currentPeriodEnd =
              new Date(subscription.current_period_end * 1000);

            if (subscription.cancel_at_period_end) {
              specialist.subscription.smsConfirmations.enabled = false;
            }

            // Automatically set feature flags when subscription is activated
            if (isActive && !subscription.cancel_at_period_end) {
              // Get tenant to update feature flags
              const Tenant = mongoose.model("Tenant");
              const tenant = await Tenant.findById(specialist.tenantId);
              if (tenant) {
                // Initialize features if it doesn't exist
                if (!tenant.features) {
                  tenant.features = {};
                }
                // Enable SMS features
                tenant.features.smsConfirmations = true;
                tenant.features.smsReminders = true;
                await tenant.save();
                console.log(
                  "[WEBHOOK] Auto-enabled SMS features for tenant:",
                  tenant._id
                );
              }
            }
          }

          await specialist.save();
          console.log(
            "[WEBHOOK] Subscription updated for specialist:",
            specialist._id,
            "type:",
            subscriptionType,
            "status:",
            subscription.status
          );
        } catch (err) {
          console.error("[WEBHOOK] subscription update error:", err);
        }
        break;
      }

      case "customer.subscription.deleted": {
        // Handle subscription deletion (when it actually ends)
        const subscription = event.data.object;
        console.log(
          "[WEBHOOK] customer.subscription.deleted - subscription:",
          subscription.id
        );

        try {
          // Find specialist by subscription ID - check both subscription types
          let specialist = await Specialist.findOne({
            $or: [
              {
                "subscription.noFeeBookings.stripeSubscriptionId":
                  subscription.id,
              },
              {
                "subscription.smsConfirmations.stripeSubscriptionId":
                  subscription.id,
              },
            ],
          });

          // FALLBACK: Try by customer ID
          if (!specialist && subscription.customer) {
            console.log(
              "[WEBHOOK] Subscription ID lookup failed for deletion, trying customer ID:",
              subscription.customer
            );
            specialist = await Specialist.findOne({
              stripeCustomerId: subscription.customer,
            });
          }

          if (!specialist) {
            console.error(
              "[WEBHOOK] Specialist not found for subscription:",
              subscription.id
            );
            break;
          }

          // Determine which subscription this is
          const priceId = subscription.items.data[0].price.id;
          const noFeePriceId = process.env.NO_FEE_BOOKINGS_PRICE_ID;
          const smsPriceId = process.env.SMS_CONFIRMATIONS_PRICE_ID;

          if (priceId === noFeePriceId) {
            specialist.subscription.noFeeBookings.enabled = false;
            specialist.subscription.noFeeBookings.status = "canceled";
            console.log(
              "[WEBHOOK] No Fee Bookings subscription ended for specialist:",
              specialist._id
            );
          } else if (priceId === smsPriceId) {
            specialist.subscription.smsConfirmations.enabled = false;
            specialist.subscription.smsConfirmations.status = "canceled";
            console.log(
              "[WEBHOOK] SMS Confirmations subscription ended for specialist:",
              specialist._id
            );

            // Automatically disable feature flags when subscription is cancelled
            const Tenant = mongoose.model("Tenant");
            const tenant = await Tenant.findById(specialist.tenantId);
            if (tenant && tenant.features) {
              tenant.features.smsConfirmations = false;
              tenant.features.smsReminders = false;
              await tenant.save();
              console.log(
                "[WEBHOOK] Auto-disabled SMS features for tenant:",
                tenant._id
              );
            }
          }

          await specialist.save();
        } catch (err) {
          console.error("[WEBHOOK] subscription deletion error:", err);
        }
        break;
      }

      // ==================== TAP TO PAY PAYMENT EVENTS ====================

      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object;
        console.log("[WEBHOOK] Payment intent succeeded:", paymentIntent.id);

        try {
          const payment = await Payment.findOne({
            "stripe.paymentIntentId": paymentIntent.id,
          })
            .populate("client", "firstName lastName email phone")
            .populate("tenant", "name settings");

          if (!payment) {
            console.log(
              "[WEBHOOK] Payment not found for intent:",
              paymentIntent.id
            );
            break;
          }

          // Update payment status
          payment.status = "succeeded";
          payment.processedAt = new Date();

          // Extract card details from charge
          if (paymentIntent.charges?.data?.[0]) {
            const charge = paymentIntent.charges.data[0];
            payment.stripe.chargeId = charge.id;
            payment.stripe.paymentMethodId = charge.payment_method;

            // Get card details if available
            if (charge.payment_method_details?.card_present) {
              payment.stripe.cardBrand =
                charge.payment_method_details.card_present.brand;
              payment.stripe.cardLast4 =
                charge.payment_method_details.card_present.last4;
            }

            // Calculate actual fees from charge
            if (charge.balance_transaction) {
              try {
                const stripe = getStripe();
                const balanceTransaction =
                  await stripe.balanceTransactions.retrieve(
                    charge.balance_transaction,
                    {
                      stripeAccount: payment.stripe.connectedAccountId,
                    }
                  );

                payment.fees.stripe = Math.abs(balanceTransaction.fee);
                payment.fees.total =
                  payment.fees.stripe + payment.fees.platform;
                payment.netAmount = payment.total - payment.fees.total;
              } catch (feeError) {
                console.error(
                  "[WEBHOOK] Error fetching balance transaction:",
                  feeError
                );
              }
            }
          }

          // Generate receipt number
          if (!payment.receipt.receiptNumber) {
            payment.receipt.receiptNumber = await Payment.generateReceiptNumber(
              payment.tenant._id
            );
          }

          await payment.save();
          console.log("[WEBHOOK] Payment updated successfully:", payment._id);

          // Update appointment status if payment is linked to an appointment
          if (payment.appointment) {
            const appointment = await Appointment.findById(payment.appointment);
            if (appointment) {
              // Check if appointment is now fully paid
              const allPayments = await Payment.find({
                appointment: payment.appointment,
                status: "succeeded",
              });

              const totalPaid = allPayments.reduce(
                (sum, p) => sum + p.total,
                0
              );
              const appointmentTotal = appointment.services.reduce(
                (sum, s) => sum + (s.price || 0),
                0
              );

              if (totalPaid >= appointmentTotal) {
                appointment.payment = appointment.payment || {};
                appointment.payment.status = "succeeded";
              } else {
                appointment.payment = appointment.payment || {};
                appointment.payment.status = "partially_paid";
              }

              // Add payment to appointment audit trail
              appointment.audit = appointment.audit || [];
              appointment.audit.push({
                at: new Date(),
                action: "tap_to_pay_payment_received",
                meta: {
                  paymentId: payment._id,
                  amount: payment.total,
                  method: payment.method,
                  receiptNumber: payment.receipt.receiptNumber,
                },
              });

              await appointment.save();
              console.log(
                "[WEBHOOK] Appointment payment status updated:",
                appointment._id
              );
            }
          }

          // TODO: Send receipt via email/SMS
          console.log(
            "[WEBHOOK] Receipt should be sent to:",
            payment.client.email || payment.client.phone
          );
        } catch (error) {
          console.error("[WEBHOOK] Error handling payment success:", error);
        }
        break;
      }

      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object;
        console.log("[WEBHOOK] Payment intent failed:", paymentIntent.id);

        try {
          const payment = await Payment.findOne({
            "stripe.paymentIntentId": paymentIntent.id,
          });

          if (!payment) {
            console.log(
              "[WEBHOOK] Payment not found for intent:",
              paymentIntent.id
            );
            break;
          }

          payment.status = "failed";
          payment.failedAt = new Date();
          payment.error = {
            code: paymentIntent.last_payment_error?.code,
            message:
              paymentIntent.last_payment_error?.message || "Payment failed",
            occurredAt: new Date(),
          };

          await payment.save();
          console.log("[WEBHOOK] Payment failure recorded:", payment._id);
        } catch (error) {
          console.error("[WEBHOOK] Error handling payment failure:", error);
        }
        break;
      }

      case "payment_intent.canceled": {
        const paymentIntent = event.data.object;
        console.log("[WEBHOOK] Payment intent canceled:", paymentIntent.id);

        try {
          const payment = await Payment.findOne({
            "stripe.paymentIntentId": paymentIntent.id,
          });

          if (!payment) {
            console.log(
              "[WEBHOOK] Payment not found for intent:",
              paymentIntent.id
            );
            break;
          }

          payment.status = "canceled";
          await payment.save();
          console.log("[WEBHOOK] Payment cancellation recorded:", payment._id);
        } catch (error) {
          console.error(
            "[WEBHOOK] Error handling payment cancellation:",
            error
          );
        }
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object;
        console.log("[WEBHOOK] Charge refunded:", charge.id);

        try {
          const payment = await Payment.findOne({
            "stripe.chargeId": charge.id,
          });

          if (!payment) {
            console.log("[WEBHOOK] Payment not found for charge:", charge.id);
            break;
          }

          // Update refund status based on total refunded
          const totalRefunded = charge.amount_refunded;

          if (totalRefunded >= payment.total) {
            payment.status = "refunded";
          } else if (totalRefunded > 0) {
            payment.status = "partially_refunded";
          }

          payment.refundedAt = new Date();
          await payment.save();
          console.log("[WEBHOOK] Refund recorded:", payment._id);
        } catch (error) {
          console.error("[WEBHOOK] Error handling refund:", error);
        }
        break;
      }

      default:
        console.log("[WEBHOOK] Unhandled event type:", event.type);
        break;
    }
  } catch (e) {
    // Don't fail the webhook retry cycle for downstream errors
    console.error("Webhook handling error", e);
  }

  res.json({ received: true });
});

export default r;
