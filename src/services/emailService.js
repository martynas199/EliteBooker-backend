import nodemailer from 'nodemailer';

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransporter({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      secure: process.env.EMAIL_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      }
    });
  }

  /**
   * Send consent form to client
   */
  async sendConsentFormEmail({ to, clientName, templateName, pdfUrl }) {
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
            <p>Hi ${clientName},</p>
            <p>We need you to review and sign the following consent form:</p>
            <p><strong>${templateName}</strong></p>
            <p>Please click the button below to view and sign the form:</p>
            <p style="text-align: center;">
              <a href="${pdfUrl}" class="button">View & Download Consent Form</a>
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
    
    try {
      await this.transporter.sendMail({
        from: process.env.EMAIL_FROM || 'noreply@elitebooker.com',
        to,
        subject,
        html
      });
      
      console.log(`Consent form email sent to ${to}`);
      return true;
    } catch (error) {
      console.error('Error sending consent form email:', error);
      throw error;
    }
  }

  /**
   * Send consent link for signing (before appointment)
   */
  async sendConsentSigningLink({ to, clientName, templateName, consentLink, appointmentDate }) {
    const subject = `Please Sign Consent Form Before Your Appointment`;
    
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
            <p>Hi ${clientName},</p>
            <p>Your appointment is coming up ${appointmentDate ? `on ${appointmentDate}` : 'soon'}!</p>
            <div class="highlight">
              <strong>Action Required:</strong> Please sign the consent form before your appointment.
            </div>
            <p><strong>Consent Form:</strong> ${templateName}</p>
            <p>This is a quick process that will only take a few minutes. Simply:</p>
            <ol>
              <li>Click the button below</li>
              <li>Review the consent form</li>
              <li>Sign with your finger or mouse</li>
              <li>Submit</li>
            </ol>
            <p style="text-align: center;">
              <a href="${consentLink}" class="button">Sign Consent Form Now</a>
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
    
    try {
      await this.transporter.sendMail({
        from: process.env.EMAIL_FROM || 'noreply@elitebooker.com',
        to,
        subject,
        html
      });
      
      console.log(`Consent signing link sent to ${to}`);
      return true;
    } catch (error) {
      console.error('Error sending consent signing link:', error);
      throw error;
    }
  }

  /**
   * Send consent confirmation (after signing)
   */
  async sendConsentConfirmation({ to, clientName, templateName, pdfUrl }) {
    const subject = `Consent Form Signed Successfully`;
    
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
            <p>Hi ${clientName},</p>
            <div class="success">
              <strong>Success!</strong> You have successfully signed the consent form.
            </div>
            <p><strong>Form:</strong> ${templateName}</p>
            <p>A copy of your signed consent form is available for download:</p>
            <p style="text-align: center;">
              <a href="${pdfUrl}" class="button">Download Signed Copy</a>
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
    
    try {
      await this.transporter.sendMail({
        from: process.env.EMAIL_FROM || 'noreply@elitebooker.com',
        to,
        subject,
        html
      });
      
      console.log(`Consent confirmation sent to ${to}`);
      return true;
    } catch (error) {
      console.error('Error sending consent confirmation:', error);
      throw error;
    }
  }
}

export default new EmailService();
