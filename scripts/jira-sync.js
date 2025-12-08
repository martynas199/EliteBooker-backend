#!/usr/bin/env node
/**
 * Jira Sync Script
 * Syncs feature checklist to Jira issues
 *
 * Usage:
 *   node scripts/jira-sync.js
 *
 * Setup:
 *   1. Create API token: https://id.atlassian.com/manage-profile/security/api-tokens
 *   2. Add to .env:
 *      JIRA_HOST=yourcompany.atlassian.net
 *      JIRA_EMAIL=your@email.com
 *      JIRA_API_TOKEN=your_token_here
 *      JIRA_PROJECT_KEY=SMP
 */

import "dotenv/config";
import { Version3Client } from "jira.js";

// Jira client setup
const jira = new Version3Client({
  host: process.env.JIRA_HOST,
  authentication: {
    basic: {
      email: process.env.JIRA_EMAIL,
      apiToken: process.env.JIRA_API_TOKEN,
    },
  },
});

const PROJECT_KEY = process.env.JIRA_PROJECT_KEY || "SMP";

// Feature definitions from FEATURE_IMPLEMENTATION_STATUS.md
const FEATURES = {
  "Phase 1: MVP": [
    {
      key: "A1",
      title: "Real-Time Availability Check and Slot Locking",
      status: "COMPLETE",
      priority: "Highest",
      estimate: "0h",
      description:
        "Redis-based distributed locking system to prevent double-booking",
      labels: ["mvp", "backend", "redis", "complete"],
    },
    {
      key: "A5",
      title: "Customer Self-Service Portal (View/Cancel/Reschedule)",
      status: "PARTIAL",
      priority: "Highest",
      estimate: "8h",
      description:
        "Customer portal UI for viewing bookings, canceling, and rescheduling appointments",
      labels: ["mvp", "frontend", "customer-portal"],
      subtasks: [
        "Build CustomerPortal.jsx page",
        "Implement reschedule API endpoint",
        "Add booking history component",
        "Email notifications for changes",
      ],
    },
    {
      key: "B2",
      title: "Service/Resource Catalog Management",
      status: "COMPLETE",
      priority: "High",
      estimate: "0h",
      description:
        "Admin tools for managing services, variants, specialists, and pricing",
      labels: ["mvp", "admin", "complete"],
    },
    {
      key: "B1",
      title: "Staff Shift Management (Working Hours)",
      status: "COMPLETE",
      priority: "High",
      estimate: "0h",
      description:
        "Working hours, time-off management, and availability overrides",
      labels: ["mvp", "admin", "complete"],
    },
    {
      key: "D1",
      title: "Basic Security (MFA, Social Login, RBAC)",
      status: "PARTIAL",
      priority: "Highest",
      estimate: "10h",
      description: "Implement 2FA, complete OAuth, and security audit logging",
      labels: ["mvp", "security", "authentication"],
      subtasks: [
        "Implement TOTP-based 2FA",
        "Add security audit logging",
        "Test account lockout mechanism",
      ],
    },
    {
      key: "D2",
      title: "Mobile-First Design",
      status: "COMPLETE",
      priority: "High",
      estimate: "0h",
      description: "Fully responsive design with PWA support",
      labels: ["mvp", "frontend", "mobile", "complete"],
    },
  ],
  "Phase 2: Foundation": [
    {
      key: "A2",
      title: "Two-Way Calendar Sync (ICS/Google/Outlook)",
      status: "TODO",
      priority: "High",
      estimate: "16h",
      description: "Bidirectional sync with external calendars",
      labels: ["foundation", "integration", "calendar"],
      subtasks: [
        "Google Calendar OAuth setup",
        "Import appointments from external calendars",
        "Export bookings to ICS",
        "Sync updates (reschedule, cancel)",
        "Conflict resolution",
      ],
    },
    {
      key: "A3",
      title: "Automated SMS/Email Reminders",
      status: "PARTIAL",
      priority: "High",
      estimate: "8h",
      description: "Scheduled reminders 24h and 1h before appointments",
      labels: ["foundation", "notifications", "backend"],
      subtasks: [
        "Integrate Twilio for SMS",
        "Create reminder service",
        "Implement cron job scheduler",
        "Add opt-out functionality",
      ],
    },
    {
      key: "A4",
      title: "Deposit/Pre-Payment & Cancellation Policy",
      status: "PARTIAL",
      priority: "High",
      estimate: "6h",
      description: "Customizable cancellation policies per service",
      labels: ["foundation", "payments", "policy"],
      subtasks: [
        "Policy management UI",
        "Service-specific rules",
        "Grace period configuration",
      ],
    },
    {
      key: "B3",
      title: "Refund Processing and Taxation",
      status: "PARTIAL",
      priority: "Medium",
      estimate: "10h",
      description: "Tax calculation and reporting",
      labels: ["foundation", "payments", "tax"],
      subtasks: [
        "Tax service implementation",
        "VAT/sales tax calculation",
        "Regional tax rates",
        "Tax reporting dashboard",
      ],
    },
    {
      key: "B5",
      title: "Customizable Booking Rules",
      status: "COMPLETE",
      priority: "Medium",
      estimate: "0h",
      description: "Lead time, buffer time, min/max duration configuration",
      labels: ["foundation", "backend", "complete"],
    },
    {
      key: "D2_REVIEWS",
      title: "Verified Review Engine",
      status: "TODO",
      priority: "High",
      estimate: "12h",
      description: "Post-appointment review system with moderation",
      labels: ["foundation", "customer-experience", "reviews"],
      subtasks: [
        "Create Review model",
        "Build review submission UI",
        "Admin moderation tools",
        "Display aggregate ratings",
        "Only verified customers can review",
      ],
    },
  ],
  "Phase 3: Leadership": [
    {
      key: "C1",
      title: "Custom Intake Form Builder",
      status: "TODO",
      priority: "Medium",
      estimate: "20h",
      description: "Drag-drop form builder for service-specific intake forms",
      labels: ["leadership", "forms", "advanced"],
    },
    {
      key: "C3",
      title: "Waitlist Automation",
      status: "TODO",
      priority: "Medium",
      estimate: "10h",
      description: "Auto-notify customers when slots become available",
      labels: ["leadership", "automation", "notifications"],
    },
    {
      key: "C2",
      title: "Dynamic/Yield Pricing",
      status: "TODO",
      priority: "Low",
      estimate: "16h",
      description: "Time-based and demand-based pricing rules",
      labels: ["leadership", "pricing", "advanced"],
    },
    {
      key: "C4",
      title: "Video/Telehealth Integration",
      status: "TODO",
      priority: "Medium",
      estimate: "10h",
      description: "Zoom/Google Meet link generation for virtual appointments",
      labels: ["leadership", "telehealth", "integration"],
    },
    {
      key: "C5",
      title: "Gift Cards & Promo Codes",
      status: "PARTIAL",
      priority: "Medium",
      estimate: "12h",
      description: "Gift card and promotional code system",
      labels: ["leadership", "marketing", "payments"],
      subtasks: [
        "Gift card model and purchase flow",
        "Promo code creation and validation",
        "Usage tracking and limits",
      ],
    },
    {
      key: "C6",
      title: "Advanced Reporting & Analytics",
      status: "PARTIAL",
      priority: "Medium",
      estimate: "12h",
      description: "Enhanced analytics dashboard",
      labels: ["leadership", "analytics", "reporting"],
      subtasks: [
        "Customer retention metrics",
        "Service popularity reports",
        "Peak hours analysis",
        "No-show tracking",
      ],
    },
    {
      key: "B4",
      title: "Client History/CRM",
      status: "TODO",
      priority: "High",
      estimate: "16h",
      description: "Customer relationship management system",
      labels: ["leadership", "crm", "customer-experience"],
      subtasks: [
        "Customer profile with history",
        "Notes and tags per customer",
        "Customer segmentation",
        "Birthday tracking",
        "Loyalty program",
      ],
    },
  ],
};

// Map status to Jira status
const STATUS_MAP = {
  COMPLETE: "Done",
  PARTIAL: "In Progress",
  TODO: "To Do",
};

async function createEpic(phase, features) {
  console.log(`\n📋 Creating epic: ${phase}`);

  const totalEstimate = features.reduce((sum, f) => {
    const hours = parseInt(f.estimate) || 0;
    return sum + hours;
  }, 0);

  const completedCount = features.filter((f) => f.status === "COMPLETE").length;
  const progress = Math.round((completedCount / features.length) * 100);

  try {
    const epic = await jira.issues.createIssue({
      fields: {
        project: { key: PROJECT_KEY },
        summary: phase,
        description: {
          type: "doc",
          version: 1,
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: `Epic for ${phase}. Progress: ${progress}% (${completedCount}/${features.length} complete)`,
                },
              ],
            },
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: `Total estimated effort: ${totalEstimate} hours`,
                  marks: [{ type: "strong" }],
                },
              ],
            },
          ],
        },
        issuetype: { name: "Epic" },
        labels: [phase.toLowerCase().replace(/[: ]/g, "-")],
      },
    });

    console.log(`✅ Epic created: ${epic.key}`);
    return epic.key;
  } catch (error) {
    console.error(
      `❌ Failed to create epic:`,
      error.response?.data || error.message
    );
    throw error;
  }
}

async function createStory(feature, epicKey) {
  console.log(`  📝 Creating story: ${feature.key} - ${feature.title}`);

  const statusEmoji = {
    COMPLETE: "✅",
    PARTIAL: "🟡",
    TODO: "🔴",
  };

  const descriptionContent = [
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: `${statusEmoji[feature.status]} Status: ${feature.status}`,
          marks: [{ type: "strong" }],
        },
      ],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: feature.description,
        },
      ],
    },
  ];

  if (feature.subtasks && feature.subtasks.length > 0) {
    descriptionContent.push({
      type: "heading",
      attrs: { level: 3 },
      content: [{ type: "text", text: "Subtasks" }],
    });

    descriptionContent.push({
      type: "bulletList",
      content: feature.subtasks.map((task) => ({
        type: "listItem",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: task }],
          },
        ],
      })),
    });
  }

  try {
    const story = await jira.issues.createIssue({
      fields: {
        project: { key: PROJECT_KEY },
        summary: `${feature.key}: ${feature.title}`,
        description: {
          type: "doc",
          version: 1,
          content: descriptionContent,
        },
        issuetype: { name: "Task" },
        priority: { name: feature.priority },
        labels: feature.labels,
        parent: { key: epicKey },
        ...(feature.estimate && {
          timetracking: {
            originalEstimate: feature.estimate,
          },
        }),
      },
    });

    console.log(`  ✅ Story created: ${story.key}`);

    // Set status
    if (feature.status !== "TODO") {
      await transitionIssue(story.key, STATUS_MAP[feature.status]);
    }

    return story.key;
  } catch (error) {
    console.error(
      `  ❌ Failed to create story:`,
      error.response?.data || error.message
    );
    return null;
  }
}

async function transitionIssue(issueKey, targetStatus) {
  try {
    const transitions = await jira.issues.getTransitions({
      issueIdOrKey: issueKey,
    });
    const transition = transitions.transitions.find(
      (t) => t.name === targetStatus
    );

    if (transition) {
      await jira.issues.doTransition({
        issueIdOrKey: issueKey,
        transition: { id: transition.id },
      });
      console.log(`  ✅ Transitioned ${issueKey} to ${targetStatus}`);
    }
  } catch (error) {
    console.error(`  ⚠️  Could not transition ${issueKey}:`, error.message);
  }
}

async function syncToJira() {
  console.log("🚀 Starting Jira sync...\n");

  // Validate configuration
  if (
    !process.env.JIRA_HOST ||
    !process.env.JIRA_EMAIL ||
    !process.env.JIRA_API_TOKEN
  ) {
    console.error("❌ Missing Jira configuration. Please set:");
    console.error("   JIRA_HOST=yourcompany.atlassian.net");
    console.error("   JIRA_EMAIL=your@email.com");
    console.error("   JIRA_API_TOKEN=your_token_here");
    console.error("   JIRA_PROJECT_KEY=SMP");
    process.exit(1);
  }

  try {
    // Test connection
    await jira.myself.getCurrentUser();
    console.log("✅ Connected to Jira\n");

    // Sync each phase
    for (const [phase, features] of Object.entries(FEATURES)) {
      const epicKey = await createEpic(phase, features);

      for (const feature of features) {
        await createStory(feature, epicKey);
        // Rate limit: 1 request per second
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    console.log("\n✅ Sync complete!");
    console.log(
      `\nView your board: https://${process.env.JIRA_HOST}/browse/${PROJECT_KEY}`
    );
  } catch (error) {
    console.error("\n❌ Sync failed:", error.message);
    process.exit(1);
  }
}

// Run
syncToJira();
