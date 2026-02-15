import {
  getDefaultFromEmail,
  getEmailTransport,
  sendEmail,
} from "./transport.js";
import { createConsoleLogger } from "../utils/logger.js";

const LOG_EMAIL =
  process.env.LOG_EMAIL === "true" || process.env.LOG_VERBOSE === "true";
const console = createConsoleLogger({ scope: "mailer", verbose: LOG_EMAIL });

/**
 * Format currency based on the currency code
 * @param {number} amount - Amount in main units (e.g., pounds, euros, dollars)
 * @param {string} currency - Currency code (GBP, EUR, USD)
 * @returns {string} Formatted currency string
 */
function formatCurrency(amount, currency = "GBP") {
  const currencyUpper = (currency || "GBP").toUpperCase();

  const symbols = {
    GBP: "£",
    EUR: "€",
    USD: "$",
  };

  const symbol = symbols[currencyUpper] || currencyUpper + " ";
  return `${symbol}${amount.toFixed(2)}`;
}

function getTransport() {
  return getEmailTransport({ loggerPrefix: "[MAILER]" });
}

/**
 * Send cancellation emails to customer and specialist. No-op if SMTP not configured.
 */
export async function sendCancellationEmails({
  appointment,
  policySnapshot,
  refundAmount,
  outcomeStatus,
  reason,
}) {
  const tx = getTransport();
  if (!tx) {
    return;
  }
  const from = getDefaultFromEmail();
  const salonTz = process.env.SALON_TZ || "Europe/London";

  const startDate = new Date(appointment.start).toLocaleString("en-GB", {
    timeZone: salonTz,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const serviceName =
    appointment.serviceId?.name || appointment.variantName || "Service";
  const currency = policySnapshot?.currency || "GBP";
  const hasRefund = refundAmount && refundAmount > 0;
  const refundAmountFormatted = hasRefund
    ? formatCurrency(refundAmount, currency)
    : null;

  const cust = appointment.client?.email;
  if (cust) {
    // Build email content conditionally
    let textContent = `Hi ${appointment.client?.name || ""},\n\n`;
    textContent += `Your appointment has been cancelled.\n\n`;
    textContent += `Appointment Details:\n`;
    textContent += `- Service: ${serviceName}\n`;
    textContent += `- Date & Time: ${startDate}\n`;

    if (reason && reason.trim()) {
      textContent += `- Reason: ${reason}\n`;
    }

    textContent += `\n`;

    if (hasRefund) {
      textContent += `A refund of ${refundAmountFormatted} has been processed to your original payment method.\n`;
      textContent += `Please allow 5-10 business days for the refund to appear in your account, depending on your bank.\n\n`;
    } else {
      textContent += `No refund is applicable for this cancellation.\n\n`;
    }

    textContent += `If you have any questions, please don't hesitate to contact us.\n\n`;
    textContent += `We hope to see you again soon!\n\n`;
    textContent += `Best regards,\nElite Booker`;

    // HTML version
    let htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #7c3aed 0%, #ec4899 50%, #06b6d4 100%); padding: 30px 20px; border-radius: 12px 12px 0 0; margin: -20px -20px 20px -20px;">
          <h2 style="color: white; margin: 0; font-size: 24px; text-align: center;">Appointment Cancelled</h2>
        </div>
        <p>Hi ${appointment.client?.name || ""},</p>
        <p>Your appointment has been cancelled.</p>
        
        <div style="background: linear-gradient(135deg, rgba(124, 58, 237, 0.05) 0%, rgba(236, 72, 153, 0.05) 100%); padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #7c3aed;">
          <h3 style="margin-top: 0; background: linear-gradient(135deg, #7c3aed 0%, #ec4899 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Appointment Details</h3>
          <p style="margin: 8px 0;"><strong>Service:</strong> ${serviceName}</p>
          <p style="margin: 8px 0;"><strong>Date & Time:</strong> ${startDate}</p>
          ${
            reason && reason.trim()
              ? `<p style="margin: 8px 0;"><strong>Reason:</strong> ${reason}</p>`
              : ""
          }
        </div>
        
        ${
          hasRefund
            ? `
        <div style="background-color: #ecfdf5; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
          <p style="margin: 0; color: #065f46;"><strong>💰 Refund Information</strong></p>
          <p style="margin: 10px 0 0 0; color: #047857;">A refund of <strong>${refundAmountFormatted}</strong> has been processed to your original payment method.</p>
          <p style="margin: 10px 0 0 0; font-size: 13px; color: #059669;">Please allow 5-10 business days for the refund to appear in your account, depending on your bank.</p>
        </div>
        `
            : `
        <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
          <p style="margin: 0; color: #92400e;">No refund is applicable for this cancellation.</p>
        </div>
        `
        }
        
        <p style="margin-top: 30px;">If you have any questions, please don't hesitate to contact us.</p>
        <p>We hope to see you again soon!</p>
        
        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid rgba(124, 58, 237, 0.2);">
          <p style="margin: 0; color: #6b7280; font-size: 14px;">Best regards,</p>
          <p style="margin: 5px 0 0 0; background: linear-gradient(135deg, #7c3aed 0%, #ec4899 50%, #06b6d4 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; font-weight: bold; font-size: 18px;">Elite Booker</p>
          <p style="margin: 20px 0 0 0; color: #9ca3af; font-size: 11px;">Appointment ID: ${String(
            appointment._id
          )}</p>
        </div>
      </div>
    `;

    try {
      const info = await tx.sendMail({
        from,
        to: cust,
        subject: `Appointment Cancelled - ${serviceName}`,
        text: textContent,
        html: htmlContent,
      });
    } catch (error) {
      console.error("[MAILER] ✗ Failed to send cancellation email:", error);
      throw error;
    }
  }

  // Optional: Send notification to specialist/salon staff
  const beauticianEmail = process.env.BEAUTICIAN_NOTIFY_EMAIL;
  if (beauticianEmail) {
    const beauticianName = appointment.specialistId?.name || "Staff";

    try {
      await tx.sendMail({
        from,
        to: beauticianEmail,
        subject: `Appointment Cancelled - ${serviceName}`,
        text: `A slot has been freed up.\n\nAppointment Details:\n- Service: ${serviceName}\n- Date & Time: ${startDate}\n- Specialist: ${beauticianName}\n- Client: ${
          appointment.client?.name || "Unknown"
        }\n- Client Email: ${
          appointment.client?.email || "N/A"
        }\n- Client Phone: ${appointment.client?.phone || "N/A"}\n${
          reason && reason.trim() ? `- Cancellation Reason: ${reason}\n` : ""
        }${
          hasRefund ? `- Refund: ${refundAmountFormatted}` : "- Refund: None"
        }\n\nAppointment ID: ${String(appointment._id)}`,
        html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #7c3aed 0%, #ec4899 50%, #06b6d4 100%); padding: 30px 20px; border-radius: 12px 12px 0 0; margin: -20px -20px 20px -20px;">
            <h2 style="color: white; margin: 0; font-size: 24px; text-align: center;">📅 Appointment Cancelled - Slot Freed</h2>
          </div>
          
          <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #1f2937;">Appointment Details</h3>
            <p style="margin: 8px 0;"><strong>Service:</strong> ${serviceName}</p>
            <p style="margin: 8px 0;"><strong>Date & Time:</strong> ${startDate}</p>
            <p style="margin: 8px 0;"><strong>Specialist:</strong> ${beauticianName}</p>
            ${
              reason && reason.trim()
                ? `<p style="margin: 8px 0;"><strong>Reason:</strong> ${reason}</p>`
                : ""
            }
            ${
              hasRefund
                ? `<p style="margin: 8px 0;"><strong>Refund:</strong> ${refundAmountFormatted}</p>`
                : '<p style="margin: 8px 0;"><strong>Refund:</strong> None</p>'
            }
          </div>
          
          <div style="background-color: #eff6ff; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6;">
            <h4 style="margin-top: 0; color: #1e40af;">Client Information</h4>
            <p style="margin: 5px 0;"><strong>Name:</strong> ${
              appointment.client?.name || "Unknown"
            }</p>
            <p style="margin: 5px 0;"><strong>Email:</strong> ${
              appointment.client?.email || "N/A"
            }</p>
            <p style="margin: 5px 0;"><strong>Phone:</strong> ${
              appointment.client?.phone || "N/A"
            }</p>
          </div>
          
          <p style="color: #9ca3af; font-size: 11px; margin-top: 30px;">Appointment ID: ${String(
            appointment._id
          )}</p>
        </div>
      `,
      });
    } catch (error) {
      console.error(
        "[MAILER] ✗ Failed to send beautician notification:",
        error
      );
      // Don't throw - beautician notification failure shouldn't break the flow
    }
  }
}

/**
 * Send appointment confirmation email to customer
 */
export async function sendConfirmationEmail({
  appointment,
  service,
  specialist,
}) {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  console.log(
    "[MAILER] sendConfirmationEmail called for appointment:",
    appointment?._id
  );
  const tx = getTransport();
  if (!tx) {
    console.warn("[MAILER] No transport - skipping confirmation email");
    return;
  }

  const from = getDefaultFromEmail();
  console.log("[MAILER] Sending from:", from);

  const salonTz = process.env.SALON_TZ || "Europe/London";
  const startTime = new Date(appointment.start).toLocaleString("en-GB", {
    timeZone: salonTz,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const customerEmail = appointment.client?.email;
  console.log("[MAILER] Customer email:", customerEmail || "NOT SET");
  if (!customerEmail) {
    console.warn("[MAILER] No customer email - skipping confirmation email");
    return;
  }

  // Define currency first (needed for formatting)
  const currency = appointment.currency || "GBP";
  const beauticianName = specialist?.name || "Our team";

  // Handle multiple services
  const hasMultipleServices =
    appointment.services && appointment.services.length > 1;
  const serviceName = hasMultipleServices
    ? `${appointment.services.length} Services`
    : service?.name || appointment.variantName || "Service";

  // Create service list for email
  let servicesList = "";
  let servicesHtml = "";

  if (hasMultipleServices) {
    servicesList = appointment.services
      .map((s, i) => {
        const serviceName = s.serviceName || "Service";
        const variantName = s.variantName || "";
        const displayName =
          variantName && serviceName !== variantName
            ? `${serviceName} (${variantName})`
            : serviceName;
        return `${i + 1}. ${displayName} (${s.duration}min - ${formatCurrency(
          s.price,
          currency
        )})`;
      })
      .join("\n");

    servicesHtml = `
      <div style="margin: 12px 0;">
        <strong style="color: #374151;">Services:</strong>
        <ul style="margin: 8px 0; padding-left: 20px; color: #374151;">
          ${appointment.services
            .map((s) => {
              const serviceName = s.serviceName || "Service";
              const variantName = s.variantName || "";
              const displayName =
                variantName && serviceName !== variantName
                  ? `${serviceName} (${variantName})`
                  : serviceName;
              return `<li>${displayName} <span style="color: #6b7280;">(${
                s.duration
              }min - ${formatCurrency(s.price, currency)})</span></li>`;
            })
            .join("")}
        </ul>
      </div>
    `;
  } else {
    servicesList = serviceName;
    servicesHtml = `<p style="margin: 8px 0; color: #374151;"><strong>Service:</strong> ${serviceName}</p>`;
  }
  const price = appointment.price
    ? formatCurrency(appointment.price, currency)
    : "";

  // Determine payment status and deposit info
  let paymentStatus = "Unknown";
  let isDepositPayment = false;
  let depositAmount = 0;
  let depositPercentage = 0;
  let bookingFee = 0;
  let remainingBalance = 0;

  // Check if specialist has in-salon payment enabled
  if (specialist?.inSalonPayment) {
    paymentStatus = `Pay in salon (${price} due at appointment)`;
  } else if (appointment.payment?.mode === "pay_in_salon") {
    paymentStatus = "Pay at salon";
  } else if (appointment.payment?.mode === "pay_now") {
    paymentStatus =
      appointment.payment?.status === "succeeded"
        ? "Paid online (Full payment)"
        : "Payment pending";
  } else if (appointment.payment?.mode === "deposit") {
    isDepositPayment = true;
    // Calculate deposit amount from payment.depositAmount or amountTotal
    const depositAmountCents =
      appointment.payment?.depositAmount ||
      appointment.payment?.amountTotal ||
      0;
    depositAmount = depositAmountCents / 100; // Convert to main currency unit
    depositPercentage = appointment.payment?.depositPercentage || 30; // Get percentage or default to 30%

    const totalPrice = Number(appointment.price || 0);
    remainingBalance = totalPrice - depositAmount;

    paymentStatus =
      appointment.payment?.status === "succeeded" ||
      appointment.payment?.status === "paid"
        ? `Deposit paid (${depositPercentage}%)`
        : `Deposit pending (${depositPercentage}%)`;
  } else if (appointment.status === "reserved_unpaid") {
    paymentStatus = "Pay at salon";
  } else if (appointment.status === "confirmed") {
    paymentStatus = "Confirmed";
  } else {
    paymentStatus = appointment.status;
  }

  console.log("[MAILER] Preparing confirmation email...");
  console.log(
    "[MAILER] Services:",
    hasMultipleServices
      ? `${appointment.services.length} services`
      : serviceName
  );
  console.log("[MAILER] Specialist:", beauticianName);
  console.log("[MAILER] Time:", startTime);
  console.log("[MAILER] Appointment status:", appointment.status);
  console.log(
    "[MAILER] Payment object:",
    JSON.stringify(appointment.payment, null, 2)
  );
  console.log("[MAILER] Payment mode:", appointment.payment?.mode);
  console.log("[MAILER] Determined payment status:", paymentStatus);
  console.log("[MAILER] Sending confirmation email to:", customerEmail);

  // Use Stripe checkout URL from payment object for pending deposit
  const paymentLink =
    isDepositPayment &&
    appointment.payment?.status === "pending" &&
    appointment.payment?.checkoutUrl
      ? appointment.payment.checkoutUrl
      : null;

  try {
    const info = await tx.sendMail({
      from,
      to: customerEmail,
      subject: `Appointment ${
        paymentLink ? "Reserved - Deposit Required" : "Confirmed"
      } - ${serviceName}`,
      text: `Hi ${appointment.client?.name || ""},

${
  paymentLink
    ? "Your appointment has been reserved and requires a deposit payment to be confirmed."
    : "Your appointment has been confirmed!"
}

${
  paymentLink
    ? `\n🔗 PAY DEPOSIT NOW:\n${paymentLink}\n\nPlease complete your deposit payment to confirm your booking.\n`
    : ""
}
${
  hasMultipleServices
    ? "Services:\n" + servicesList
    : "Service: " + servicesList
}
With: ${beauticianName}
Date & Time: ${startTime}
Total Price: ${price}
${
  isDepositPayment
    ? `Deposit: ${formatCurrency(
        depositAmount,
        currency
      )}\nBooking Fee: ${formatCurrency(
        bookingFee,
        currency
      )}\nTotal Paid: ${formatCurrency(depositAmount + bookingFee, currency)}`
    : `Payment: ${paymentStatus}`
}${
        isDepositPayment && remainingBalance > 0
          ? `\nRemaining Balance: ${formatCurrency(
              remainingBalance,
              currency
            )} (to be paid at salon)`
          : ""
      }

${
  appointment.client?.notes ? `Your notes: ${appointment.client.notes}\n\n` : ""
}We look forward to seeing you!

If you need to cancel or reschedule, please contact us as soon as possible.

Appointment ID: ${appointment._id}

Thank you for choosing us!`,
      html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
        <div style="background-color: #7c3aed; background: linear-gradient(135deg, #7c3aed 0%, #ec4899 50%, #06b6d4 100%); padding: 30px 20px; border-radius: 12px 12px 0 0; margin: -20px -20px 20px -20px;">
          <h2 style="color: #ffffff !important; margin: 0; font-size: 24px; text-align: center; line-height: 1.4;">${
            paymentLink
              ? "⏰ Appointment Reserved - Deposit Required"
              : "✓ Appointment Confirmed"
          }</h2>
        </div>
        <p style="color: #1f2937;">Hi ${appointment.client?.name || ""},</p>
        <p style="color: #1f2937;">${
          paymentLink
            ? "Your appointment has been reserved and requires a deposit payment to be confirmed."
            : "Your appointment has been confirmed!"
        }</p>
        
        ${
          paymentLink
            ? `
        <div style="background: linear-gradient(135deg, #7c3aed 0%, #ec4899 100%); padding: 20px; border-radius: 12px; margin: 20px 0; text-align: center;">
          <p style="margin: 0 0 12px 0; color: white; font-size: 16px; font-weight: 600;">⏰ Deposit Payment Required</p>
          <p style="margin: 0 0 16px 0; color: rgba(255,255,255,0.9); font-size: 14px;">Please complete your ${depositPercentage}% deposit payment to confirm your booking.</p>
          <a href="${paymentLink}" style="display: inline-block; background-color: white; color: #7c3aed; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">💳 Pay Deposit Now</a>
          <p style="margin: 16px 0 0 0; color: rgba(255,255,255,0.8); font-size: 12px;">Deposit Amount (${depositPercentage}%): ${formatCurrency(
                depositAmount,
                currency
              )}</p>
        </div>
        `
            : ""
        }
        
        <div style="background: linear-gradient(135deg, rgba(124, 58, 237, 0.05) 0%, rgba(236, 72, 153, 0.05) 100%); padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #7c3aed;">
          <h3 style="margin-top: 0; margin-bottom: 16px; color: #7c3aed; font-size: 18px;">Booking Details</h3>
          ${servicesHtml}
          <p style="margin: 8px 0; color: #374151;"><strong>With:</strong> ${beauticianName}</p>
          <p style="margin: 8px 0; color: #374151;"><strong>Date & Time:</strong> ${startTime}</p>
          <p style="margin: 8px 0; color: #374151;"><strong>Total Price:</strong> ${price}</p>
          ${
            isDepositPayment && !paymentLink
              ? `
          <div style="background-color: #ecfdf5; padding: 12px; border-radius: 6px; margin-top: 12px; border-left: 3px solid #10b981;">
            <p style="margin: 0 0 8px 0; color: #065f46; font-weight: 600; font-size: 14px;">💳 Payment Details</p>
            <p style="margin: 4px 0; color: #047857; font-size: 14px;">Deposit: <strong>${formatCurrency(
              depositAmount,
              currency
            )}</strong></p>
            ${
              bookingFee > 0
                ? `<p style="margin: 4px 0; color: #047857; font-size: 14px;">Booking Fee: <strong>${formatCurrency(
                    bookingFee,
                    currency
                  )}</strong></p>`
                : ""
            }
            <p style="margin: 8px 0 0 0; padding-top: 8px; border-top: 1px solid #d1fae5; color: #065f46; font-size: 15px; font-weight: 700;">Total Paid: ${formatCurrency(
              depositAmount + bookingFee,
              currency
            )}</p>
          </div>
          `
              : `<p style="margin: 8px 0; color: #374151;"><strong>Payment:</strong> ${paymentStatus}</p>`
          }
          ${
            isDepositPayment && remainingBalance > 0
              ? `
          <div style="background-color: #fef3c7; padding: 12px; border-radius: 6px; margin-top: 12px; border-left: 3px solid #f59e0b;">
            <p style="margin: 0; color: #92400e; font-weight: 600; font-size: 14px;">💰 Remaining Balance</p>
            <p style="margin: 8px 0 0 0; color: #b45309; font-size: 15px; font-weight: 700;">${formatCurrency(
              remainingBalance,
              currency
            )}</p>
            <p style="margin: 5px 0 0 0; color: #b45309; font-size: 13px;">To be paid at the salon</p>
          </div>
          `
              : ""
          }
        </div>
        
        ${
          appointment.client?.notes
            ? `<p style="color: #6b7280;"><em>Your notes: ${appointment.client.notes}</em></p>`
            : ""
        }
        
        <p style="color: #1f2937;">We look forward to seeing you!</p>
        <p style="color: #6b7280; font-size: 12px;">If you need to cancel or reschedule, please contact us as soon as possible.</p>
        <p style="color: #9ca3af; font-size: 11px; margin-top: 30px;">Appointment ID: ${
          appointment._id
        }</p>
      </div>
    `,
    });
    console.log(
      "[MAILER] ✓ Confirmation email sent successfully. MessageId:",
      info.messageId
    );
  } catch (error) {
    console.error("[MAILER] ✗ Failed to send confirmation email:", error);
    throw error;
  }

  // Send notification to specialist
  const beauticianEmail = specialist?.email;
  console.log("[MAILER] Specialist email:", beauticianEmail || "NOT SET");
  if (beauticianEmail) {
    console.log("[MAILER] Preparing specialist notification email...");

    const beauticianTextContent = `Hi ${beauticianName},

You have a new booking!

Service: ${serviceName}
Client: ${appointment.client?.name || "Unknown"}
Date & Time: ${startTime}
Price: ${price}
${
  isDepositPayment
    ? `Deposit: ${formatCurrency(
        depositAmount,
        currency
      )}\nBooking Fee: ${formatCurrency(
        bookingFee,
        currency
      )}\nTotal Paid: ${formatCurrency(
        depositAmount + bookingFee,
        currency
      )}\nRemaining Balance: ${formatCurrency(
        remainingBalance,
        currency
      )} (to be collected at salon)`
    : `Payment: ${paymentStatus}`
}

Client Contact:
Email: ${appointment.client?.email || "N/A"}
Phone: ${appointment.client?.phone || "N/A"}

${
  appointment.client?.notes
    ? `Client Notes: ${appointment.client.notes}\n\n`
    : ""
}Appointment ID: ${appointment._id}

Please ensure you're prepared for this appointment.`;

    const beauticianHtmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #7c3aed 0%, #ec4899 50%, #06b6d4 100%); padding: 30px 20px; border-radius: 12px 12px 0 0; margin: -20px -20px 20px -20px;">
          <h2 style="color: white; margin: 0; font-size: 24px; text-align: center;">📅 New Booking Received</h2>
        </div>
        <p>Hi ${beauticianName},</p>
        <p style="font-size: 16px; color: #374151; font-weight: 600;">You have a new booking!</p>
        
        <div style="background: linear-gradient(135deg, rgba(124, 58, 237, 0.05) 0%, rgba(236, 72, 153, 0.05) 100%); padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #7c3aed;">
          <h3 style="margin-top: 0; background: linear-gradient(135deg, #7c3aed 0%, #ec4899 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Appointment Details</h3>
          <p style="margin: 8px 0;"><strong>Service:</strong> ${serviceName}</p>
          <p style="margin: 8px 0;"><strong>Client:</strong> ${
            appointment.client?.name || "Unknown"
          }</p>
          <p style="margin: 8px 0;"><strong>Date & Time:</strong> ${startTime}</p>
          <p style="margin: 8px 0;"><strong>Price:</strong> ${price}</p>
          ${
            isDepositPayment
              ? `
          <div style="background-color: #ecfdf5; padding: 12px; border-radius: 6px; margin-top: 12px; border-left: 3px solid #10b981;">
            <p style="margin: 0 0 8px 0; color: #065f46; font-weight: 600; font-size: 14px;">💳 Payment Details</p>
            <p style="margin: 4px 0; color: #047857; font-size: 14px;">Deposit: <strong>${formatCurrency(
              depositAmount,
              currency
            )}</strong></p>
            <p style="margin: 4px 0; color: #047857; font-size: 14px;">Booking Fee: <strong>${formatCurrency(
              bookingFee,
              currency
            )}</strong></p>
            <p style="margin: 8px 0 0 0; padding-top: 8px; border-top: 1px solid #d1fae5; color: #065f46; font-size: 15px; font-weight: 700;">Total Paid: ${formatCurrency(
              depositAmount + bookingFee,
              currency
            )}</p>
          </div>
          <div style="background-color: #fef3c7; padding: 12px; border-radius: 6px; margin-top: 12px; border-left: 3px solid #f59e0b;">
            <p style="margin: 0; color: #92400e; font-weight: 600; font-size: 14px;">💰 To Collect at Salon</p>
            <p style="margin: 8px 0 0 0; color: #b45309; font-size: 15px; font-weight: 700;">${formatCurrency(
              remainingBalance,
              currency
            )}</p>
          </div>
          `
              : `<p style="margin: 8px 0;"><strong>Payment:</strong> ${paymentStatus}</p>`
          }
        </div>
        
        <div style="background-color: #eff6ff; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6;">
          <h4 style="margin-top: 0; color: #1e40af;">Client Contact</h4>
          <p style="margin: 5px 0;"><strong>Email:</strong> ${
            appointment.client?.email || "N/A"
          }</p>
          <p style="margin: 5px 0;"><strong>Phone:</strong> ${
            appointment.client?.phone || "N/A"
          }</p>
        </div>
        
        ${
          appointment.client?.notes
            ? `
        <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
          <h4 style="margin-top: 0; color: #92400e;">📝 Client Notes</h4>
          <p style="margin: 0; color: #b45309;">${appointment.client.notes}</p>
        </div>
        `
            : ""
        }
        
        <p style="margin-top: 30px; color: #374151;">Please ensure you're prepared for this appointment.</p>
        
        <p style="color: #9ca3af; font-size: 11px; margin-top: 30px;">Appointment ID: ${
          appointment._id
        }</p>
      </div>
    `;

    console.log(
      "[MAILER] Sending specialist notification to:",
      beauticianEmail
    );
    try {
      const info = await tx.sendMail({
        from,
        to: beauticianEmail,
        subject: `New Booking - ${serviceName} on ${startTime}`,
        text: beauticianTextContent,
        html: beauticianHtmlContent,
      });
      console.log(
        "[MAILER] ✓ Specialist notification email sent successfully. MessageId:",
        info.messageId
      );
    } catch (error) {
      console.error(
        "[MAILER] ✗ Failed to send specialist notification email:",
        error
      );
      // Don't throw - specialist notification failure shouldn't block the customer confirmation
    }
  }
}

/**
 * Send appointment reminder email to customer (24 hours before)
 */
export async function sendReminderEmail({ appointment, service, specialist }) {
  console.log("[MAILER] Preparing reminder email...");
  console.log("[MAILER] Appointment ID:", appointment._id);

  const { tx, from } = await ensureMailer();
  if (!tx) throw new Error("Email service not configured");

  const customerEmail = appointment.client?.email;
  if (!customerEmail) {
    console.log("[MAILER] No customer email found for reminder");
    return;
  }

  const beauticianName = specialist?.name || "your specialist";
  const currency = process.env.CURRENCY || "GBP";

  // Format start time
  const startDate = new Date(appointment.start);
  const startTime = startDate.toLocaleString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  // Handle single or multiple services
  const hasMultipleServices =
    appointment.services && appointment.services.length > 1;
  let serviceName = "your service";
  let servicesList = "";
  let servicesHtml = "";

  if (hasMultipleServices) {
    servicesList = appointment.services
      .map((s, i) => {
        const serviceName = s.serviceName || "Service";
        const variantName = s.variantName || "";
        const displayName =
          variantName && serviceName !== variantName
            ? `${serviceName} (${variantName})`
            : serviceName;
        return `${i + 1}. ${displayName} (${s.duration}min - ${formatCurrency(
          s.price,
          currency
        )})`;
      })
      .join("\n");

    servicesHtml = `
      <div style="margin: 12px 0;">
        <strong>Services:</strong>
        <ul style="margin: 8px 0; padding-left: 20px;">
          ${appointment.services
            .map((s) => {
              const serviceName = s.serviceName || "Service";
              const variantName = s.variantName || "";
              const displayName =
                variantName && serviceName !== variantName
                  ? `${serviceName} (${variantName})`
                  : serviceName;
              return `<li>${displayName} <span style="color: #6b7280;">(${
                s.duration
              }min - ${formatCurrency(s.price, currency)})</span></li>`;
            })
            .join("")}
        </ul>
      </div>
    `;

    serviceName = `${appointment.services.length} services`;
  } else if (appointment.services && appointment.services.length === 1) {
    const svc = appointment.services[0];
    const svcName = svc.serviceName || "Service";
    const varName = svc.variantName || "";
    serviceName =
      varName && svcName !== varName ? `${svcName} (${varName})` : svcName;
    servicesList = serviceName;
    servicesHtml = `<p style="margin: 8px 0;"><strong>Service:</strong> ${serviceName}</p>`;
  } else {
    serviceName = service?.name || appointment.serviceName || "your service";
    servicesList = serviceName;
    servicesHtml = `<p style="margin: 8px 0;"><strong>Service:</strong> ${serviceName}</p>`;
  }

  const price = appointment.price
    ? formatCurrency(appointment.price, currency)
    : "";

  try {
    const info = await tx.sendMail({
      from,
      to: customerEmail,
      subject: `Reminder: ${serviceName} tomorrow`,
      text: `Hi ${appointment.client?.name || ""},

This is a friendly reminder about your upcoming appointment tomorrow!

${
  hasMultipleServices
    ? "Services:\n" + servicesList
    : "Service: " + servicesList
}
With: ${beauticianName}
Date & Time: ${startTime}
Total Price: ${price}

${
  appointment.client?.notes ? `Your notes: ${appointment.client.notes}\n\n` : ""
}We look forward to seeing you!

If you need to cancel or reschedule, please contact us as soon as possible.

Appointment ID: ${appointment._id}

Thank you!`,
      html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #f59e0b 0%, #ec4899 50%, #06b6d4 100%); padding: 30px 20px; border-radius: 12px 12px 0 0; margin: -20px -20px 20px -20px;">
          <h2 style="color: white; margin: 0; font-size: 24px; text-align: center;">⏰ Appointment Reminder</h2>
        </div>
        <p>Hi ${appointment.client?.name || ""},</p>
        <p style="font-size: 16px; color: #111827;">This is a friendly reminder about your upcoming appointment <strong>tomorrow</strong>!</p>
        
        <div style="background: linear-gradient(135deg, rgba(245, 158, 11, 0.05) 0%, rgba(236, 72, 153, 0.05) 100%); padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
          <h3 style="margin-top: 0; margin-bottom: 16px; background: linear-gradient(135deg, #f59e0b 0%, #ec4899 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; font-size: 18px;">Appointment Details</h3>
          ${servicesHtml}
          <p style="margin: 8px 0;"><strong>With:</strong> ${beauticianName}</p>
          <p style="margin: 8px 0;"><strong>Date & Time:</strong> ${startTime}</p>
          <p style="margin: 8px 0;"><strong>Total Price:</strong> ${price}</p>
        </div>
        
        ${
          appointment.client?.notes
            ? `<div style="background-color: #fef3c7; padding: 12px; border-radius: 6px; margin: 16px 0; border-left: 3px solid #f59e0b;">
            <p style="margin: 0; color: #92400e;"><strong>📝 Your notes:</strong> ${appointment.client.notes}</p>
          </div>`
            : ""
        }
        
        <p>We look forward to seeing you!</p>
        <p style="color: #6b7280; font-size: 12px;">If you need to cancel or reschedule, please contact us as soon as possible.</p>
        <p style="color: #9ca3af; font-size: 11px; margin-top: 30px;">Appointment ID: ${
          appointment._id
        }</p>
      </div>
    `,
    });
    console.log(
      "[MAILER] ✓ Reminder email sent successfully. MessageId:",
      info.messageId
    );
  } catch (error) {
    console.error("[MAILER] ✗ Failed to send reminder email:", error);
    throw error;
  }
}

/**
 * Send product order confirmation email to customer
 */
export async function sendOrderConfirmationEmail({ order }) {
  console.log(
    "[MAILER] sendOrderConfirmationEmail called for order:",
    order?._id
  );
  const tx = getTransport();
  if (!tx) {
    console.warn("[MAILER] No transport - skipping order confirmation email");
    return;
  }

  const from = getDefaultFromEmail();
  console.log("[MAILER] Sending from:", from);

  const customerEmail = order.shippingAddress?.email;
  console.log("[MAILER] Customer email:", customerEmail || "NOT SET");
  if (!customerEmail) {
    console.warn("[MAILER] No customer email - skipping order confirmation");
    return;
  }

  const customerName = `${order.shippingAddress.firstName} ${order.shippingAddress.lastName}`;
  const currency = order.currency || "GBP";
  const totalPrice = formatCurrency(order.total || 0, currency);
  const shippingCost = formatCurrency(order.shipping || 0, currency);
  const subtotal = formatCurrency(order.subtotal || 0, currency);

  // Build items list
  const itemsText = order.items
    .map(
      (item) =>
        `- ${item.title}${item.size ? ` (${item.size})` : ""} x ${
          item.quantity
        } - ${formatCurrency((item.price || 0) * item.quantity, currency)}`
    )
    .join("\n");

  const itemsHtml = order.items
    .map(
      (item) => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
        <div style="display: flex; align-items: center; gap: 12px;">
          ${
            item.image
              ? `<img src="${item.image}" alt="${item.title}" style="width: 50px; height: 50px; border-radius: 8px; object-fit: cover;" />`
              : ""
          }
          <div>
            <div style="font-weight: 600; color: #1f2937;">${item.title}</div>
            ${
              item.size
                ? `<div style="font-size: 13px; color: #6b7280;">${item.size}</div>`
                : ""
            }
          </div>
        </div>
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center; color: #6b7280;">
        ${item.quantity}
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: 600; color: #1f2937;">
        ${formatCurrency((item.price || 0) * item.quantity, currency)}
      </td>
    </tr>
  `
    )
    .join("");

  const textContent = `Hi ${customerName},

Thank you for your order! We've received your payment and will process your order shortly.

Order Number: ${order.orderNumber}
Order Date: ${new Date(order.createdAt).toLocaleDateString("en-GB")}

ORDER ITEMS:
${itemsText}

Subtotal: ${subtotal}
Shipping: ${shippingCost}
TOTAL: ${totalPrice}

SHIPPING ADDRESS:
${order.shippingAddress.firstName} ${order.shippingAddress.lastName}
${order.shippingAddress.address}
${order.shippingAddress.city}, ${order.shippingAddress.postalCode}
${order.shippingAddress.country}
Phone: ${order.shippingAddress.phone}

You'll receive another email once your order has been shipped with tracking information.

If you have any questions about your order, please don't hesitate to contact us.

Thank you for shopping with us!

Best regards,
Elite Booker

Order ID: ${order._id}`;

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #7c3aed 0%, #ec4899 50%, #06b6d4 100%); padding: 40px 20px; border-radius: 12px 12px 0 0; margin: -20px -20px 30px -20px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 28px;">🎉 Order Confirmed!</h1>
        <p style="color: rgba(255, 255, 255, 0.9); margin: 10px 0 0 0; font-size: 16px;">Thank you for your purchase</p>
      </div>
      
      <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
        <p style="margin: 0 0 10px 0;"><strong>Hi ${customerName},</strong></p>
        <p style="margin: 0; color: #374151;">Your order has been confirmed and we're getting it ready for shipment.</p>
      </div>
      
      <div style="background: linear-gradient(135deg, rgba(124, 58, 237, 0.1) 0%, rgba(236, 72, 153, 0.1) 100%); padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #7c3aed;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
          <span style="color: #1e40af; font-weight: 600;">Order Number:</span>
          <span style="color: #1f2937; font-weight: 700;">${
            order.orderNumber
          }</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #1e40af; font-weight: 600;">Order Date:</span>
          <span style="color: #6b7280;">${new Date(
            order.createdAt
          ).toLocaleDateString("en-GB", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}</span>
        </div>
      </div>
      
      <h3 style="background: linear-gradient(135deg, #7c3aed 0%, #ec4899 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; border-bottom: 2px solid rgba(124, 58, 237, 0.3); padding-bottom: 10px; margin-top: 30px; font-size: 20px;">Order Items</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <thead>
          <tr style="background-color: #f9fafb;">
            <th style="padding: 12px; text-align: left; font-weight: 600; color: #6b7280; font-size: 13px;">ITEM</th>
            <th style="padding: 12px; text-align: center; font-weight: 600; color: #6b7280; font-size: 13px;">QTY</th>
            <th style="padding: 12px; text-align: right; font-weight: 600; color: #6b7280; font-size: 13px;">PRICE</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>
      
      <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
          <span style="color: #6b7280;">Subtotal:</span>
          <span style="color: #1f2937;">${subtotal}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #e5e7eb;">
          <span style="color: #6b7280;">Shipping:</span>
          <span style="color: #1f2937;">${shippingCost}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="font-weight: 700; color: #1f2937; font-size: 18px;">Total:</span>
          <span style="font-weight: 700; color: #9333ea; font-size: 18px;">${totalPrice}</span>
        </div>
      </div>
      
      <h3 style="color: #1f2937; border-bottom: 2px solid #9333ea; padding-bottom: 10px; margin-top: 30px;">Shipping Address</h3>
      <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
        <p style="margin: 0; color: #1f2937; font-weight: 600;">${
          order.shippingAddress.firstName
        } ${order.shippingAddress.lastName}</p>
        <p style="margin: 5px 0 0 0; color: #6b7280;">${
          order.shippingAddress.address
        }</p>
        <p style="margin: 5px 0 0 0; color: #6b7280;">${
          order.shippingAddress.city
        }, ${order.shippingAddress.postalCode}</p>
        <p style="margin: 5px 0 0 0; color: #6b7280;">${
          order.shippingAddress.country
        }</p>
        <p style="margin: 10px 0 0 0; color: #6b7280;">📞 ${
          order.shippingAddress.phone
        }</p>
      </div>
      
      <div style="background-color: #ecfdf5; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
        <p style="margin: 0; color: #065f46; font-weight: 600;">📦 What's Next?</p>
        <p style="margin: 10px 0 0 0; color: #047857; font-size: 14px;">You'll receive another email once your order has been shipped with tracking information.</p>
      </div>
      
      <p style="margin-top: 30px; color: #6b7280; font-size: 14px;">If you have any questions about your order, please don't hesitate to contact us.</p>
      
      <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center;">
        <p style="margin: 0; color: #6b7280; font-size: 14px;">Thank you for shopping with us!</p>
        <p style="margin: 5px 0 0 0; color: #9333ea; font-weight: bold;">Elite Booker</p>
        <p style="margin: 20px 0 0 0; color: #9ca3af; font-size: 11px;">Order ID: ${String(
          order._id
        )}</p>
      </div>
    </div>
  `;

  console.log("[MAILER] Sending order confirmation to:", customerEmail);
  console.log("[MAILER] Order number:", order.orderNumber);
  console.log("[MAILER] Total items:", order.items.length);

  try {
    const info = await tx.sendMail({
      from,
      to: customerEmail,
      subject: `Order Confirmed #${order.orderNumber}`,
      text: textContent,
      html: htmlContent,
    });
    console.log(
      "[MAILER] ✓ Order confirmation email sent successfully. MessageId:",
      info.messageId
    );
  } catch (error) {
    console.error("[MAILER] ✗ Failed to send order confirmation email:", error);
    throw error;
  }
}

/**
 * Send specialist notification for product orders containing their products
 */
export async function sendBeauticianProductOrderNotification({
  order,
  specialist,
  beauticianItems,
}) {
  console.log(
    "[MAILER] sendBeauticianProductOrderNotification called for order:",
    order?._id,
    "specialist:",
    specialist?.name
  );
  const tx = getTransport();
  if (!tx) {
    console.warn(
      "[MAILER] No transport - skipping specialist product notification"
    );
    return;
  }

  const beauticianEmail = specialist?.email;
  console.log("[MAILER] Specialist email:", beauticianEmail || "NOT SET");
  if (!beauticianEmail) {
    console.warn(
      "[MAILER] No specialist email - skipping specialist product notification"
    );
    return;
  }

  const from = getDefaultFromEmail();
  const customerName = `${order.shippingAddress.firstName} ${order.shippingAddress.lastName}`;
  const currency = order.currency || "GBP";

  // Calculate totals for specialist's items only
  const beauticianTotal = beauticianItems.reduce(
    (sum, item) => sum + (item.price || 0) * item.quantity,
    0
  );
  const beauticianTotalFormatted = formatCurrency(beauticianTotal, currency);

  const itemsList = beauticianItems
    .map(
      (item) =>
        `- ${item.title}${item.size ? ` (${item.size})` : ""} x ${
          item.quantity
        } - ${formatCurrency((item.price || 0) * item.quantity, currency)}`
    )
    .join("\n");

  const itemsHtml = beauticianItems
    .map(
      (item) => `
    <li style="margin: 8px 0; color: #374151; padding: 12px; background-color: #f9fafb; border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">
      <span>
        <strong>${item.title}</strong>${item.size ? ` (${item.size})` : ""} x ${
        item.quantity
      }
      </span>
      <span style="font-weight: 600; color: #9333ea;">${formatCurrency(
        (item.price || 0) * item.quantity,
        currency
      )}</span>
    </li>`
    )
    .join("");

  const textContent = `Hi ${specialist.name},

Great news! Your products have been ordered! 🎉

Order Number: ${order.orderNumber}
Your Products Total: ${beauticianTotalFormatted}

YOUR PRODUCTS IN THIS ORDER:
${itemsList}

Customer Information:
${customerName}
Email: ${order.shippingAddress.email}
Phone: ${order.shippingAddress.phone}

Shipping Address:
${order.shippingAddress.address}
${order.shippingAddress.city}, ${order.shippingAddress.postalCode}
${order.shippingAddress.country}

The admin will process and fulfill this order. You'll receive your commission once the order is marked as delivered.

Order ID: ${order._id}

Thank you for offering your products on our platform!

Best regards,
Elite Booker Team`;

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #9333ea; border-bottom: 2px solid #9333ea; padding-bottom: 10px;">🎉 Your Products Have Been Ordered!</h2>
      
      <p style="font-size: 16px; color: #374151; margin: 20px 0;">Hi <strong>${
        specialist.name
      }</strong>,</p>
      
      <p style="color: #374151; margin-bottom: 20px;">Great news! A customer has ordered your products through Elite Booker!</p>
      
      <div style="background-color: #fef3c7; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #fad24e;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
          <span style="color: #92400e; font-weight: 600;">Order Number:</span>
          <span style="font-weight: 700; color: #1f2937; font-family: monospace;">${
            order.orderNumber
          }</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #92400e; font-weight: 600;">Your Products Total:</span>
          <span style="font-weight: 700; color: #9333ea; font-size: 18px;">${beauticianTotalFormatted}</span>
        </div>
      </div>
      
      <h3 style="color: #1f2937; margin-top: 30px; margin-bottom: 15px;">Your Products in This Order</h3>
      <ul style="list-style: none; padding: 0; margin: 0 0 20px 0;">
        ${itemsHtml}
      </ul>
      
      <h3 style="color: #1f2937; margin-top: 30px; margin-bottom: 15px;">Customer Information</h3>
      <div style="background-color: #eff6ff; padding: 15px; border-radius: 8px; border-left: 4px solid #3b82f6;">
        <p style="margin: 0; font-weight: 600; color: #1f2937;">${customerName}</p>
        <p style="margin: 5px 0 0 0; color: #6b7280;">📧 ${
          order.shippingAddress.email
        }</p>
        <p style="margin: 5px 0 0 0; color: #6b7280;">📞 ${
          order.shippingAddress.phone
        }</p>
      </div>
      
      <h3 style="color: #1f2937; margin-top: 25px; margin-bottom: 15px;">Shipping Address</h3>
      <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px;">
        <p style="margin: 0; color: #374151;">${
          order.shippingAddress.address
        }</p>
        <p style="margin: 5px 0 0 0; color: #374151;">${
          order.shippingAddress.city
        }, ${order.shippingAddress.postalCode}</p>
        <p style="margin: 5px 0 0 0; color: #374151;">${
          order.shippingAddress.country
        }</p>
      </div>
      
      <div style="background-color: #ecfdf5; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
        <p style="margin: 0; color: #065f46; font-weight: 600;">💰 Commission Information</p>
        <p style="margin: 10px 0 0 0; color: #047857; font-size: 14px;">The admin will process and fulfill this order. You'll receive your commission once the order is marked as delivered.</p>
      </div>
      
      <p style="margin-top: 30px; color: #6b7280; font-size: 14px;">Thank you for offering your products on our platform!</p>
      
      <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
        <p style="margin: 0; color: #6b7280; font-size: 14px;">Best regards,</p>
        <p style="margin: 5px 0 0 0; color: #9333ea; font-weight: bold;">Elite Booker Team</p>
        <p style="margin: 20px 0 0 0; color: #9ca3af; font-size: 11px;">Order ID: ${String(
          order._id
        )}</p>
      </div>
    </div>
  `;

  console.log(
    "[MAILER] Sending specialist product notification to:",
    beauticianEmail
  );
  console.log("[MAILER] Order number:", order.orderNumber);
  console.log("[MAILER] Specialist items count:", beauticianItems.length);
  console.log("[MAILER] Specialist total:", beauticianTotalFormatted);

  try {
    const info = await tx.sendMail({
      from,
      to: beauticianEmail,
      subject: `🎉 Your Products Sold! Order #${order.orderNumber} - ${beauticianTotalFormatted}`,
      text: textContent,
      html: htmlContent,
    });
    console.log(
      "[MAILER] ✓ Specialist product notification sent successfully. MessageId:",
      info.messageId
    );
  } catch (error) {
    console.error(
      "[MAILER] ✗ Failed to send specialist product notification:",
      error
    );
    // Don't throw - specialist notification failure shouldn't block other emails
  }
}

/**
 * Send admin notification for new product order
 */
export async function sendAdminOrderNotification({ order }) {
  console.log(
    "[MAILER] sendAdminOrderNotification called for order:",
    order?._id
  );
  const tx = getTransport();
  if (!tx) {
    console.warn("[MAILER] No transport - skipping admin notification");
    return;
  }

  const adminEmail = process.env.ADMIN_NOTIFY_EMAIL;
  console.log("[MAILER] ADMIN_NOTIFY_EMAIL:", adminEmail || "NOT SET");
  if (!adminEmail) {
    console.warn(
      "[MAILER] No admin email configured - skipping admin notification"
    );
    return;
  }

  const from = getDefaultFromEmail();
  const customerName = `${order.shippingAddress.firstName} ${order.shippingAddress.lastName}`;
  const currency = order.currency || "GBP";
  const totalPrice = formatCurrency(
    order.totalPrice || order.total || 0,
    currency
  );

  const itemsList = order.items
    .map(
      (item) =>
        `- ${item.title}${item.size ? ` (${item.size})` : ""} x ${
          item.quantity
        }`
    )
    .join("\n");

  await tx.sendMail({
    from,
    to: adminEmail,
    subject: `🛍️ New Order #${order.orderNumber} - ${totalPrice}`,
    text: `New order received!

Order Number: ${order.orderNumber}
Total: ${totalPrice}
Payment Status: ${order.paymentStatus}

Customer: ${customerName}
Email: ${order.shippingAddress.email}
Phone: ${order.shippingAddress.phone}

Items:
${itemsList}

Shipping Address:
${order.shippingAddress.address}
${order.shippingAddress.city}, ${order.shippingAddress.postalCode}
${order.shippingAddress.country}

Order ID: ${order._id}
View in admin panel to process this order.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #9333ea; border-bottom: 2px solid #9333ea; padding-bottom: 10px;">🛍️ New Order Received</h2>
        
        <div style="background-color: #eff6ff; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
            <span style="font-weight: 600;">Order Number:</span>
            <span style="font-weight: 700; color: #1f2937;">${
              order.orderNumber
            }</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
            <span style="font-weight: 600;">Total:</span>
            <span style="font-weight: 700; color: #9333ea;">${totalPrice}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="font-weight: 600;">Payment:</span>
            <span style="color: #10b981; font-weight: 600;">${
              order.paymentStatus
            }</span>
          </div>
        </div>
        
        <h3 style="color: #1f2937; margin-top: 25px;">Customer Information</h3>
        <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px;">
          <p style="margin: 0; font-weight: 600;">${customerName}</p>
          <p style="margin: 5px 0 0 0; color: #6b7280;">📧 ${
            order.shippingAddress.email
          }</p>
          <p style="margin: 5px 0 0 0; color: #6b7280;">📞 ${
            order.shippingAddress.phone
          }</p>
        </div>
        
        <h3 style="color: #1f2937; margin-top: 25px;">Order Items</h3>
        <ul style="background-color: #f9fafb; padding: 15px 15px 15px 35px; border-radius: 8px; margin: 10px 0;">
          ${order.items
            .map(
              (item) =>
                `<li style="margin: 5px 0; color: #374151;">${item.title}${
                  item.size ? ` (${item.size})` : ""
                } x ${item.quantity}</li>`
            )
            .join("")}
        </ul>
        
        <h3 style="color: #1f2937; margin-top: 25px;">Shipping Address</h3>
        <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px;">
          <p style="margin: 0; color: #374151;">${
            order.shippingAddress.address
          }</p>
          <p style="margin: 5px 0 0 0; color: #374151;">${
            order.shippingAddress.city
          }, ${order.shippingAddress.postalCode}</p>
          <p style="margin: 5px 0 0 0; color: #374151;">${
            order.shippingAddress.country
          }</p>
        </div>
        
        <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
          <p style="margin: 0; color: #92400e; font-weight: 600;">⚡ Action Required</p>
          <p style="margin: 10px 0 0 0; color: #b45309; font-size: 14px;">View this order in your admin panel to process and fulfill it.</p>
        </div>
        
        <p style="margin-top: 30px; color: #9ca3af; font-size: 11px;">Order ID: ${String(
          order._id
        )}</p>
      </div>
    `,
  });

  console.log("[MAILER] Sending admin notification to:", adminEmail);
  console.log("[MAILER] Order number:", order.orderNumber);

  try {
    const info = await tx.sendMail({
      from,
      to: adminEmail,
      subject: `🛍️ New Order #${order.orderNumber} - ${totalPrice}`,
      text: `New order received!

Order Number: ${order.orderNumber}
Total: ${totalPrice}
Payment Status: ${order.paymentStatus}

Customer: ${customerName}
Email: ${order.shippingAddress.email}
Phone: ${order.shippingAddress.phone}

Items:
${itemsList}

Shipping Address:
${order.shippingAddress.address}
${order.shippingAddress.city}, ${order.shippingAddress.postalCode}
${order.shippingAddress.country}

Order ID: ${order._id}
View in admin panel to process this order.`,
      html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #9333ea; border-bottom: 2px solid #9333ea; padding-bottom: 10px;">🛍️ New Order Received</h2>
        
        <div style="background-color: #eff6ff; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
            <span style="font-weight: 600;">Order Number:</span>
            <span style="font-weight: 700; color: #1f2937;">${
              order.orderNumber
            }</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
            <span style="font-weight: 600;">Total:</span>
            <span style="font-weight: 700; color: #9333ea;">${totalPrice}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="font-weight: 600;">Payment:</span>
            <span style="color: #10b981; font-weight: 600;">${
              order.paymentStatus
            }</span>
          </div>
        </div>
        
        <h3 style="color: #1f2937; margin-top: 25px;">Customer Information</h3>
        <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px;">
          <p style="margin: 0; font-weight: 600;">${customerName}</p>
          <p style="margin: 5px 0 0 0; color: #6b7280;">📧 ${
            order.shippingAddress.email
          }</p>
          <p style="margin: 5px 0 0 0; color: #6b7280;">📞 ${
            order.shippingAddress.phone
          }</p>
        </div>
        
        <h3 style="color: #1f2937; margin-top: 25px;">Order Items</h3>
        <ul style="background-color: #f9fafb; padding: 15px 15px 15px 35px; border-radius: 8px; margin: 10px 0;">
          ${order.items
            .map(
              (item) =>
                `<li style="margin: 5px 0; color: #374151;">${item.title}${
                  item.size ? ` (${item.size})` : ""
                } x ${item.quantity}</li>`
            )
            .join("")}
        </ul>
        
        <h3 style="color: #1f2937; margin-top: 25px;">Shipping Address</h3>
        <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px;">
          <p style="margin: 0; color: #374151;">${
            order.shippingAddress.address
          }</p>
          <p style="margin: 5px 0 0 0; color: #374151;">${
            order.shippingAddress.city
          }, ${order.shippingAddress.postalCode}</p>
          <p style="margin: 5px 0 0 0; color: #374151;">${
            order.shippingAddress.country
          }</p>
        </div>
        
        <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
          <p style="margin: 0; color: #92400e; font-weight: 600;">⚡ Action Required</p>
          <p style="margin: 10px 0 0 0; color: #b45309; font-size: 14px;">View this order in your admin panel to process and fulfill it.</p>
        </div>
        
        <p style="margin-top: 30px; color: #9ca3af; font-size: 11px;">Order ID: ${String(
          order._id
        )}</p>
      </div>
    `,
    });
    console.log(
      "[MAILER] ✓ Admin notification sent successfully. MessageId:",
      info.messageId
    );
  } catch (error) {
    console.error("[MAILER] ✗ Failed to send admin notification:", error);
    throw error;
  }
}

/**
 * Send order ready for collection notification to customer
 */
export async function sendOrderReadyForCollectionEmail({ order }) {
  console.log(
    "[MAILER] sendOrderReadyForCollectionEmail called for order:",
    order?._id
  );
  const tx = getTransport();
  if (!tx) {
    console.warn(
      "[MAILER] No transport - skipping collection ready notification"
    );
    return;
  }

  const from = getDefaultFromEmail();
  console.log("[MAILER] Sending from:", from);

  const customerEmail = order.shippingAddress?.email;
  console.log("[MAILER] Customer email:", customerEmail || "NOT SET");
  if (!customerEmail) {
    console.warn(
      "[MAILER] No customer email - skipping collection ready notification"
    );
    return;
  }

  const customerName = `${order.shippingAddress.firstName} ${order.shippingAddress.lastName}`;
  const currency = order.currency || "GBP";
  const totalPrice = formatCurrency(order.total || 0, currency);

  // Build items list
  const itemsText = order.items
    .map(
      (item) =>
        `- ${item.title}${item.size ? ` (${item.size})` : ""} x ${
          item.quantity
        }`
    )
    .join("\n");

  const itemsHtml = order.items
    .map(
      (item) => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
        <div style="display: flex; align-items: center; gap: 12px;">
          ${
            item.image
              ? `<img src="${item.image}" alt="${item.title}" style="width: 50px; height: 50px; border-radius: 8px; object-fit: cover;" />`
              : ""
          }
          <div>
            <div style="font-weight: 600; color: #1f2937;">${item.title}</div>
            ${
              item.size
                ? `<div style="font-size: 13px; color: #6b7280;">${item.size}</div>`
                : ""
            }
          </div>
        </div>
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center; color: #6b7280;">
        ${item.quantity}
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: 600; color: #1f2937;">
        ${formatCurrency((item.price || 0) * item.quantity, currency)}
      </td>
    </tr>
  `
    )
    .join("");

  const collectionAddress =
    order.collectionAddress || "12 Blackfriars Rd, Wisbech PE13 1AT";

  const textContent = `Hi ${customerName},

Great news! Your order is now ready for collection! 🎉

Order Number: ${order.orderNumber}
Total: ${totalPrice}

Items Ready for Collection:
${itemsText}

Collection Address:
${collectionAddress}

Opening Hours:
Monday - Sunday: 9:00 AM - 5:00 PM

Please collect your order during our opening hours. Don't forget to bring your order number: ${order.orderNumber}

If you have any questions, please contact us at +44 7928 775746.

Thank you for shopping with us!

Best regards,
Elite Booker Team
12 Blackfriars Rd, Wisbech PE13 1AT
Phone: +44 7928 775746`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #fad24e 0%, #d4a710 100%); padding: 40px 20px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: bold; text-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              🎉 Your Order is Ready!
            </h1>
            <p style="color: #ffffff; margin: 10px 0 0 0; font-size: 16px; opacity: 0.95;">
              Come and collect it at your convenience
            </p>
          </div>

          <!-- Content -->
          <div style="padding: 40px 30px;">
            <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
              Hi <strong>${customerName}</strong>,
            </p>
            
            <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
              Great news! Your order is now ready for collection. We've carefully prepared everything for you.
            </p>

            <!-- Order Details Box -->
            <div style="background-color: #fef3c7; border-left: 4px solid #fad24e; padding: 20px; border-radius: 8px; margin-bottom: 30px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <span style="color: #92400e; font-weight: 600; font-size: 14px;">ORDER NUMBER</span>
                <span style="color: #1f2937; font-weight: 700; font-size: 18px; font-family: monospace;">${
                  order.orderNumber
                }</span>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="color: #92400e; font-weight: 600; font-size: 14px;">TOTAL PAID</span>
                <span style="color: #1f2937; font-weight: 700; font-size: 18px;">${totalPrice}</span>
              </div>
            </div>

            <!-- Items Table -->
            <h2 style="color: #1f2937; font-size: 18px; margin: 0 0 15px 0; font-weight: 600;">
              Your Items
            </h2>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px; background-color: #f9fafb; border-radius: 8px; overflow: hidden;">
              <thead>
                <tr style="background-color: #f3f4f6;">
                  <th style="padding: 12px; text-align: left; color: #6b7280; font-size: 12px; font-weight: 600; text-transform: uppercase;">Item</th>
                  <th style="padding: 12px; text-align: center; color: #6b7280; font-size: 12px; font-weight: 600; text-transform: uppercase;">Qty</th>
                  <th style="padding: 12px; text-align: right; color: #6b7280; font-size: 12px; font-weight: 600; text-transform: uppercase;">Price</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>

            <!-- Collection Address Box -->
            <div style="background-color: #eff6ff; border: 2px solid #93c5fd; border-radius: 12px; padding: 25px; margin-bottom: 30px;">
              <h2 style="color: #1e40af; font-size: 18px; margin: 0 0 15px 0; font-weight: 600;">
                📍 Collection Address
              </h2>
              <p style="color: #1f2937; font-size: 16px; font-weight: 600; margin: 0 0 5px 0; line-height: 1.5;">
                [Business Name]
              </p>
              <p style="color: #4b5563; font-size: 15px; margin: 0; line-height: 1.6;">
                ${collectionAddress}
              </p>
              
              <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #bfdbfe;">
                <h3 style="color: #1e40af; font-size: 15px; margin: 0 0 10px 0; font-weight: 600;">
                  🕒 Opening Hours
                </h3>
                <p style="color: #1f2937; font-size: 14px; margin: 0; line-height: 1.8;">
                  <strong>Monday - Sunday:</strong> 9:00 AM - 5:00 PM
                </p>
              </div>

              <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #bfdbfe;">
                <h3 style="color: #1e40af; font-size: 15px; margin: 0 0 10px 0; font-weight: 600;">
                  📞 Contact Us
                </h3>
                <p style="color: #1f2937; font-size: 14px; margin: 0; line-height: 1.8;">
                  Phone: <a href="tel:+447928775746" style="color: #2563eb; text-decoration: none; font-weight: 600;">+44 7928 775746</a>
                </p>
              </div>
            </div>

            <!-- Important Info -->
            <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 15px; border-radius: 8px; margin-bottom: 30px;">
              <p style="color: #991b1b; font-size: 14px; margin: 0; font-weight: 600;">
                ⚠️ Important Reminder
              </p>
              <p style="color: #7f1d1d; font-size: 13px; margin: 8px 0 0 0; line-height: 1.6;">
                Please bring your order number (<strong>${
                  order.orderNumber
                }</strong>) when collecting your items. This helps us serve you quickly and efficiently.
              </p>
            </div>

            <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
              We look forward to seeing you soon! If you have any questions or need to reschedule your collection, please don't hesitate to contact us.
            </p>

            <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 30px 0 0 0;">
              Best regards,<br>
              <strong style="color: #1f2937;">The Elite Booker Team</strong>
            </p>
          </div>

          <!-- Footer -->
          <div style="background-color: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
            <p style="color: #6b7280; font-size: 13px; margin: 0 0 10px 0;">
              [Business Name]<br>
              12 Blackfriars Rd, Wisbech PE13 1AT<br>
              Phone: +44 7928 775746
            </p>
            <p style="color: #9ca3af; font-size: 11px; margin: 15px 0 0 0;">
              Order ID: ${String(order._id)}
            </p>
          </div>
        </div>
      </body>
    </html>
  `;

  try {
    console.log(
      "[MAILER] Sending collection ready notification to:",
      customerEmail
    );
    const info = await tx.sendMail({
      from,
      to: customerEmail,
      subject: `✅ Your Order ${order.orderNumber} is Ready for Collection!`,
      text: textContent,
      html: htmlContent,
    });
    console.log(
      "[MAILER] ✓ Collection ready email sent successfully. MessageId:",
      info.messageId
    );
  } catch (error) {
    console.error(
      "[MAILER] ✗ Failed to send collection ready notification:",
      error
    );
    throw error;
  }
}

/**
 * Send specialist account credentials email
 */
export async function sendSpecialistCredentialsEmail({
  specialistName,
  email,
  tempPassword,
  tenantName,
}) {
  const tx = getTransport();
  if (!tx) {
    console.log(
      "[MAILER] No SMTP configured, skipping specialist credentials email"
    );
    return;
  }

  const from = getDefaultFromEmail();
  const loginUrl = process.env.FRONTEND_URL
    ? `${process.env.FRONTEND_URL}/admin/login`
    : "https://yourdomain.com/admin/login";

  const subject = `Welcome to ${
    tenantName || "Our Platform"
  } - Admin Account Created`;

  const textContent = `Hi ${specialistName},

Welcome to ${tenantName || "our platform"}!

Your admin account has been created. You can now log in to manage your schedule, view appointments, and update your services.

Login Credentials:
- Email: ${email}
- Temporary Password: ${tempPassword}

Login URL: ${loginUrl}

⚠️ IMPORTANT: Please change your password immediately after your first login for security purposes.

To change your password:
1. Log in using the credentials above
2. Go to your account settings
3. Update your password to something secure and memorable

If you have any questions or need assistance, please contact your administrator.

Best regards,
${tenantName || "The Team"}`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
        .credentials { background: white; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #667eea; }
        .warning { background: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 6px; margin: 20px 0; }
        .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
        .footer { text-align: center; color: #666; font-size: 12px; margin-top: 30px; }
        .code { background: #f4f4f4; padding: 8px 12px; border-radius: 4px; font-family: monospace; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Welcome to ${tenantName || "Our Platform"}!</h1>
        </div>
        <div class="content">
          <p>Hi <strong>${specialistName}</strong>,</p>
          
          <p>Your admin account has been created. You can now log in to manage your schedule, view appointments, and update your services.</p>
          
          <div class="credentials">
            <h3>Login Credentials</h3>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Temporary Password:</strong> <span class="code">${tempPassword}</span></p>
          </div>
          
          <div style="text-align: center;">
            <a href="${loginUrl}" class="button">Login to Your Account</a>
          </div>
          
          <div class="warning">
            <strong>⚠️ IMPORTANT:</strong> Please change your password immediately after your first login for security purposes.
          </div>
          
          <h3>To change your password:</h3>
          <ol>
            <li>Log in using the credentials above</li>
            <li>Go to your account settings</li>
            <li>Update your password to something secure and memorable</li>
          </ol>
          
          <p>If you have any questions or need assistance, please contact your administrator.</p>
          
          <div class="footer">
            <p>Best regards,<br>${tenantName || "The Team"}</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await tx.sendMail({
      from,
      to: email,
      subject,
      text: textContent,
      html: htmlContent,
    });
    console.log(`[MAILER] ✓ Specialist credentials email sent to ${email}`);
  } catch (error) {
    console.error(
      `[MAILER] ✗ Failed to send specialist credentials email to ${email}:`,
      error
    );
    // Don't throw - we don't want to fail specialist creation if email fails
  }
}

/**
 * Send seminar booking confirmation email to attendee
 */
export async function sendSeminarConfirmationEmail({
  booking,
  seminar,
  session,
  tenant,
}) {
  console.log(
    "[MAILER] sendSeminarConfirmationEmail called for booking:",
    booking?.bookingReference
  );
  const tx = getTransport();
  if (!tx) {
    console.warn("[MAILER] No transport - skipping seminar confirmation email");
    return;
  }

  const from = getDefaultFromEmail();
  console.log("[MAILER] Sending from:", from);

  const salonTz = process.env.SALON_TZ || "Europe/London";
  const sessionDate = new Date(session.date).toLocaleString("en-GB", {
    timeZone: salonTz,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const attendeeEmail = booking.attendeeInfo?.email;
  console.log("[MAILER] Attendee email:", attendeeEmail || "NOT SET");
  if (!attendeeEmail) {
    console.warn("[MAILER] No attendee email - skipping confirmation email");
    return;
  }

  const currency = booking.payment?.currency || "GBP";
  const amount = formatCurrency(booking.payment?.amount || 0, currency);
  const tenantName = tenant?.businessName || "Our Business";

  const subject = `Seminar Booking Confirmation - ${seminar.title}`;
  const text = `
Dear ${booking.attendeeInfo.name},

Thank you for booking ${seminar.title}!

BOOKING DETAILS
Booking Reference: ${booking.bookingReference}
Seminar: ${seminar.title}
Date: ${sessionDate}
Time: ${session.startTime} - ${session.endTime}
Amount Paid: ${amount}

${seminar.location?.address ? `Location: ${seminar.location.address}` : ""}
${
  booking.attendeeInfo.specialRequests
    ? `Special Requests: ${booking.attendeeInfo.specialRequests}`
    : ""
}

WHAT TO BRING
${seminar.requirements || "Please arrive 10 minutes before the start time."}

If you need to cancel or have any questions, please contact us at ${from}.

Best regards,
${tenantName}
  `;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f9fafb;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Booking Confirmed!</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 30px;">
              <p style="font-size: 16px; color: #374151; margin: 0 0 20px;">Dear ${
                booking.attendeeInfo.name
              },</p>
              <p style="font-size: 16px; color: #374151; margin: 0 0 20px;">Thank you for booking <strong>${
                seminar.title
              }</strong>! We're excited to have you join us.</p>
              
              <!-- Booking Details Box -->
              <div style="background-color: #f3f4f6; border-radius: 8px; padding: 20px; margin: 20px 0;">
                <h2 style="color: #1f2937; margin: 0 0 15px; font-size: 18px;">Booking Details</h2>
                <table width="100%" cellpadding="8" cellspacing="0">
                  <tr>
                    <td style="color: #6b7280; font-size: 14px; padding: 4px 0;">Booking Reference:</td>
                    <td style="color: #1f2937; font-weight: bold; font-size: 14px; text-align: right; padding: 4px 0;">${
                      booking.bookingReference
                    }</td>
                  </tr>
                  <tr>
                    <td style="color: #6b7280; font-size: 14px; padding: 4px 0;">Seminar:</td>
                    <td style="color: #1f2937; font-weight: bold; font-size: 14px; text-align: right; padding: 4px 0;">${
                      seminar.title
                    }</td>
                  </tr>
                  <tr>
                    <td style="color: #6b7280; font-size: 14px; padding: 4px 0;">Date:</td>
                    <td style="color: #1f2937; font-weight: bold; font-size: 14px; text-align: right; padding: 4px 0;">${sessionDate}</td>
                  </tr>
                  <tr>
                    <td style="color: #6b7280; font-size: 14px; padding: 4px 0;">Time:</td>
                    <td style="color: #1f2937; font-weight: bold; font-size: 14px; text-align: right; padding: 4px 0;">${
                      session.startTime
                    } - ${session.endTime}</td>
                  </tr>
                  <tr>
                    <td style="color: #6b7280; font-size: 14px; padding: 4px 0;">Amount Paid:</td>
                    <td style="color: #10b981; font-weight: bold; font-size: 16px; text-align: right; padding: 4px 0;">${amount}</td>
                  </tr>
                  ${
                    seminar.location?.address
                      ? `
                  <tr>
                    <td style="color: #6b7280; font-size: 14px; padding: 4px 0; vertical-align: top;">Location:</td>
                    <td style="color: #1f2937; font-size: 14px; text-align: right; padding: 4px 0;">${seminar.location.address}</td>
                  </tr>
                  `
                      : ""
                  }
                  ${
                    booking.attendeeInfo.specialRequests
                      ? `
                  <tr>
                    <td style="color: #6b7280; font-size: 14px; padding: 4px 0; vertical-align: top;">Special Requests:</td>
                    <td style="color: #1f2937; font-size: 14px; text-align: right; padding: 4px 0;">${booking.attendeeInfo.specialRequests}</td>
                  </tr>
                  `
                      : ""
                  }
                </table>
              </div>

              ${
                seminar.requirements
                  ? `
              <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0; border-radius: 4px;">
                <h3 style="color: #1e40af; margin: 0 0 10px; font-size: 16px;">What to Bring</h3>
                <p style="color: #1e40af; margin: 0; font-size: 14px;">${seminar.requirements}</p>
              </div>
              `
                  : ""
              }

              <p style="font-size: 14px; color: #6b7280; margin: 20px 0 0;">If you need to cancel or have any questions, please contact us at <a href="mailto:${from}" style="color: #667eea; text-decoration: none;">${from}</a></p>
              
              <p style="font-size: 16px; color: #374151; margin: 20px 0 0;">Best regards,<br><strong>${tenantName}</strong></p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 20px; text-align: center; border-radius: 0 0 8px 8px;">
              <p style="font-size: 12px; color: #9ca3af; margin: 0;">This is an automated confirmation email.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  try {
    await tx.sendMail({
      from,
      to: attendeeEmail,
      subject,
      text,
      html,
    });
    console.log(
      `[MAILER] ✓ Seminar confirmation email sent to ${attendeeEmail}`
    );
  } catch (error) {
    console.error(
      `[MAILER] ✗ Failed to send seminar confirmation email to ${attendeeEmail}:`,
      error
    );
  }
}

export { sendEmail };

export default {
  sendCancellationEmails,
  sendConfirmationEmail,
  sendEmail,
  sendOrderConfirmationEmail,
  sendAdminOrderNotification,
  sendBeauticianProductOrderNotification,
  sendOrderReadyForCollectionEmail,
  sendSpecialistCredentialsEmail,
  sendSeminarConfirmationEmail,
};
