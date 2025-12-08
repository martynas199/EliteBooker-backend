import nodemailer from "nodemailer";

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
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  console.log("[MAILER] Checking SMTP configuration...");
  console.log("[MAILER] SMTP_HOST:", host ? "✓ SET" : "✗ MISSING");
  console.log("[MAILER] SMTP_PORT:", port);
  console.log("[MAILER] SMTP_USER:", user ? "✓ SET" : "✗ MISSING");
  console.log("[MAILER] SMTP_PASS:", pass ? "✓ SET" : "✗ MISSING");

  if (!host || !user || !pass) {
    console.warn("[MAILER] SMTP not fully configured - emails will be skipped");
    return null; // no-op mailer
  }

  console.log("[MAILER] Creating nodemailer transport...");
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  console.log("[MAILER] Transport created successfully");
  return transport;
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
  console.log(
    "[MAILER] sendCancellationEmails called for appointment:",
    appointment?._id
  );
  const tx = getTransport();
  if (!tx) {
    console.warn("[MAILER] No transport - skipping cancellation emails");
    return;
  }
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  console.log("[MAILER] Sending from:", from);
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
  console.log("[MAILER] Customer email:", cust || "NOT SET");
  if (cust) {
    console.log("[MAILER] Preparing cancellation email for customer...");
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
        <h2 style="color: #ef4444; border-bottom: 2px solid #ef4444; padding-bottom: 10px;">Appointment Cancelled</h2>
        <p>Hi ${appointment.client?.name || ""},</p>
        <p>Your appointment has been cancelled.</p>
        
        <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ef4444;">
          <h3 style="margin-top: 0; color: #1f2937;">Appointment Details</h3>
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
        
        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
          <p style="margin: 0; color: #6b7280; font-size: 14px;">Best regards,</p>
          <p style="margin: 5px 0 0 0; color: #9333ea; font-weight: bold;">Elite Booker</p>
          <p style="margin: 20px 0 0 0; color: #9ca3af; font-size: 11px;">Appointment ID: ${String(
            appointment._id
          )}</p>
        </div>
      </div>
    `;

    console.log("[MAILER] Sending cancellation email to:", cust);
    try {
      const info = await tx.sendMail({
        from,
        to: cust,
        subject: `Appointment Cancelled - ${serviceName}`,
        text: textContent,
        html: htmlContent,
      });
      console.log(
        "[MAILER] ✓ Cancellation email sent successfully. MessageId:",
        info.messageId
      );
    } catch (error) {
      console.error("[MAILER] ✗ Failed to send cancellation email:", error);
      throw error;
    }
  }

  // Optional: Send notification to specialist/salon staff
  const beauticianEmail = process.env.BEAUTICIAN_NOTIFY_EMAIL;
  if (beauticianEmail) {
    const beauticianName = appointment.beauticianId?.name || "Staff";

    await tx.sendMail({
      from,
      to: beauticianEmail,
      subject: `Appointment Cancelled - ${serviceName}`,
      text: `A slot has been freed up.\n\nAppointment Details:\n- Service: ${serviceName}\n- Date & Time: ${startDate}\n- Beautician: ${beauticianName}\n- Client: ${
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
          <h2 style="color: #f59e0b; border-bottom: 2px solid #f59e0b; padding-bottom: 10px;">📅 Appointment Cancelled - Slot Freed</h2>
          
          <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #1f2937;">Appointment Details</h3>
            <p style="margin: 8px 0;"><strong>Service:</strong> ${serviceName}</p>
            <p style="margin: 8px 0;"><strong>Date & Time:</strong> ${startDate}</p>
            <p style="margin: 8px 0;"><strong>Beautician:</strong> ${beauticianName}</p>
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
  console.log(
    "[MAILER] sendConfirmationEmail called for appointment:",
    appointment?._id
  );
  const tx = getTransport();
  if (!tx) {
    console.warn("[MAILER] No transport - skipping confirmation email");
    return;
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
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

  const serviceName = service?.name || appointment.variantName || "Service";
  const beauticianName = specialist?.name || "Our team";
  const currency = appointment.currency || "GBP";
  const price = appointment.price
    ? formatCurrency(appointment.price, currency)
    : "";

  // Determine payment status and deposit info
  let paymentStatus = "Unknown";
  let isDepositPayment = false;
  let depositAmount = 0;
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
    // Calculate deposit amount from payment.amountTotal (in pence/cents)
    // Note: amountTotal includes the £0.50 booking fee
    const platformFee = Number(process.env.STRIPE_PLATFORM_FEE || 50); // in pence/cents
    bookingFee = platformFee / 100; // Convert to main currency unit for display
    const totalPaid = appointment.payment?.amountTotal
      ? appointment.payment.amountTotal / 100
      : 0;
    depositAmount = totalPaid - bookingFee; // Actual deposit without fee

    const totalPrice = Number(appointment.price || 0);
    remainingBalance = totalPrice - depositAmount;

    paymentStatus =
      appointment.payment?.status === "succeeded"
        ? `Deposit paid`
        : "Deposit pending";
  } else if (appointment.status === "reserved_unpaid") {
    paymentStatus = "Pay at salon";
  } else if (appointment.status === "confirmed") {
    paymentStatus = "Confirmed";
  } else {
    paymentStatus = appointment.status;
  }

  console.log("[MAILER] Preparing confirmation email...");
  console.log("[MAILER] Service:", serviceName);
  console.log("[MAILER] Beautician:", beauticianName);
  console.log("[MAILER] Time:", startTime);
  console.log("[MAILER] Appointment status:", appointment.status);
  console.log(
    "[MAILER] Payment object:",
    JSON.stringify(appointment.payment, null, 2)
  );
  console.log("[MAILER] Payment mode:", appointment.payment?.mode);
  console.log("[MAILER] Determined payment status:", paymentStatus);
  console.log("[MAILER] Sending confirmation email to:", customerEmail);

  try {
    const info = await tx.sendMail({
      from,
      to: customerEmail,
      subject: `Appointment Confirmed - ${serviceName}`,
      text: `Hi ${appointment.client?.name || ""},

Your appointment has been confirmed!

Service: ${serviceName}
With: ${beauticianName}
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
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #9333ea;">Appointment Confirmed ✓</h2>
        <p>Hi ${appointment.client?.name || ""},</p>
        <p>Your appointment has been confirmed!</p>
        
        <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 8px 0;"><strong>Service:</strong> ${serviceName}</p>
          <p style="margin: 8px 0;"><strong>With:</strong> ${beauticianName}</p>
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
          `
              : `<p style="margin: 8px 0;"><strong>Payment:</strong> ${paymentStatus}</p>`
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
            ? `<p><em>Your notes: ${appointment.client.notes}</em></p>`
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
      "[MAILER] ✓ Confirmation email sent successfully. MessageId:",
      info.messageId
    );
  } catch (error) {
    console.error("[MAILER] ✗ Failed to send confirmation email:", error);
    throw error;
  }

  // Send notification to specialist
  const beauticianEmail = specialist?.email;
  console.log("[MAILER] Beautician email:", beauticianEmail || "NOT SET");
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
        <h2 style="color: #9333ea; border-bottom: 2px solid #9333ea; padding-bottom: 10px;">📅 New Booking Received</h2>
        <p>Hi ${beauticianName},</p>
        <p style="font-size: 16px; color: #374151; font-weight: 600;">You have a new booking!</p>
        
        <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #9333ea;">
          <h3 style="margin-top: 0; color: #1f2937;">Appointment Details</h3>
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
        "[MAILER] ✓ Beautician notification email sent successfully. MessageId:",
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

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
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
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #9333ea; margin: 0;">Order Confirmed! 🎉</h1>
        <p style="color: #6b7280; margin: 10px 0 0 0;">Thank you for your purchase</p>
      </div>
      
      <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
        <p style="margin: 0 0 10px 0;"><strong>Hi ${customerName},</strong></p>
        <p style="margin: 0; color: #374151;">Your order has been confirmed and we're getting it ready for shipment.</p>
      </div>
      
      <div style="background-color: #eff6ff; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #3b82f6;">
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
      
      <h3 style="color: #1f2937; border-bottom: 2px solid #9333ea; padding-bottom: 10px; margin-top: 30px;">Order Items</h3>
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
  console.log("[MAILER] Beautician email:", beauticianEmail || "NOT SET");
  if (!beauticianEmail) {
    console.warn(
      "[MAILER] No specialist email - skipping specialist product notification"
    );
    return;
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
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
  console.log("[MAILER] Beautician items count:", beauticianItems.length);
  console.log("[MAILER] Beautician total:", beauticianTotalFormatted);

  try {
    const info = await tx.sendMail({
      from,
      to: beauticianEmail,
      subject: `🎉 Your Products Sold! Order #${order.orderNumber} - ${beauticianTotalFormatted}`,
      text: textContent,
      html: htmlContent,
    });
    console.log(
      "[MAILER] ✓ Beautician product notification sent successfully. MessageId:",
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

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
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

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
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

export default {
  sendCancellationEmails,
  sendConfirmationEmail,
  sendOrderConfirmationEmail,
  sendAdminOrderNotification,
  sendBeauticianProductOrderNotification,
  sendOrderReadyForCollectionEmail,
};
