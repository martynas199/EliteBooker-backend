import puppeteer from "puppeteer";
import chromium from "@sparticuz/chromium";
import crypto from "crypto";

class PDFGenerationService {
  constructor() {
    this.browser = null;
  }

  /**
   * Initialize browser (reuse for performance)
   */
  async initBrowser() {
    if (!this.browser) {
      const launchOptions = {
        headless: chromium.headless,
        args: [
          ...chromium.args,
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--disable-software-rasterizer",
          "--disable-extensions",
        ],
        executablePath: await chromium.executablePath(),
      };

      this.browser = await puppeteer.launch(launchOptions);
    }
    return this.browser;
  }

  /**
   * Close browser
   */
  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Generate consent form PDF from template and signature data
   */
  async generateConsentPDF(consentData) {
    const {
      templateName,
      templateVersion,
      sections,
      signedByName,
      signatureData,
      signedAt,
      ipAddress,
      userAgent,
      clientName,
      businessName,
      businessLogo,
    } = consentData;

    try {
      const browser = await this.initBrowser();
      const page = await browser.newPage();

      // Generate HTML content
      const html = this.generateHTML(consentData);

      // Set page content
      await page.setContent(html, {
        waitUntil: "networkidle0",
      });

      // Generate PDF
      const pdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: {
          top: "20mm",
          right: "15mm",
          bottom: "20mm",
          left: "15mm",
        },
        displayHeaderFooter: false, // Disable header/footer to avoid encoding issues
      });

      await page.close();

      return pdfBuffer;
    } catch (error) {
      console.error("Error generating consent PDF:", error);
      throw new Error(`Failed to generate PDF: ${error.message}`);
    }
  }

  /**
   * Generate HTML content for PDF
   */
  generateHTML(consentData) {
    const {
      templateName,
      templateVersion,
      sections = [],
      signedByName,
      signatureData,
      signedAt,
      ipAddress = "Not recorded",
      userAgent = "Not recorded",
      clientName,
      businessName,
      businessLogo,
    } = consentData;

    const sectionsHTML = sections
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map((section) => this.renderSection(section))
      .join("\n");

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${templateName} - Consent Form</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: 'Helvetica', 'Arial', sans-serif;
            font-size: 11pt;
            line-height: 1.6;
            color: #333;
            background: #fff;
          }
          
          .header {
            text-align: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 2px solid #4F46E5;
          }
          
          .logo {
            max-width: 150px;
            max-height: 60px;
            margin-bottom: 15px;
          }
          
          .business-name {
            font-size: 18pt;
            font-weight: bold;
            color: #1F2937;
            margin-bottom: 5px;
          }
          
          .document-title {
            font-size: 16pt;
            font-weight: bold;
            color: #4F46E5;
            margin-top: 15px;
          }
          
          .document-meta {
            font-size: 9pt;
            color: #6B7280;
            margin-top: 8px;
          }
          
          .client-info {
            background: #F3F4F6;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 25px;
            border-left: 4px solid #4F46E5;
          }
          
          .client-info h3 {
            font-size: 12pt;
            color: #1F2937;
            margin-bottom: 8px;
          }
          
          .client-info p {
            font-size: 10pt;
            color: #4B5563;
            margin: 3px 0;
          }
          
          .content {
            margin-bottom: 30px;
          }
          
          .section {
            margin-bottom: 20px;
            page-break-inside: avoid;
          }
          
          .section-header {
            font-size: 13pt;
            font-weight: bold;
            color: #1F2937;
            margin-bottom: 10px;
            padding-bottom: 5px;
            border-bottom: 1px solid #E5E7EB;
          }
          
          .section-paragraph {
            text-align: justify;
            margin-bottom: 12px;
          }
          
          .section-list {
            margin-left: 25px;
            margin-bottom: 12px;
          }
          
          .section-list li {
            margin-bottom: 6px;
          }
          
          .section-declaration {
            background: #FEF3C7;
            padding: 12px;
            border-left: 4px solid #F59E0B;
            margin: 15px 0;
            font-weight: 600;
          }
          
          .section-checkbox {
            margin: 12px 0;
            display: flex;
            align-items: flex-start;
          }
          
          .checkbox {
            width: 16px;
            height: 16px;
            border: 2px solid #4F46E5;
            margin-right: 10px;
            flex-shrink: 0;
            margin-top: 2px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            line-height: 1;
            color: #4F46E5;
          }
          
          .signature-section {
            margin-top: 40px;
            page-break-inside: avoid;
            border: 2px solid #4F46E5;
            padding: 20px;
            background: #F9FAFB;
          }
          
          .signature-section h3 {
            font-size: 13pt;
            color: #1F2937;
            margin-bottom: 20px;
            text-align: center;
          }
          
          .signature-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 20px;
          }
          
          .signature-field {
            margin-bottom: 15px;
          }
          
          .signature-label {
            font-size: 10pt;
            color: #6B7280;
            font-weight: 600;
            margin-bottom: 5px;
          }
          
          .signature-value {
            font-size: 11pt;
            color: #1F2937;
            padding: 8px;
            background: #fff;
            border: 1px solid #D1D5DB;
            border-radius: 4px;
          }
          
          .signature-image {
            max-width: 300px;
            height: auto;
            border: 1px solid #D1D5DB;
            padding: 10px;
            background: #fff;
            margin: 15px auto;
            display: block;
          }
          
          .audit-trail {
            margin-top: 30px;
            padding: 15px;
            background: #F9FAFB;
            border: 1px solid #E5E7EB;
            border-radius: 4px;
            font-size: 9pt;
            color: #6B7280;
          }
          
          .audit-trail h4 {
            font-size: 10pt;
            color: #4B5563;
            margin-bottom: 8px;
          }
          
          .audit-trail p {
            margin: 3px 0;
          }
          
          .legal-notice {
            margin-top: 25px;
            padding: 12px;
            background: #FEE2E2;
            border-left: 4px solid #EF4444;
            font-size: 9pt;
            color: #7F1D1D;
            font-style: italic;
          }
          
          @media print {
            body {
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
          }
        </style>
      </head>
      <body>
        <div class="header">
          ${
            businessLogo
              ? `<img src="${businessLogo}" alt="${businessName}" class="logo">`
              : ""
          }
          <div class="business-name">${businessName}</div>
          <div class="document-title">${templateName}</div>
          <div class="document-meta">
            Version ${templateVersion} | Generated ${new Date().toLocaleDateString(
      "en-GB"
    )}
          </div>
        </div>
        
        <div class="client-info">
          <h3>Client Information</h3>
          <p><strong>Name:</strong> ${clientName}</p>
          <p><strong>Date:</strong> ${new Date(signedAt).toLocaleDateString(
            "en-GB",
            {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            }
          )}</p>
        </div>
        
        <div class="content">
          ${sectionsHTML}
        </div>
        
        <div class="signature-section">
          <h3>Digital Signature & Consent</h3>
          
          <div class="signature-grid">
            <div class="signature-field">
              <div class="signature-label">Full Name</div>
              <div class="signature-value">${signedByName}</div>
            </div>
            
            <div class="signature-field">
              <div class="signature-label">Date & Time</div>
              <div class="signature-value">${new Date(signedAt).toLocaleString(
                "en-GB",
                {
                  dateStyle: "long",
                  timeStyle: "medium",
                }
              )}</div>
            </div>
          </div>
          
          <div class="signature-field">
            <div class="signature-label">Electronic Signature</div>
            <img src="${signatureData}" alt="Signature" class="signature-image">
          </div>
        </div>
        
        <div class="legal-notice">
          <strong>Legal Notice:</strong> This document was electronically signed and is legally binding. 
          The digital signature has been captured and verified. This consent form is stored securely 
          in accordance with GDPR and data protection regulations. The signature cannot be altered 
          without detection due to cryptographic hashing. For verification or queries, please contact 
          ${businessName}.
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Render individual section based on type
   */
  renderSection(section) {
    switch (section.type) {
      case "header":
        return `<div class="section"><h2 class="section-header">${section.content}</h2></div>`;

      case "paragraph":
        return `<div class="section"><p class="section-paragraph">${section.content}</p></div>`;

      case "list":
        if (section.options && Array.isArray(section.options)) {
          const items = section.options
            .map((item) => `<li>${item}</li>`)
            .join("\n");
          return `
            <div class="section">
              <p class="section-paragraph"><strong>${section.content}</strong></p>
              <ul class="section-list">${items}</ul>
            </div>
          `;
        }
        return `<div class="section"><p class="section-paragraph">• ${section.content}</p></div>`;

      case "declaration":
        return `<div class="section"><div class="section-declaration">${section.content}</div></div>`;

      case "checkbox":
        return `
          <div class="section">
            <div class="section-checkbox">
              <div class="checkbox">✓</div>
              <span>${section.content}</span>
            </div>
          </div>
        `;

      default:
        return `<div class="section"><p>${section.content}</p></div>`;
    }
  }

  /**
   * Parse user agent to readable device info
   */
  parseUserAgent(userAgent) {
    if (!userAgent) return "Unknown Device";

    // Basic parsing - can be enhanced with a library like ua-parser-js
    if (userAgent.includes("iPhone")) return "iPhone";
    if (userAgent.includes("iPad")) return "iPad";
    if (userAgent.includes("Android")) return "Android Device";
    if (userAgent.includes("Windows")) return "Windows PC";
    if (userAgent.includes("Macintosh")) return "Mac";
    if (userAgent.includes("Linux")) return "Linux";

    return "Web Browser";
  }

  /**
   * Generate preview image of consent form (for thumbnails)
   */
  async generatePreviewImage(consentData, width = 400) {
    try {
      const browser = await this.initBrowser();
      const page = await browser.newPage();

      await page.setViewport({
        width: width,
        height: Math.floor(width * 1.414), // A4 ratio
        deviceScaleFactor: 2,
      });

      const html = this.generateHTML(consentData);
      await page.setContent(html, { waitUntil: "networkidle0" });

      const screenshot = await page.screenshot({
        type: "png",
        fullPage: false,
      });

      await page.close();

      return screenshot;
    } catch (error) {
      console.error("Error generating preview image:", error);
      throw new Error(`Failed to generate preview: ${error.message}`);
    }
  }
}

// Export singleton instance
export default new PDFGenerationService();
