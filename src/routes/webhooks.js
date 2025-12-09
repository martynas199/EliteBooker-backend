import { Router } from "express";
import Stripe from "stripe";
import Appointment from "../models/Appointment.js";
import Specialist from "../models/Specialist.js";
import Order from "../models/Order.js";
import {
  sendConfirmationEmail,
  sendOrderConfirmationEmail,
  sendAdminOrderNotification,
  sendBeauticianProductOrderNotification,
} from "../emails/mailer.js";

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
            const appointment = await Appointment.findByIdAndUpdate(
              apptId,
              {
                $set: {
                  status: "confirmed",
                  "payment.status": "succeeded",
                  "payment.provider": "stripe",
                  "payment.mode": "pay_now",
                  "payment.sessionId": session.id,
                  ...(session.amount_total != null
                    ? { "payment.amountTotal": Number(session.amount_total) }
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
              .populate("specialistId");

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
            }
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
          // Find specialist by subscription ID first
          let specialist = await Specialist.findOne({
            "subscription.noFeeBookings.stripeSubscriptionId": subscription.id,
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

          // Update subscription status
          specialist.subscription.noFeeBookings.status = subscription.status;
          specialist.subscription.noFeeBookings.enabled =
            subscription.status === "active" ||
            subscription.status === "trialing";
          specialist.subscription.noFeeBookings.stripeSubscriptionId =
            subscription.id;
          specialist.subscription.noFeeBookings.stripePriceId =
            subscription.items.data[0].price.id;
          specialist.subscription.noFeeBookings.currentPeriodStart = new Date(
            subscription.current_period_start * 1000
          );
          specialist.subscription.noFeeBookings.currentPeriodEnd = new Date(
            subscription.current_period_end * 1000
          );

          // If subscription is being canceled at period end
          if (subscription.cancel_at_period_end) {
            specialist.subscription.noFeeBookings.enabled = false;
          }

          await specialist.save();
          console.log(
            "[WEBHOOK] Subscription updated for specialist:",
            specialist._id,
            "status:",
            subscription.status,
            "enabled:",
            specialist.subscription.noFeeBookings.enabled
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
          // Find specialist by subscription ID first
          let specialist = await Specialist.findOne({
            "subscription.noFeeBookings.stripeSubscriptionId": subscription.id,
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

          // Disable feature
          specialist.subscription.noFeeBookings.enabled = false;
          specialist.subscription.noFeeBookings.status = "canceled";

          await specialist.save();
          console.log(
            "[WEBHOOK] Subscription ended for specialist:",
            specialist._id
          );
        } catch (err) {
          console.error("[WEBHOOK] subscription deletion error:", err);
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
