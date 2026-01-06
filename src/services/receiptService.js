/**
 * Receipt Service
 * Handles receipt generation and delivery (email, SMS, PDF)
 */

import { sendEmail } from "../emails/mailer.js";
import { sendSMS } from "../utils/smsService.js";
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Generate PDF receipt
 * @param {Object} payment - Payment document with populated fields
 * @param {Object} tenant - Tenant document
 * @returns {Promise<Buffer>} PDF buffer
 */
export async function generateReceiptPDF(payment, tenant) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 50 });
      const buffers = [];

      doc.on("data", buffers.push.bind(buffers));
      doc.on("end", () => {
        const pdfBuffer = Buffer.concat(buffers);
        resolve(pdfBuffer);
      });

      // Header
      doc
        .fontSize(20)
        .font("Helvetica-Bold")
        .text(tenant.businessName || "Payment Receipt", 50, 50);

      doc
        .fontSize(10)
        .font("Helvetica")
        .text(`${tenant.address || ""}`, 50, 80);

      if (tenant.phone) {
        doc.text(`Phone: ${tenant.phone}`, 50, 95);
      }
      if (tenant.email) {
        doc.text(`Email: ${tenant.email}`, 50, 110);
      }

      // Receipt info
      doc.moveTo(50, 140).lineTo(550, 140).stroke();

      doc
        .fontSize(14)
        .font("Helvetica-Bold")
        .text(`Receipt #${payment.receipt.receiptNumber}`, 50, 160);

      doc
        .fontSize(10)
        .font("Helvetica")
        .text(
          `Date: ${payment.processedAt.toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}`,
          50,
          180
        );

      doc.text(
        `Payment Method: ${
          payment.method === "tap_to_pay"
            ? "Card Payment (Tap to Pay)"
            : payment.method
        }`,
        50,
        195
      );

      if (payment.stripe.cardBrand && payment.stripe.cardLast4) {
        doc.text(
          `Card: ${payment.stripe.cardBrand.toUpperCase()} •••• ${
            payment.stripe.cardLast4
          }`,
          50,
          210
        );
      }

      // Client info
      doc.moveTo(50, 240).lineTo(550, 240).stroke();

      doc.fontSize(12).font("Helvetica-Bold").text("Bill To:", 50, 260);

      const clientName = payment.client
        ? `${payment.client.firstName} ${payment.client.lastName}`
        : "Walk-in Client";
      doc.fontSize(10).font("Helvetica").text(clientName, 50, 280);

      if (payment.client?.email) {
        doc.text(payment.client.email, 50, 295);
      }
      if (payment.client?.phone) {
        doc.text(payment.client.phone, 50, 310);
      }

      // Services/Items
      doc.moveTo(50, 340).lineTo(550, 340).stroke();

      doc.fontSize(12).font("Helvetica-Bold").text("Services", 50, 360);

      let yPos = 390;

      if (payment.metadata?.services && payment.metadata.services.length > 0) {
        payment.metadata.services.forEach((service) => {
          doc
            .fontSize(10)
            .font("Helvetica")
            .text(service.name, 50, yPos, { width: 300 });
          doc.text(`£${((service.price || 0) / 100).toFixed(2)}`, 450, yPos, {
            width: 100,
            align: "right",
          });
          yPos += 20;
        });
      } else {
        doc.fontSize(10).font("Helvetica").text("Custom Payment", 50, yPos);
        doc.text(`£${(payment.amount / 100).toFixed(2)}`, 450, yPos, {
          width: 100,
          align: "right",
        });
        yPos += 20;
      }

      // Totals
      yPos += 20;
      doc.moveTo(50, yPos).lineTo(550, yPos).stroke();
      yPos += 20;

      doc.fontSize(10).font("Helvetica").text("Subtotal:", 350, yPos);
      doc.text(`£${(payment.amount / 100).toFixed(2)}`, 450, yPos, {
        width: 100,
        align: "right",
      });
      yPos += 20;

      if (payment.tip > 0) {
        doc.text("Tip:", 350, yPos);
        doc.text(`£${(payment.tip / 100).toFixed(2)}`, 450, yPos, {
          width: 100,
          align: "right",
        });
        yPos += 20;
      }

      doc.moveTo(350, yPos).lineTo(550, yPos).stroke();
      yPos += 20;

      doc.fontSize(14).font("Helvetica-Bold").text("Total Paid:", 350, yPos);
      doc.text(`£${(payment.total / 100).toFixed(2)}`, 450, yPos, {
        width: 100,
        align: "right",
      });

      // Payment Status
      if (
        payment.status === "refunded" ||
        payment.status === "partially_refunded"
      ) {
        yPos += 40;
        doc
          .fontSize(10)
          .font("Helvetica")
          .fillColor("red")
          .text(
            `Status: ${payment.status.replace("_", " ").toUpperCase()}`,
            50,
            yPos
          );

        if (payment.refunds && payment.refunds.length > 0) {
          yPos += 20;
          payment.refunds.forEach((refund) => {
            doc.text(
              `Refunded: £${(refund.amount / 100).toFixed(
                2
              )} on ${refund.processedAt.toLocaleDateString("en-GB")}`,
              50,
              yPos
            );
            yPos += 15;
          });
        }
        doc.fillColor("black");
      }

      // Footer
      doc
        .fontSize(8)
        .font("Helvetica")
        .text("Thank you for your business!", 50, doc.page.height - 100, {
          align: "center",
        });

      doc.text(
        "This is a computer-generated receipt and does not require a signature.",
        50,
        doc.page.height - 80,
        { align: "center" }
      );

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Send receipt via email
 * @param {Object} payment - Payment document with populated fields
 * @param {Object} tenant - Tenant document
 * @param {string} recipientEmail - Email address to send to
 * @returns {Promise<void>}
 */
export async function sendReceiptEmail(payment, tenant, recipientEmail) {
  try {
    // Generate PDF
    const pdfBuffer = await generateReceiptPDF(payment, tenant);

    // Email content
    const subject = `Receipt #${payment.receipt.receiptNumber} - ${
      tenant.businessName || "Payment Receipt"
    }`;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .receipt-box { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          .amount { font-size: 32px; font-weight: bold; color: #667eea; margin: 10px 0; }
          .details { margin: 15px 0; }
          .details-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
          .footer { text-align: center; color: #666; font-size: 12px; margin-top: 30px; }
          .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Payment Receipt</h1>
            <p>${tenant.businessName || ""}</p>
          </div>
          
          <div class="content">
            <div class="receipt-box">
              <h2 style="margin-top: 0;">Receipt #${
                payment.receipt.receiptNumber
              }</h2>
              
              <div class="amount">£${(payment.total / 100).toFixed(2)}</div>
              
              <div class="details">
                <div class="details-row">
                  <span>Date:</span>
                  <strong>${payment.processedAt.toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}</strong>
                </div>
                
                <div class="details-row">
                  <span>Payment Method:</span>
                  <strong>${
                    payment.method === "tap_to_pay"
                      ? "Card Payment"
                      : payment.method
                  }</strong>
                </div>
                
                ${
                  payment.stripe.cardBrand && payment.stripe.cardLast4
                    ? `
                <div class="details-row">
                  <span>Card:</span>
                  <strong>${payment.stripe.cardBrand.toUpperCase()} •••• ${
                        payment.stripe.cardLast4
                      }</strong>
                </div>
                `
                    : ""
                }
                
                <div class="details-row">
                  <span>Subtotal:</span>
                  <strong>£${(payment.amount / 100).toFixed(2)}</strong>
                </div>
                
                ${
                  payment.tip > 0
                    ? `
                <div class="details-row">
                  <span>Tip:</span>
                  <strong>£${(payment.tip / 100).toFixed(2)}</strong>
                </div>
                `
                    : ""
                }
                
                <div class="details-row" style="font-size: 18px; border-top: 2px solid #667eea; margin-top: 10px; padding-top: 10px;">
                  <span>Total Paid:</span>
                  <strong>£${(payment.total / 100).toFixed(2)}</strong>
                </div>
              </div>
            </div>
            
            <p style="text-align: center; color: #666;">
              A detailed PDF receipt is attached to this email.
            </p>
            
            <div class="footer">
              <p>Thank you for your business!</p>
              <p>${tenant.businessName || ""}</p>
              ${tenant.address ? `<p>${tenant.address}</p>` : ""}
              ${tenant.phone ? `<p>Phone: ${tenant.phone}</p>` : ""}
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    const textContent = `
Payment Receipt

Receipt #${payment.receipt.receiptNumber}
${tenant.businessName || ""}

Amount Paid: £${(payment.total / 100).toFixed(2)}
Date: ${payment.processedAt.toLocaleDateString("en-GB")}
Payment Method: ${
      payment.method === "tap_to_pay" ? "Card Payment" : payment.method
    }

${
  payment.stripe.cardBrand
    ? `Card: ${payment.stripe.cardBrand.toUpperCase()} •••• ${
        payment.stripe.cardLast4
      }`
    : ""
}

Subtotal: £${(payment.amount / 100).toFixed(2)}
${payment.tip > 0 ? `Tip: £${(payment.tip / 100).toFixed(2)}` : ""}
Total: £${(payment.total / 100).toFixed(2)}

Thank you for your business!
${tenant.businessName || ""}
${tenant.address || ""}
${tenant.phone || ""}
    `;

    // Send email with PDF attachment
    await sendEmail({
      to: recipientEmail,
      subject,
      text: textContent,
      html: htmlContent,
      attachments: [
        {
          filename: `receipt-${payment.receipt.receiptNumber}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });

    console.log(`✅ Receipt email sent to ${recipientEmail}`);
  } catch (error) {
    console.error("Error sending receipt email:", error);
    throw error;
  }
}

/**
 * Send receipt via SMS
 * @param {Object} payment - Payment document with populated fields
 * @param {Object} tenant - Tenant document
 * @param {string} phoneNumber - Phone number to send to (E.164 format)
 * @returns {Promise<void>}
 */
export async function sendReceiptSMS(payment, tenant, phoneNumber) {
  try {
    const message = `${tenant.businessName || "Payment Receipt"}

Receipt #${payment.receipt.receiptNumber}
Amount: £${(payment.total / 100).toFixed(2)}
${payment.stripe.cardLast4 ? `Card: •••• ${payment.stripe.cardLast4}` : ""}
Date: ${payment.processedAt.toLocaleDateString("en-GB")}

Thank you for your business!`;

    await sendSMS(phoneNumber, message);

    console.log(`✅ Receipt SMS sent to ${phoneNumber}`);
  } catch (error) {
    console.error("Error sending receipt SMS:", error);
    throw error;
  }
}

/**
 * Send receipt via email and/or SMS
 * @param {Object} payment - Payment document with populated fields
 * @param {Object} options - Delivery options
 * @param {string} options.email - Email address (optional)
 * @param {string} options.phone - Phone number (optional)
 * @returns {Promise<Object>} Result with success/failure info
 */
export async function sendReceipt(payment, options = {}) {
  const { email, phone } = options;

  if (!email && !phone) {
    throw new Error(
      "At least one delivery method (email or phone) is required"
    );
  }

  // Populate payment if needed
  if (!payment.populated("client")) {
    await payment.populate("client", "firstName lastName email phone");
  }
  if (!payment.populated("tenant")) {
    await payment.populate("tenant", "businessName address phone email");
  }

  const tenant = payment.tenant;
  const results = {
    email: { sent: false, error: null },
    sms: { sent: false, error: null },
  };

  // Send email
  if (email) {
    try {
      await sendReceiptEmail(payment, tenant, email);
      results.email.sent = true;
    } catch (error) {
      results.email.error = error.message;
      console.error("Failed to send receipt email:", error);
    }
  }

  // Send SMS
  if (phone) {
    try {
      await sendReceiptSMS(payment, tenant, phone);
      results.sms.sent = true;
    } catch (error) {
      results.sms.error = error.message;
      console.error("Failed to send receipt SMS:", error);
    }
  }

  return results;
}

export default {
  generateReceiptPDF,
  sendReceiptEmail,
  sendReceiptSMS,
  sendReceipt,
};
