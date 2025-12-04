import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import Stripe from "stripe";
import Beautician from "../src/models/Beautician.js";

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

    // Get all beauticians
    const beauticians = await Beautician.find({});
    console.log(`Found ${beauticians.length} beauticians in database\n`);

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
        // Try to find beautician by email
        const beautician = beauticians.find(
          (b) => b.email?.toLowerCase() === accountEmail.toLowerCase()
        );

        if (beautician) {
          console.log(`   Found beautician: ${beautician.name}`);

          // Update beautician with Stripe info
          beautician.stripeAccountId = accountId;
          beautician.stripeStatus = isComplete ? "connected" : "pending";
          beautician.stripeOnboardingCompleted = isComplete;

          await beautician.save();
          console.log(
            `   ✅ Updated ${beautician.name}'s Stripe info in database`
          );
        } else {
          console.log(`   ⚠️  No beautician found with email: ${accountEmail}`);
        }
      } else {
        console.log(
          `   ⚠️  No email on Stripe account, cannot match to beautician`
        );
      }
    }

    console.log("\n\n=== Final Beautician Status ===\n");

    // Refresh beauticians data
    const updatedBeauticians = await Beautician.find({});

    for (const beautician of updatedBeauticians) {
      console.log(`${beautician.name}:`);
      console.log(`  Email: ${beautician.email || "NOT SET"}`);
      console.log(
        `  Stripe Account ID: ${beautician.stripeAccountId || "NOT SET"}`
      );
      console.log(`  Stripe Status: ${beautician.stripeStatus || "NOT SET"}`);
      console.log(
        `  Onboarding Completed: ${
          beautician.stripeOnboardingCompleted || false
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
