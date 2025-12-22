import { Router } from "express";
import nodemailer from "nodemailer";

const r = Router();

// Get SMTP transport
function getTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.warn("[SUPPORT] SMTP not configured - cannot send support emails");
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

// POST /support/contact - Send support message
r.post("/contact", async (req, res) => {
  try {
    const { name, email, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const transport = getTransport();

    if (!transport) {
      return res.status(500).json({ error: "Email service not configured" });
    }

    const from = process.env.SMTP_FROM || process.env.SMTP_USER;
    const supportEmail = process.env.SUPPORT_EMAIL || "martynas.20@hotmail.com";

    // Send email to support
    await transport.sendMail({
      from,
      to: supportEmail,
      subject: `Support Request from ${name}`,
      text: `
Name: ${name}
Email: ${email}

Message:
${message}
      `,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
              <!-- Header -->
              <div style="background: linear-gradient(135deg, #3B82F6 0%, #2563EB 100%); padding: 30px 20px; text-align: center;">
                <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Support Request</h1>
              </div>

              <!-- Content -->
              <div style="padding: 30px 20px;">
                <div style="background-color: #f9fafb; border-left: 4px solid #3B82F6; padding: 20px; margin: 20px 0; border-radius: 8px;">
                  <p style="margin: 0 0 10px 0; color: #374151; font-weight: 600;">From:</p>
                  <p style="margin: 0 0 5px 0; color: #111827; font-size: 16px;">${name}</p>
                  <p style="margin: 0; color: #6b7280; font-size: 14px;">${email}</p>
                </div>

                <div style="margin: 20px 0;">
                  <p style="margin: 0 0 10px 0; color: #374151; font-weight: 600;">Message:</p>
                  <p style="margin: 0; color: #111827; line-height: 1.6; white-space: pre-wrap;">${message}</p>
                </div>
              </div>

              <!-- Footer -->
              <div style="background-color: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
                <p style="color: #6b7280; font-size: 13px; margin: 0;">
                  Elite Booker Support System
                </p>
              </div>
            </div>
          </body>
        </html>
      `,
    });

    console.log(`[SUPPORT] Support email sent from ${name} (${email})`);

    res.json({ success: true, message: "Support request sent successfully" });
  } catch (error) {
    console.error("[SUPPORT] Error sending support email:", error);
    res.status(500).json({ error: "Failed to send support request" });
  }
});

export default r;
