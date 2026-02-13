import {
  escapeHtml,
  getDefaultFromEmail,
  sendEmail,
} from "../emails/transport.js";

class EmailService {
  async sendConsentFormEmail({ to, clientName, templateName, pdfUrl }) {
    const safeClientName = escapeHtml(clientName);
    const safeTemplateName = escapeHtml(templateName);
    const safePdfUrl = escapeHtml(pdfUrl);
    const subject = `Consent Form Required: ${templateName}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #4F46E5; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9fafb; }
          .button {
            display: inline-block;
            background: #4F46E5;
            color: white;
            padding: 12px 30px;
            text-decoration: none;
            border-radius: 5px;
            margin: 20px 0;
          }
          .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Consent Form Required</h1>
          </div>
          <div class="content">
            <p>Hi ${safeClientName},</p>
            <p>We need you to review and sign the following consent form:</p>
            <p><strong>${safeTemplateName}</strong></p>
            <p>Please click the button below to view and sign the form:</p>
            <p style="text-align: center;">
              <a href="${safePdfUrl}" class="button">View & Download Consent Form</a>
            </p>
            <p><small>This link will expire in 1 hour for security purposes.</small></p>
            <p>If you have any questions, please don't hesitate to contact us.</p>
            <p>Best regards,<br>The Team</p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `Hi ${clientName},

We need you to review and sign the following consent form:
${templateName}

Please open this link:
${pdfUrl}

This link will expire in 1 hour for security purposes.`;

    const result = await sendEmail({
      from: getDefaultFromEmail() || "noreply@elitebooker.com",
      to,
      subject,
      html,
      text,
      loggerPrefix: "[CONSENT EMAIL]",
    });

    if (result?.skipped) {
      throw new Error("Email service not configured");
    }

    console.log(`Consent form email sent to ${to}`);
    return true;
  }

  async sendConsentSigningLink({
    to,
    clientName,
    templateName,
    consentLink,
    appointmentDate,
  }) {
    const safeClientName = escapeHtml(clientName);
    const safeTemplateName = escapeHtml(templateName);
    const safeConsentLink = escapeHtml(consentLink);
    const safeAppointmentDate = escapeHtml(appointmentDate || "soon");
    const subject = "Please Sign Consent Form Before Your Appointment";

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #4F46E5; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9fafb; }
          .highlight { background: #FEF3C7; padding: 15px; border-left: 4px solid #F59E0B; margin: 20px 0; }
          .button {
            display: inline-block;
            background: #4F46E5;
            color: white;
            padding: 12px 30px;
            text-decoration: none;
            border-radius: 5px;
            margin: 20px 0;
            font-weight: bold;
          }
          .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Consent Form Required</h1>
          </div>
          <div class="content">
            <p>Hi ${safeClientName},</p>
            <p>Your appointment is coming up on ${safeAppointmentDate}!</p>
            <div class="highlight">
              <strong>Action Required:</strong> Please sign the consent form before your appointment.
            </div>
            <p><strong>Consent Form:</strong> ${safeTemplateName}</p>
            <p>This is a quick process that will only take a few minutes. Simply:</p>
            <ol>
              <li>Click the button below</li>
              <li>Review the consent form</li>
              <li>Sign with your finger or mouse</li>
              <li>Submit</li>
            </ol>
            <p style="text-align: center;">
              <a href="${safeConsentLink}" class="button">Sign Consent Form Now</a>
            </p>
            <p><small>This link will expire in 72 hours.</small></p>
            <p>If you have any questions about the consent form, please contact us before your appointment.</p>
            <p>Thank you,<br>The Team</p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `Hi ${clientName},

Your appointment is coming up ${appointmentDate ? `on ${appointmentDate}` : "soon"}.
Please sign your consent form before your appointment:
${templateName}

Sign now:
${consentLink}

This link expires in 72 hours.`;

    const result = await sendEmail({
      from: getDefaultFromEmail() || "noreply@elitebooker.com",
      to,
      subject,
      html,
      text,
      loggerPrefix: "[CONSENT EMAIL]",
    });

    if (result?.skipped) {
      throw new Error("Email service not configured");
    }

    console.log(`Consent signing link sent to ${to}`);
    return true;
  }

  async sendConsentConfirmation({ to, clientName, templateName, pdfUrl }) {
    const safeClientName = escapeHtml(clientName);
    const safeTemplateName = escapeHtml(templateName);
    const safePdfUrl = escapeHtml(pdfUrl);
    const subject = "Consent Form Signed Successfully";

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #10B981; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9fafb; }
          .success { background: #D1FAE5; padding: 15px; border-left: 4px solid #10B981; margin: 20px 0; }
          .button {
            display: inline-block;
            background: #4F46E5;
            color: white;
            padding: 12px 30px;
            text-decoration: none;
            border-radius: 5px;
            margin: 20px 0;
          }
          .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✓ Consent Form Signed</h1>
          </div>
          <div class="content">
            <p>Hi ${safeClientName},</p>
            <div class="success">
              <strong>Success!</strong> You have successfully signed the consent form.
            </div>
            <p><strong>Form:</strong> ${safeTemplateName}</p>
            <p>A copy of your signed consent form is available for download:</p>
            <p style="text-align: center;">
              <a href="${safePdfUrl}" class="button">Download Signed Copy</a>
            </p>
            <p><small>This link will expire in 1 hour. Please download your copy now.</small></p>
            <p>Your consent form is securely stored and can be accessed at any time through your client portal.</p>
            <p>Thank you,<br>The Team</p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `Hi ${clientName},

Your consent form has been signed successfully.
Form: ${templateName}

Download your signed copy:
${pdfUrl}

This link expires in 1 hour.`;

    const result = await sendEmail({
      from: getDefaultFromEmail() || "noreply@elitebooker.com",
      to,
      subject,
      html,
      text,
      loggerPrefix: "[CONSENT EMAIL]",
    });

    if (result?.skipped) {
      throw new Error("Email service not configured");
    }

    console.log(`Consent confirmation sent to ${to}`);
    return true;
  }
}

export default new EmailService();
