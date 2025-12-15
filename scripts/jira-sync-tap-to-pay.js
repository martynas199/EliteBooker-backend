#!/usr/bin/env node

/**
 * JIRA Sync Script - Tap to Pay Feature Tasks
 *
 * Syncs Tap to Pay implementation tasks to JIRA as:
 * - 1 Epic (Tap to Pay)
 * - 10 Stories (implementation tasks)
 * - Subtasks for acceptance criteria
 *
 * Usage:
 *   node scripts/jira-sync-tap-to-pay.js
 *
 * Required ENV variables:
 *   JIRA_HOST=yourcompany.atlassian.net
 *   JIRA_EMAIL=your@email.com
 *   JIRA_API_TOKEN=your_token_here
 *   JIRA_PROJECT_KEY=SMP
 */

import { Version3Client } from "jira.js";
import dotenv from "dotenv";

dotenv.config();

// Configuration
const config = {
  host: process.env.JIRA_HOST,
  authentication: {
    basic: {
      email: process.env.JIRA_EMAIL,
      apiToken: process.env.JIRA_API_TOKEN,
    },
  },
};

const PROJECT_KEY = process.env.JIRA_PROJECT_KEY || "SMP";

// Tasks definition
const tasks = [
  {
    title: "Add Authentication Checks to Payment Routes",
    priority: "Highest",
    storyPoints: 1,
    estimate: "0.5-1 hour",
    labels: ["tap-to-pay", "backend", "security", "critical"],
    description: `Payment API routes currently access req.user without validation, causing crashes if user is not authenticated. Add authentication checks to all 7 endpoints.

**Files**: booking-backend/src/routes/payments.js

**Technical Details**:
- Currently routes access req.user.tenantId and req.user.userId without checking if req.user exists
- Need to add validation at the start of each route handler
- Return 401 Unauthorized with proper error message if not authenticated`,
    acceptanceCriteria: [
      "Add if (!req.user) return res.status(401) to POST /api/payments/intents (line 50)",
      "Add auth check to POST /api/payments/confirm (line 249)",
      "Add auth check to GET /api/payments/status/:paymentIntentId (line 328)",
      "Add auth check to POST /api/payments/refund (line 394)",
      "Add auth check to GET /api/payments (line 539)",
      "Add auth check to GET /api/payments/:id (line 609)",
      "Add auth check to GET /api/payments/appointments/today (line 660)",
      "Test each endpoint with and without auth token",
      "Verify proper 401 error messages",
    ],
  },
  {
    title: "Add Role-Based Permissions for Specialists",
    priority: "Highest",
    storyPoints: 2,
    estimate: "1-2 hours",
    labels: ["tap-to-pay", "backend", "security", "critical"],
    description: `Specialists should only be able to process payments for their own appointments. Add role filtering to prevent specialists from accessing other staff members' appointments.

**Files**: booking-backend/src/routes/payments.js (lines 660-730, 50-245)

**Technical Details**:
- Check req.user.role in GET /appointments/today endpoint
- Filter appointments by beautician: req.user.userId if role is 'specialist'
- Owners and managers should see all appointments
- Add permission check in POST /intents to verify appointment ownership`,
    acceptanceCriteria: [
      "In GET /appointments/today, filter appointments by beautician: req.user.userId if role is specialist",
      "In POST /intents, verify appointment belongs to specialist if role is specialist",
      "Return 403 Forbidden if specialist tries to process another person's appointment",
      "Owners and managers can process all payments",
      "Add unit tests for role filtering",
      "Document permission matrix in API docs",
    ],
  },
  {
    title: "End-to-End Testing of Payment Flow",
    priority: "High",
    storyPoints: 3,
    estimate: "2-3 hours",
    labels: ["tap-to-pay", "testing", "qa", "critical"],
    description: `Comprehensive testing of the complete payment workflow from appointment selection through receipt generation.

**Test Environment**:
- Local development (both backend and frontend running)
- Stripe test mode
- Test user accounts (owner, manager, specialist)
- Sample appointments in database`,
    acceptanceCriteria: [
      "Login as owner/manager",
      'Navigate to "Take Payment" menu',
      "Select today's appointment",
      "Enter amount and 10% tip",
      "Simulate NFC payment",
      "Verify success screen shows receipt number",
      "Check MongoDB: payment record created with correct status",
      'Check appointment: status updated to "paid"',
      "Test custom payment (no appointment)",
      "Test with multiple currency values",
      "Test cancellation during NFC tap",
      "Test failure scenarios",
      "Test specialist role (can only see own appointments)",
      "Test webhook processing",
    ],
  },
  {
    title: "Integrate Stripe Terminal SDK",
    priority: "High",
    storyPoints: 8,
    estimate: "6-8 hours",
    labels: ["tap-to-pay", "frontend", "stripe", "high"],
    description: `Replace polling simulation with real Stripe Terminal SDK for physical card readers and NFC payments.

**References**:
- https://stripe.com/docs/terminal
- https://stripe.com/docs/js/terminal
- https://github.com/stripe/stripe-terminal-react-native

**Files**: 
- booking-frontend/src/tenant/pages/TakePaymentPage.jsx
- New: booking-frontend/src/services/terminalService.js

**Hardware Needed**:
- Stripe test card reader (BBPOS WisePad 3 or similar)
- Test credit cards`,
    acceptanceCriteria: [
      "Install @stripe/terminal-js or @stripe/terminal-react-native",
      "Create terminal configuration service",
      "Implement reader discovery UI",
      "Add connection state management (connected/disconnected/discovering)",
      "Replace pollPaymentStatus() with Terminal SDK event listeners",
      "Handle payment_intent_succeeded event",
      "Handle payment_intent_payment_failed event",
      "Add device capability checks (NFC support detection)",
      "Test with Stripe test card reader (BBPOS WisePad 3)",
      "Add error handling for reader connection issues",
      "Update documentation with hardware requirements",
    ],
  },
  {
    title: "Build Receipt Generation Service",
    priority: "High",
    storyPoints: 5,
    estimate: "4-5 hours",
    labels: ["tap-to-pay", "backend", "receipts", "high"],
    description: `Create receipt service to generate PDFs and send via email/SMS.

**Dependencies**: 
- npm install pdfkit
- Existing mailer service
- Existing SMS service

**Files**:
- New: booking-backend/src/services/receiptService.js
- booking-backend/src/routes/webhooks.js (call receipt service on success)
- booking-backend/src/models/Payment.js (add receiptUrl field)`,
    acceptanceCriteria: [
      "Create booking-backend/src/services/receiptService.js",
      "Install PDFKit: npm install pdfkit",
      "Design receipt template (logo, business details, payment info, card details)",
      "Implement generatePDF(payment) function",
      "Integrate with existing mailer service (sendEmail())",
      "Integrate with existing SMS service (sendSMS())",
      "Add receipt branding (tenant logo, colors)",
      "Generate receipts for successful payments automatically",
      "Store receipt PDFs in Cloudinary or local storage",
      "Add receipt URL to payment record",
      "Add retry logic for failed deliveries",
      "Test email delivery",
      "Test SMS delivery with PDF link",
    ],
  },
  {
    title: "Create Payment Reports Dashboard",
    priority: "Medium",
    storyPoints: 8,
    estimate: "6-8 hours",
    labels: ["tap-to-pay", "frontend", "analytics", "high"],
    description: `Admin dashboard for viewing payment history, analytics, and exporting reports.

**Features**:
- Daily/weekly/monthly revenue summaries
- Payment list with filters
- Export to CSV/PDF
- Charts and analytics

**Files**:
- New: booking-frontend/src/admin/pages/PaymentReports.jsx
- booking-backend/src/routes/payments.js (add reports endpoint)
- booking-frontend/src/app/routes.jsx
- booking-frontend/src/admin/components/Sidebar.jsx`,
    acceptanceCriteria: [
      "Create booking-frontend/src/admin/pages/PaymentReports.jsx",
      "Build summary cards (today's revenue, week, month)",
      "Create filterable payment table",
      "Add date range picker",
      "Implement CSV export (client-side)",
      "Implement PDF export (server-side with PDFKit)",
      "Add charts with Recharts or Chart.js",
      "Add pagination for payment list",
      "Add search by receipt number or client name",
      "Create backend API: GET /api/payments/reports/summary",
      "Add route to admin routes.jsx",
      'Add "Payment Reports" to sidebar menu',
    ],
  },
  {
    title: "Add Refund UI in Admin Panel",
    priority: "Medium",
    storyPoints: 3,
    estimate: "2-3 hours",
    labels: ["tap-to-pay", "frontend", "refunds", "high"],
    description: `Build user interface for issuing refunds. Backend refund endpoint already exists at POST /api/payments/refund.

**Files**:
- New: booking-frontend/src/admin/components/RefundModal.jsx
- Payment details page (TBD)
- Uses existing: POST /api/payments/refund`,
    acceptanceCriteria: [
      "Create RefundModal.jsx component",
      'Add "Refund" button to payment details view',
      "Amount input (prefilled with payment total)",
      "Support partial refunds",
      "Reason dropdown (customer request, duplicate, error, etc.)",
      "Reason text area for notes",
      'Confirmation dialog ("Are you sure?")',
      "Success/error toast notifications",
      "Show refund history on payment details",
      "Add refund icon/badge on payment list for refunded payments",
      "Restrict to owner/manager roles only",
    ],
  },
  {
    title: "Add Feature Flag for Tap-to-Pay",
    priority: "Medium",
    storyPoints: 2,
    estimate: "1-2 hours",
    labels: ["tap-to-pay", "backend", "feature-flags", "medium"],
    description: `Add tenant-level feature flag to enable/disable Tap to Pay functionality.

**Files**:
- booking-backend/src/models/Tenant.js
- booking-backend/src/routes/payments.js
- booking-frontend/src/admin/components/Sidebar.jsx
- booking-frontend/src/admin/pages/PlatformFeatures.jsx`,
    acceptanceCriteria: [
      "Add enableTapToPay: Boolean to Tenant features schema",
      'Hide "Take Payment" menu item if feature disabled',
      "Add feature check in payment route middleware",
      "Return 403 if feature disabled for tenant",
      "Add toggle in /admin/platform-features",
      "Default to true for existing tenants",
      "Add feature description and pricing tier info",
    ],
  },
  {
    title: "Add Error Monitoring and Analytics",
    priority: "Medium",
    storyPoints: 3,
    estimate: "2-3 hours",
    labels: ["tap-to-pay", "backend", "monitoring", "medium"],
    description: `Integrate error monitoring and analytics tracking for payment events.

**Tools**:
- Sentry for error tracking
- Custom analytics service

**Files**:
- booking-backend/src/routes/payments.js
- booking-backend/src/routes/webhooks.js
- New: booking-backend/src/services/analyticsService.js`,
    acceptanceCriteria: [
      "Add Sentry error tracking for payment errors",
      "Track payment events: payment_started, payment_completed, payment_failed, payment_abandoned",
      "Add custom Sentry context (payment amount, tenant, user)",
      "Create analytics dashboard in admin (optional)",
      "Track success rate percentage",
      "Track average transaction value",
      "Track average tip percentage",
      "Alert on high failure rate (>10%)",
      "Log payment errors to MongoDB for analysis",
    ],
  },
  {
    title: "Write API Documentation",
    priority: "Low",
    storyPoints: 2,
    estimate: "1-2 hours",
    labels: ["tap-to-pay", "documentation", "medium"],
    description: `Document all payment API endpoints in Swagger/OpenAPI format.

**Tools**: 
- swagger-jsdoc
- swagger-ui-express

**Files**:
- booking-backend/src/routes/payments.js (add JSDoc comments)
- New: booking-backend/src/config/swagger.js
- New: booking-backend/docs/api/payments.md`,
    acceptanceCriteria: [
      "Install swagger-jsdoc and swagger-ui-express",
      "Document POST /api/payments/intents",
      "Document POST /api/payments/confirm",
      "Document GET /api/payments/status/:paymentIntentId",
      "Document POST /api/payments/refund",
      "Document GET /api/payments",
      "Document GET /api/payments/:id",
      "Document GET /api/payments/appointments/today",
      "Include request/response schemas",
      "Include authentication requirements",
      "Include error codes and messages",
      "Add example requests/responses",
      "Deploy Swagger UI at /api/docs",
      "Create markdown version in docs/ folder",
    ],
  },
];

async function syncToJira() {
  console.log("🚀 Starting JIRA sync for Tap to Pay tasks...\n");

  // Validate configuration
  if (
    !config.host ||
    !config.authentication.basic.email ||
    !config.authentication.basic.apiToken
  ) {
    console.error("❌ Missing JIRA configuration. Please set:");
    console.error("   JIRA_HOST, JIRA_EMAIL, JIRA_API_TOKEN in .env file\n");
    console.error("See JIRA_SETUP.md for instructions.");
    process.exit(1);
  }

  const client = new Version3Client(config);

  try {
    // Step 1: Create Epic
    console.log("📋 Creating Epic: Tap to Pay / Card Present Payments...");

    const epicData = {
      fields: {
        project: { key: PROJECT_KEY },
        summary: "Tap to Pay / Card Present Payments",
        description: `Enterprise-grade mobile payment processing with Stripe Terminal SDK integration.

**Status**: MVP Complete, Production Pending

**Components**:
- Backend: Payment model, 7 API endpoints, webhook handlers
- Frontend: 4-screen payment flow (Select → Amount → Tap → Result)
- Integration: Stripe Connect, PaymentIntent API

**Total Estimate**: 35-40 hours
**Priority**: High
**Feature**: Enables in-person card payments via NFC/tap

**Success Metrics**:
- Zero authentication errors
- Real NFC payments working
- Receipts delivered automatically
- Payment reports accessible

**Documentation**: See TAP_TO_PAY_JIRA_TASKS.md`,
        issuetype: { name: "Epic" },
        priority: { name: "High" },
        labels: ["tap-to-pay", "payments", "stripe", "nfc"],
      },
    };

    const epic = await client.issues.createIssue(epicData);
    console.log(`✅ Epic created: ${epic.key}\n`);

    // Step 2: Create Stories
    console.log("📝 Creating Stories...\n");

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];

      await new Promise((resolve) => setTimeout(resolve, 1000)); // Rate limiting

      console.log(`   ${i + 1}/${tasks.length}: ${task.title}`);

      // Build description with acceptance criteria
      let fullDescription = task.description + "\n\n**Acceptance Criteria**:\n";
      task.acceptanceCriteria.forEach((criteria) => {
        fullDescription += `- [ ] ${criteria}\n`;
      });

      const storyData = {
        fields: {
          project: { key: PROJECT_KEY },
          summary: task.title,
          description: fullDescription,
          issuetype: { name: "Task" },
          priority: { name: task.priority },
          labels: task.labels,
        },
      };

      try {
        const story = await client.issues.createIssue(storyData);
        console.log(`      ✅ Created: ${story.key}`);

        // Try to link to epic (may not work on all Jira plans)
        try {
          await client.issueLinks.linkIssues({
            inwardIssue: { key: story.key },
            outwardIssue: { key: epic.key },
            type: { name: "Relates" },
          });
        } catch (linkErr) {
          // Silent fail - linking is optional
        }
      } catch (err) {
        console.error(`      ❌ Failed: ${err.message}`);
        if (err.response?.data) {
          console.error(
            `         Details:`,
            JSON.stringify(err.response.data.errors, null, 2)
          );
        }
      }
    }

    console.log("\n✨ JIRA sync complete!\n");
    console.log(`📊 Summary:`);
    console.log(`   Epic: 1 (Tap to Pay)`);
    console.log(`   Stories: ${tasks.length}`);
    console.log(
      `   Total Story Points: ${tasks.reduce(
        (sum, t) => sum + t.storyPoints,
        0
      )}`
    );
    console.log(
      `\n🔗 View in JIRA: https://${config.host}/browse/${PROJECT_KEY}\n`
    );
  } catch (error) {
    console.error("\n❌ Error syncing to JIRA:", error.message);

    if (error.message.includes("authentication")) {
      console.error("\n💡 Authentication failed. Check your API token.");
      console.error(
        "   Generate new token: https://id.atlassian.com/manage-profile/security/api-tokens\n"
      );
    } else if (error.message.includes("project")) {
      console.error(
        `\n💡 Project "${PROJECT_KEY}" not found. Check JIRA_PROJECT_KEY in .env\n`
      );
    }

    process.exit(1);
  }
}

// Run sync
syncToJira();
