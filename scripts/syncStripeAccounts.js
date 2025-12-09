import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import Stripe from "stripe";
import Specialist from "../src/models/Specialist.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from project root
dotenv.config({ path: join(__dirname, "..", ".env") });

async function syncStripeAccounts() {
  try {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;

    if (!mongoUri) {
      throw new Error(
        "MONGODB_URI or MONGO_URI not found in environment variables"
      );
    }

    await mongoose.connect(mongoUri);
    console.log("✓ Connected to MongoDB");

    // Initialize Stripe
    const stripeKey =
      process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET;
    if (!stripeKey) {
      throw new Error("STRIPE_SECRET_KEY not found");
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });
    console.log("✓ Stripe initialized");

    // Get all Connect accounts from Stripe
    console.log("\n🔍 Fetching all Stripe Connect accounts...");
    const accounts = await stripe.accounts.list({ limit: 100 });
    console.log(`Found ${accounts.data.length} Stripe Connect accounts\n`);

    // Get all specialists
    const specialists = await Specialist.find({});
    console.log(`Found ${specialists.length} specialists in database\n`);

    console.log("=== Syncing Stripe Accounts ===\n");

    // Try to match accounts by email or update existing ones
    for (const stripeAccount of accounts.data) {
      const accountEmail = stripeAccount.email;
      const accountId = stripeAccount.id;
      const isComplete =
        stripeAccount.details_submitted && stripeAccount.charges_enabled;

      console.log(`\n📧 Stripe Account: ${accountEmail || "No email"}`);
      console.log(`   ID: ${accountId}`);
      console.log(`   Details Submitted: ${stripeAccount.details_submitted}`);
      console.log(`   Charges Enabled: ${stripeAccount.charges_enabled}`);
      console.log(`   Status: ${isComplete ? "✅ COMPLETE" : "⏳ PENDING"}`);

      if (accountEmail) {
        // Try to find specialist by email
        const specialist = specialists.find(
          (b) => b.email?.toLowerCase() === accountEmail.toLowerCase()
        );

        if (specialist) {
          console.log(`   Found specialist: ${specialist.name}`);

          // Update specialist with Stripe info
          specialist.stripeAccountId = accountId;
          specialist.stripeStatus = isComplete ? "connected" : "pending";
          specialist.stripeOnboardingCompleted = isComplete;

          await specialist.save();
          console.log(
            `   ✅ Updated ${specialist.name}'s Stripe info in database`
          );
        } else {
          console.log(`   ⚠️  No specialist found with email: ${accountEmail}`);
        }
      } else {
        console.log(
          `   ⚠️  No email on Stripe account, cannot match to specialist`
        );
      }
    }

    console.log("\n\n=== Final Specialist Status ===\n");

    // Refresh specialists data
    const updatedBeauticians = await Specialist.find({});

    for (const specialist of updatedBeauticians) {
      console.log(`${specialist.name}:`);
      console.log(`  Email: ${specialist.email || "NOT SET"}`);
      console.log(
        `  Stripe Account ID: ${specialist.stripeAccountId || "NOT SET"}`
      );
      console.log(`  Stripe Status: ${specialist.stripeStatus || "NOT SET"}`);
      console.log(
        `  Onboarding Completed: ${
          specialist.stripeOnboardingCompleted || false
        }`
      );
      console.log("---");
    }

    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

syncStripeAccounts();
