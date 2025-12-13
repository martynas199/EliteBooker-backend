import nodemailer from "nodemailer";

/**
 * Format currency based on the currency code
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

/**
 * Get email transport (returns null if not configured)
 */
function getTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.warn("[GIFT-CARD-MAILER] SMTP not configured - emails will be skipped");
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

/**
 * Send gift card purchase confirmation to purchaser
 */
export async function sendGiftCardPurchaseConfirmation({
  giftCard,
  tenant,
  specialist = null,
}) {
  console.log("[GIFT-CARD-MAILER] Sending purchase confirmation for:", giftCard.code);
  
  const tx = getTransport();
  if (!tx) {
    console.warn("[GIFT-CARD-MAILER] No transport - skipping purchase confirmation");
    return;
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const purchaseDate = new Date(giftCard.purchaseDate).toLocaleDateString("en-GB", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const expiryDate = new Date(giftCard.expiryDate).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const amount = formatCurrency(giftCard.amount, giftCard.currency);
  const businessName = tenant?.businessName || tenant?.name || "the salon";
  const specialistName = specialist ? ` with ${specialist.name}` : "";

  const textContent = `Hi ${giftCard.purchaserName},

Thank you for purchasing a gift card!

Your gift card purchase was successful and will be sent to the recipient.

GIFT CARD DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Code: ${giftCard.code}
Amount: ${amount}
Purchased: ${purchaseDate}
Valid Until: ${expiryDate}

RECIPIENT DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Name: ${giftCard.recipientName}
Email: ${giftCard.recipientEmail}
${giftCard.message ? `Your Message: "${giftCard.message}"` : ""}

REDEEMABLE AT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${businessName}${specialistName}

The recipient will receive an email with the gift card code and redemption instructions.

This gift card can be used for any service and is valid for one year from the purchase date.

If you have any questions, please contact ${businessName} directly.

Best regards,
${businessName}`;

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Gift Card Purchase Confirmation</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">
                🎁 Gift Card Purchased!
              </h1>
              <p style="margin: 10px 0 0; color: #ffffff; font-size: 16px; opacity: 0.9;">
                Thank you for your purchase
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px; color: #333333; font-size: 16px; line-height: 1.6;">
                Hi <strong>${giftCard.purchaserName}</strong>,
              </p>
              
              <p style="margin: 0 0 30px; color: #666666; font-size: 15px; line-height: 1.6;">
                Your gift card purchase was successful! We'll send it to <strong>${giftCard.recipientName}</strong> right away.
              </p>

              <!-- Gift Card Code Box -->
              <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; padding: 30px; text-align: center; margin: 30px 0;">
                <p style="margin: 0 0 10px; color: #ffffff; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; opacity: 0.9;">
                  Gift Card Code
                </p>
                <p style="margin: 0; color: #ffffff; font-size: 32px; font-weight: 700; letter-spacing: 3px; font-family: 'Courier New', monospace;">
                  ${giftCard.code}
                </p>
                <p style="margin: 15px 0 0; color: #ffffff; font-size: 24px; font-weight: 600;">
                  ${amount}
                </p>
              </div>

              <!-- Details Section -->
              <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin: 30px 0;">
                <h3 style="margin: 0 0 15px; color: #333333; font-size: 18px; font-weight: 600;">
                  Purchase Details
                </h3>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: #666666; font-size: 14px;">Purchased:</td>
                    <td style="padding: 8px 0; color: #333333; font-size: 14px; font-weight: 600; text-align: right;">${purchaseDate}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666666; font-size: 14px;">Valid Until:</td>
                    <td style="padding: 8px 0; color: #333333; font-size: 14px; font-weight: 600; text-align: right;">${expiryDate}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666666; font-size: 14px;">Redeemable At:</td>
                    <td style="padding: 8px 0; color: #333333; font-size: 14px; font-weight: 600; text-align: right;">${businessName}</td>
                  </tr>
                </table>
              </div>

              <!-- Recipient Details -->
              <div style="background-color: #fff8f0; border-left: 4px solid #ffa500; border-radius: 4px; padding: 20px; margin: 30px 0;">
                <h3 style="margin: 0 0 15px; color: #333333; font-size: 18px; font-weight: 600;">
                  Recipient Information
                </h3>
                <p style="margin: 0 0 8px; color: #666666; font-size: 14px;">
                  <strong style="color: #333333;">Name:</strong> ${giftCard.recipientName}
                </p>
                <p style="margin: 0 0 8px; color: #666666; font-size: 14px;">
                  <strong style="color: #333333;">Email:</strong> ${giftCard.recipientEmail}
                </p>
                ${giftCard.message ? `
                <p style="margin: 15px 0 0; color: #666666; font-size: 14px; font-style: italic; padding: 15px; background-color: #ffffff; border-radius: 4px;">
                  "${giftCard.message}"
                </p>
                ` : ""}
              </div>

              <!-- Info Boxes -->
              <div style="margin: 30px 0;">
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 15px; background-color: #e8f5e9; border-radius: 8px; width: 48%;">
                      <p style="margin: 0; color: #2e7d32; font-size: 14px; line-height: 1.5;">
                        <strong>✓ Email Sent</strong><br>
                        <span style="color: #558b2f;">Recipient notified</span>
                      </p>
                    </td>
                    <td style="width: 4%;"></td>
                    <td style="padding: 15px; background-color: #e3f2fd; border-radius: 8px; width: 48%;">
                      <p style="margin: 0; color: #1565c0; font-size: 14px; line-height: 1.5;">
                        <strong>⏰ Valid 1 Year</strong><br>
                        <span style="color: #1976d2;">Expires ${expiryDate}</span>
                      </p>
                    </td>
                  </tr>
                </table>
              </div>

              <p style="margin: 30px 0 0; color: #666666; font-size: 14px; line-height: 1.6;">
                If you have any questions, please contact ${businessName} directly.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8f9fa; padding: 30px; text-align: center; border-top: 1px solid #e0e0e0;">
              <p style="margin: 0 0 10px; color: #999999; font-size: 12px;">
                ${businessName}
              </p>
              <p style="margin: 0; color: #999999; font-size: 12px;">
                This is an automated confirmation email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  try {
    await tx.sendMail({
      from,
      to: giftCard.purchaserEmail,
      subject: `Gift Card Purchase Confirmation - ${giftCard.code}`,
      text: textContent,
      html: htmlContent,
    });
    console.log("[GIFT-CARD-MAILER] Purchase confirmation sent to:", giftCard.purchaserEmail);
  } catch (error) {
    console.error("[GIFT-CARD-MAILER] Failed to send purchase confirmation:", error);
    throw error;
  }
}

/**
 * Send gift card to recipient
 */
export async function sendGiftCardToRecipient({
  giftCard,
  tenant,
  specialist = null,
}) {
  console.log("[GIFT-CARD-MAILER] Sending gift card to recipient:", giftCard.recipientEmail);
  
  const tx = getTransport();
  if (!tx) {
    console.warn("[GIFT-CARD-MAILER] No transport - skipping recipient notification");
    return;
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const expiryDate = new Date(giftCard.expiryDate).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const amount = formatCurrency(giftCard.amount, giftCard.currency);
  const businessName = tenant?.businessName || tenant?.name || "the salon";
  const specialistName = specialist ? ` with ${specialist.name}` : "";
  const tenantSlug = tenant?.slug || "";
  const bookingUrl = tenantSlug ? `${process.env.FRONTEND_URL || "https://your-domain.com"}/salon/${tenantSlug}` : "";

  const textContent = `Hi ${giftCard.recipientName},

You've received a gift card from ${giftCard.purchaserName}!

🎁 GIFT CARD CODE 🎁
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${giftCard.code}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Amount: ${amount}
Valid Until: ${expiryDate}
Redeemable At: ${businessName}${specialistName}

${giftCard.message ? `PERSONAL MESSAGE FROM ${giftCard.purchaserName.toUpperCase()}:\n"${giftCard.message}"\n\n` : ""}HOW TO REDEEM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Visit ${businessName} online${bookingUrl ? ` at:\n   ${bookingUrl}` : ""}
2. Select your service and book an appointment
3. Enter your gift card code: ${giftCard.code}
4. Your gift card will be applied to your booking!

IMPORTANT INFORMATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• This gift card can be used for any service
• Valid for one year from purchase date
• Can be used for multiple bookings until balance is depleted
• Keep this code safe - treat it like cash

We look forward to seeing you soon!

Best regards,
${businessName}`;

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You've Received a Gift Card!</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 40px 30px; text-align: center;">
              <div style="font-size: 60px; margin-bottom: 15px;">🎁</div>
              <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: 600;">
                You've Received a Gift Card!
              </h1>
              <p style="margin: 15px 0 0; color: #ffffff; font-size: 18px; opacity: 0.95;">
                From ${giftCard.purchaserName}
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px; color: #333333; font-size: 16px; line-height: 1.6;">
                Hi <strong>${giftCard.recipientName}</strong>,
              </p>
              
              <p style="margin: 0 0 30px; color: #666666; font-size: 15px; line-height: 1.6;">
                Great news! <strong>${giftCard.purchaserName}</strong> has sent you a gift card to use at ${businessName}${specialistName}!
              </p>

              ${giftCard.message ? `
              <!-- Personal Message -->
              <div style="background: linear-gradient(135deg, #fff5f5 0%, #ffe5e5 100%); border-left: 4px solid #f5576c; border-radius: 8px; padding: 20px; margin: 30px 0;">
                <p style="margin: 0 0 10px; color: #999999; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">
                  Personal Message
                </p>
                <p style="margin: 0; color: #333333; font-size: 16px; line-height: 1.6; font-style: italic;">
                  "${giftCard.message}"
                </p>
              </div>
              ` : ""}

              <!-- Gift Card Display -->
              <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); border-radius: 12px; padding: 40px 30px; text-align: center; margin: 30px 0; box-shadow: 0 8px 16px rgba(245, 87, 108, 0.3);">
                <p style="margin: 0 0 15px; color: #ffffff; font-size: 14px; text-transform: uppercase; letter-spacing: 2px; opacity: 0.9;">
                  Your Gift Card Code
                </p>
                <div style="background-color: rgba(255, 255, 255, 0.2); backdrop-filter: blur(10px); border-radius: 8px; padding: 20px; margin: 20px 0;">
                  <p style="margin: 0; color: #ffffff; font-size: 36px; font-weight: 700; letter-spacing: 4px; font-family: 'Courier New', monospace;">
                    ${giftCard.code}
                  </p>
                </div>
                <p style="margin: 20px 0 0; color: #ffffff; font-size: 28px; font-weight: 600;">
                  ${amount}
                </p>
                <p style="margin: 10px 0 0; color: #ffffff; font-size: 14px; opacity: 0.9;">
                  Valid until ${expiryDate}
                </p>
              </div>

              <!-- How to Redeem -->
              <div style="background-color: #f8f9fa; border-radius: 8px; padding: 25px; margin: 30px 0;">
                <h3 style="margin: 0 0 20px; color: #333333; font-size: 20px; font-weight: 600;">
                  How to Redeem Your Gift Card
                </h3>
                <table style="width: 100%;">
                  <tr>
                    <td style="padding: 12px 0; vertical-align: top; width: 40px;">
                      <div style="width: 32px; height: 32px; background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #ffffff; font-weight: 600; font-size: 16px;">
                        1
                      </div>
                    </td>
                    <td style="padding: 12px 0; color: #666666; font-size: 15px; line-height: 1.6;">
                      Visit ${businessName}${bookingUrl ? ` at <a href="${bookingUrl}" style="color: #f5576c; text-decoration: none; font-weight: 600;">${bookingUrl}</a>` : ""}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0; vertical-align: top;">
                      <div style="width: 32px; height: 32px; background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #ffffff; font-weight: 600; font-size: 16px;">
                        2
                      </div>
                    </td>
                    <td style="padding: 12px 0; color: #666666; font-size: 15px; line-height: 1.6;">
                      Browse services and book your appointment
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0; vertical-align: top;">
                      <div style="width: 32px; height: 32px; background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #ffffff; font-weight: 600; font-size: 16px;">
                        3
                      </div>
                    </td>
                    <td style="padding: 12px 0; color: #666666; font-size: 15px; line-height: 1.6;">
                      Enter your gift card code at checkout
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0; vertical-align: top;">
                      <div style="width: 32px; height: 32px; background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #ffffff; font-weight: 600; font-size: 16px;">
                        4
                      </div>
                    </td>
                    <td style="padding: 12px 0; color: #666666; font-size: 15px; line-height: 1.6;">
                      Enjoy your service! 🎉
                    </td>
                  </tr>
                </table>
              </div>

              ${bookingUrl ? `
              <!-- CTA Button -->
              <div style="text-align: center; margin: 30px 0;">
                <a href="${bookingUrl}" style="display: inline-block; background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 12px rgba(245, 87, 108, 0.3);">
                  Book Your Appointment
                </a>
              </div>
              ` : ""}

              <!-- Important Info -->
              <div style="background-color: #fff8e1; border-radius: 8px; padding: 20px; margin: 30px 0;">
                <h4 style="margin: 0 0 12px; color: #f57c00; font-size: 16px; font-weight: 600;">
                  ⚠️ Important Information
                </h4>
                <ul style="margin: 0; padding-left: 20px; color: #666666; font-size: 14px; line-height: 1.8;">
                  <li>This gift card can be used for any service</li>
                  <li>Valid for one year from purchase date</li>
                  <li>Can be used for multiple bookings</li>
                  <li>Keep this code safe - treat it like cash</li>
                </ul>
              </div>

              <p style="margin: 30px 0 0; color: #666666; font-size: 14px; line-height: 1.6; text-align: center;">
                We look forward to seeing you soon!
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8f9fa; padding: 30px; text-align: center; border-top: 1px solid #e0e0e0;">
              <p style="margin: 0 0 10px; color: #333333; font-size: 16px; font-weight: 600;">
                ${businessName}
              </p>
              <p style="margin: 0; color: #999999; font-size: 12px;">
                This gift card was purchased by ${giftCard.purchaserName}
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  try {
    await tx.sendMail({
      from,
      to: giftCard.recipientEmail,
      subject: `🎁 You've Received a Gift Card from ${giftCard.purchaserName}!`,
      text: textContent,
      html: htmlContent,
    });
    console.log("[GIFT-CARD-MAILER] Gift card sent to recipient:", giftCard.recipientEmail);
  } catch (error) {
    console.error("[GIFT-CARD-MAILER] Failed to send to recipient:", error);
    throw error;
  }
}

/**
 * Send gift card sale notification to salon/specialist
 */
export async function sendGiftCardSaleNotification({
  giftCard,
  tenant,
  specialist = null,
}) {
  console.log("[GIFT-CARD-MAILER] Sending sale notification for:", giftCard.code);
  
  const tx = getTransport();
  if (!tx) {
    console.warn("[GIFT-CARD-MAILER] No transport - skipping sale notification");
    return;
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const purchaseDate = new Date(giftCard.purchaseDate).toLocaleDateString("en-GB", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const amount = formatCurrency(giftCard.amount, giftCard.currency);
  const businessName = tenant?.businessName || tenant?.name || "Your Salon";
  
  // Send to specialist if specified, otherwise to tenant admin
  const recipientEmail = specialist?.email || tenant?.email;
  const recipientName = specialist?.name || "Salon Team";

  if (!recipientEmail) {
    console.warn("[GIFT-CARD-MAILER] No recipient email for sale notification");
    return;
  }

  const textContent = `Hi ${recipientName},

Great news! A new gift card has been purchased for ${businessName}.

GIFT CARD SALE DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Code: ${giftCard.code}
Amount: ${amount}
Purchase Date: ${purchaseDate}

PURCHASER INFORMATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Name: ${giftCard.purchaserName}
Email: ${giftCard.purchaserEmail}

RECIPIENT INFORMATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Name: ${giftCard.recipientName}
Email: ${giftCard.recipientEmail}

The recipient has been notified and can now use this gift card to book services with you.

This gift card will appear in your dashboard and will be automatically applied when the recipient books using the code.

Best regards,
Booking System`;

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Gift Card Sale</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #43cea2 0%, #185a9d 100%); padding: 40px 30px; text-align: center;">
              <div style="font-size: 60px; margin-bottom: 15px;">💰</div>
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">
                New Gift Card Sale!
              </h1>
              <p style="margin: 15px 0 0; color: #ffffff; font-size: 16px; opacity: 0.95;">
                ${businessName}
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px; color: #333333; font-size: 16px; line-height: 1.6;">
                Hi <strong>${recipientName}</strong>,
              </p>
              
              <p style="margin: 0 0 30px; color: #666666; font-size: 15px; line-height: 1.6;">
                Great news! A new gift card has been purchased for your business.
              </p>

              <!-- Sale Amount Box -->
              <div style="background: linear-gradient(135deg, #43cea2 0%, #185a9d 100%); border-radius: 12px; padding: 30px; text-align: center; margin: 30px 0;">
                <p style="margin: 0 0 10px; color: #ffffff; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; opacity: 0.9;">
                  Sale Amount
                </p>
                <p style="margin: 0; color: #ffffff; font-size: 42px; font-weight: 700;">
                  ${amount}
                </p>
                <p style="margin: 15px 0 0; color: #ffffff; font-size: 16px; opacity: 0.9;">
                  Code: ${giftCard.code}
                </p>
              </div>

              <!-- Purchaser Info -->
              <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin: 30px 0;">
                <h3 style="margin: 0 0 15px; color: #333333; font-size: 18px; font-weight: 600;">
                  Purchaser Information
                </h3>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: #666666; font-size: 14px;">Name:</td>
                    <td style="padding: 8px 0; color: #333333; font-size: 14px; font-weight: 600; text-align: right;">${giftCard.purchaserName}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666666; font-size: 14px;">Email:</td>
                    <td style="padding: 8px 0; color: #333333; font-size: 14px; font-weight: 600; text-align: right;">${giftCard.purchaserEmail}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666666; font-size: 14px;">Purchase Date:</td>
                    <td style="padding: 8px 0; color: #333333; font-size: 14px; font-weight: 600; text-align: right;">${purchaseDate}</td>
                  </tr>
                </table>
              </div>

              <!-- Recipient Info -->
              <div style="background-color: #e8f5e9; border-left: 4px solid #43cea2; border-radius: 4px; padding: 20px; margin: 30px 0;">
                <h3 style="margin: 0 0 15px; color: #333333; font-size: 18px; font-weight: 600;">
                  Gift Card Recipient
                </h3>
                <p style="margin: 0 0 8px; color: #666666; font-size: 14px;">
                  <strong style="color: #333333;">Name:</strong> ${giftCard.recipientName}
                </p>
                <p style="margin: 0; color: #666666; font-size: 14px;">
                  <strong style="color: #333333;">Email:</strong> ${giftCard.recipientEmail}
                </p>
              </div>

              <!-- Info Box -->
              <div style="background-color: #e3f2fd; border-radius: 8px; padding: 20px; margin: 30px 0;">
                <p style="margin: 0; color: #1565c0; font-size: 14px; line-height: 1.6;">
                  <strong>ℹ️ What happens next?</strong><br><br>
                  The recipient has been notified via email and can now use this gift card to book services with you. The gift card will be automatically applied when they enter the code during checkout.
                </p>
              </div>

              <p style="margin: 30px 0 0; color: #666666; font-size: 14px; line-height: 1.6; text-align: center;">
                Keep up the great work! 🎉
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8f9fa; padding: 30px; text-align: center; border-top: 1px solid #e0e0e0;">
              <p style="margin: 0 0 10px; color: #333333; font-size: 16px; font-weight: 600;">
                ${businessName}
              </p>
              <p style="margin: 0; color: #999999; font-size: 12px;">
                This is an automated notification from your booking system.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  try {
    await tx.sendMail({
      from,
      to: recipientEmail,
      subject: `💰 New Gift Card Sale - ${amount}`,
      text: textContent,
      html: htmlContent,
    });
    console.log("[GIFT-CARD-MAILER] Sale notification sent to:", recipientEmail);
  } catch (error) {
    console.error("[GIFT-CARD-MAILER] Failed to send sale notification:", error);
    throw error;
  }
}
