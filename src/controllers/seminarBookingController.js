import Seminar from "../models/Seminar.js";
import SeminarBooking from "../models/SeminarBooking.js";
import Tenant from "../models/Tenant.js";
import Stripe from "stripe";
import { sendSeminarConfirmationEmail } from "../emails/mailer.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

/**
 * Get all bookings for a seminar
 * @route GET /api/seminars/:id/bookings
 */
export const getSeminarBookings = async (req, res) => {
  try {
    const seminarId = req.params.id;

    const bookings = await SeminarBooking.find({ seminarId })
      .populate("clientId", "name email phone")
      .sort("-createdAt")
      .lean();

    res.status(200).json({ bookings });
  } catch (error) {
    console.error("Error in getSeminarBookings:", error);
    res.status(500).json({ error: "Failed to fetch bookings" });
  }
};

/**
 * Get attendees for a specific session
 * @route GET /api/seminars/:id/sessions/:sessionId/attendees
 */
export const getSessionAttendees = async (req, res) => {
  try {
    const { id: seminarId, sessionId } = req.params;

    const bookings = await SeminarBooking.find({
      seminarId,
      sessionId,
      status: { $in: ["confirmed", "attended"] },
    })
      .populate("clientId", "name email phone")
      .sort("attendeeInfo.name")
      .lean();

    res.status(200).json({ attendees: bookings });
  } catch (error) {
    console.error("Error in getSessionAttendees:", error);
    res.status(500).json({ error: "Failed to fetch attendees" });
  }
};

/**
 * Create Stripe checkout session for seminar booking
 * @route POST /api/seminars/checkout/create-session
 */
export const createCheckoutSession = async (req, res) => {
  try {
    const { seminarId, sessionId, attendeeInfo } = req.body;

    // Validation
    if (!seminarId || !sessionId || !attendeeInfo) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (!attendeeInfo.name || !attendeeInfo.email) {
      return res.status(400).json({
        error: "Attendee name and email required",
      });
    }

    // Find seminar
    const seminar = await Seminar.findById(seminarId);
    if (!seminar) {
      return res.status(404).json({ error: "Seminar not found" });
    }

    // Check if seminar is published
    if (seminar.status !== "published") {
      return res.status(400).json({ error: "Seminar not available" });
    }

    // Find session by sessionId field
    const session = seminar.sessions.find(
      (s) => s.sessionId === sessionId || s._id.toString() === sessionId
    );
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    // Check if session is bookable
    if (!seminar.isSessionBookable(session._id)) {
      return res.status(400).json({
        error: "Session is not available for booking",
      });
    }

    // Get active price
    const price = seminar.getActivePrice();
    const bookingFee = 0.99;

    // Create Stripe checkout session
    const stripeSession = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: seminar.pricing.currency.toLowerCase(),
            unit_amount: Math.round(price * 100), // Convert to cents
            product_data: {
              name: seminar.title,
              description: `${new Date(session.date).toLocaleDateString()} at ${
                session.startTime
              }`,
              images: seminar.images?.main?.url
                ? [seminar.images.main.url]
                : [],
            },
          },
          quantity: 1,
        },
        {
          price_data: {
            currency: seminar.pricing.currency.toLowerCase(),
            unit_amount: Math.round(bookingFee * 100), // Convert to cents
            product_data: {
              name: "Booking Fee",
              description: "Service charge for processing your booking",
            },
          },
          quantity: 1,
        },
      ],
      customer_email: attendeeInfo.email,
      metadata: {
        type: "seminar",
        seminarId: seminarId.toString(),
        sessionId: session._id.toString(),
        attendeeName: attendeeInfo.name,
        attendeeEmail: attendeeInfo.email,
        attendeePhone: attendeeInfo.phone || "",
        specialRequests: attendeeInfo.specialRequests || "",
        specialistId: seminar.specialistId.toString(),
        tenantId: seminar.tenantId.toString(),
      },
      success_url: `${FRONTEND_URL}/seminars/booking-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/seminars/${seminar.slug}`,
    });

    res.status(200).json({
      sessionId: stripeSession.id,
      url: stripeSession.url,
    });
  } catch (error) {
    console.error("Error in createCheckoutSession:", error);
    res.status(500).json({ error: "Failed to create checkout session" });
  }
};

/**
 * Confirm payment and create booking (called by Stripe webhook)
 * @route POST /api/seminars/checkout/confirm-payment
 */
export const confirmPayment = async (req, res) => {
  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle checkout.session.completed event
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    try {
      // Extract metadata
      const {
        seminarId,
        sessionId,
        attendeeName,
        attendeeEmail,
        attendeePhone,
        specialRequests,
        specialistId,
        tenantId,
      } = session.metadata;

      // Find seminar and session
      const seminar = await Seminar.findById(seminarId);
      if (!seminar) {
        console.error("Seminar not found:", seminarId);
        return res.status(404).json({ error: "Seminar not found" });
      }

      const seminarSession = seminar.sessions.id(sessionId);
      if (!seminarSession) {
        console.error("Session not found:", sessionId);
        return res.status(404).json({ error: "Session not found" });
      }

      // Check if session still has space
      if (seminarSession.currentAttendees >= seminarSession.maxAttendees) {
        console.error("Session is full:", sessionId);
        // TODO: Handle refund
        return res.status(400).json({ error: "Session is full" });
      }

      // Create booking
      const booking = await SeminarBooking.create({
        seminarId,
        sessionId,
        clientId: session.customer || null, // If customer is logged in
        specialistId,
        tenantId,
        attendeeInfo: {
          name: attendeeName,
          email: attendeeEmail,
          phone: attendeePhone,
          specialRequests,
        },
        payment: {
          stripeSessionId: session.id,
          stripePaymentIntentId: session.payment_intent,
          amount: session.amount_total / 100, // Convert from cents
          currency: session.currency.toUpperCase(),
          status: "paid",
          paidAt: new Date(),
        },
        status: "confirmed",
      });

      // Increment session attendees
      seminarSession.currentAttendees += 1;
      seminar.updateSessionStatus(sessionId);
      await seminar.save();

      // Send confirmation email to attendee
      try {
        const tenant = await Tenant.findById(tenantId);
        await sendSeminarConfirmationEmail({
          booking,
          seminar,
          session: seminarSession,
          tenant,
        });
      } catch (emailError) {
        console.error("Failed to send confirmation email:", emailError);
        // Don't fail the booking if email fails
      }

      console.log("Booking created:", booking.bookingReference);

      res.status(200).json({ received: true, bookingId: booking._id });
    } catch (error) {
      console.error("Error processing payment confirmation:", error);
      res.status(500).json({ error: "Failed to process payment" });
    }
  } else {
    res.status(200).json({ received: true });
  }
};

/**
 * Get client's seminar bookings
 * @route GET /api/seminars/bookings/my-bookings
 */
export const getMyBookings = async (req, res) => {
  try {
    const clientId = req.user._id;

    const bookings = await SeminarBooking.find({ clientId })
      .populate({
        path: "seminarId",
        select: "title slug images location",
        populate: {
          path: "specialistId",
          select: "name email",
        },
      })
      .sort("-createdAt")
      .lean();

    // Enrich with session details
    const enrichedBookings = bookings.map((booking) => {
      const seminar = booking.seminarId;
      const session = seminar?.sessions?.find(
        (s) => s.sessionId === booking.sessionId
      );

      return {
        ...booking,
        session,
      };
    });

    res.status(200).json({ bookings: enrichedBookings });
  } catch (error) {
    console.error("Error in getMyBookings:", error);
    res.status(500).json({ error: "Failed to fetch bookings" });
  }
};

/**
 * Get specific booking by ID
 * @route GET /api/seminars/bookings/:id
 */
export const getBookingById = async (req, res) => {
  try {
    const booking = await SeminarBooking.findById(req.params.id)
      .populate({
        path: "seminarId",
        select: "title slug description images location requirements",
        populate: {
          path: "specialistId",
          select: "name email phone",
        },
      })
      .lean();

    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    // Check permission
    if (
      req.user.role !== "admin" &&
      booking.clientId?.toString() !== req.user._id.toString() &&
      booking.specialistId.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Find session details
    const seminar = booking.seminarId;
    const session = seminar?.sessions?.find(
      (s) => s.sessionId === booking.sessionId
    );

    res.status(200).json({
      ...booking,
      session,
    });
  } catch (error) {
    console.error("Error in getBookingById:", error);
    res.status(500).json({ error: "Failed to fetch booking" });
  }
};

/**
 * Cancel booking
 * @route PATCH /api/seminars/bookings/:id/cancel
 */
export const cancelBooking = async (req, res) => {
  try {
    const { reason } = req.body;

    const booking = await SeminarBooking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    // Check permission
    if (
      req.user.role !== "admin" &&
      booking.clientId?.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Check if booking is cancellable
    if (!booking.isCancellable) {
      return res.status(400).json({
        error: "Booking cannot be cancelled",
      });
    }

    // Get seminar and session
    const seminar = await Seminar.findById(booking.seminarId);
    const session = seminar.sessions.id(booking.sessionId);

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    // Calculate refund amount
    const refundAmount = booking.calculateRefund(session.date);

    // Process refund if applicable
    if (refundAmount > 0 && booking.payment.stripePaymentIntentId) {
      try {
        await stripe.refunds.create({
          payment_intent: booking.payment.stripePaymentIntentId,
          amount: Math.round(refundAmount * 100), // Convert to cents
        });

        booking.payment.refundAmount = refundAmount;
        booking.payment.refundedAt = new Date();
        booking.payment.status = "refunded";
      } catch (error) {
        console.error("Stripe refund error:", error);
        return res.status(500).json({ error: "Failed to process refund" });
      }
    }

    // Update booking
    booking.status = "cancelled";
    booking.cancellationReason = reason;
    booking.cancelledAt = new Date();
    await booking.save();

    // Decrement session attendees
    if (session.currentAttendees > 0) {
      session.currentAttendees -= 1;
      seminar.updateSessionStatus(booking.sessionId);
      await seminar.save();
    }

    // TODO: Send cancellation email

    res.status(200).json({
      message: "Booking cancelled successfully",
      refundAmount,
      booking,
    });
  } catch (error) {
    console.error("Error in cancelBooking:", error);
    res.status(500).json({ error: "Failed to cancel booking" });
  }
};
