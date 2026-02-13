import mongoose from "mongoose";
import dotenv from "dotenv";
import Tenant from "./src/models/Tenant.js";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI.replace(/^["']|["']$/g, "").trim();

async function checkStripeAccount() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      family: 4,
    });
    console.log("✓ Connected to MongoDB");

    const tenant = await Tenant.findOne({ slug: "luxe-lashes" });
    
    if (!tenant) {
      console.error("❌ Tenant not found!");
      process.exit(1);
    }

    console.log("\n📋 Current Tenant Details:");
    console.log("─────────────────────────────────────");
    console.log("Name:", tenant.name);
    console.log("Slug:", tenant.slug);
    console.log("Email:", tenant.email);
    console.log("Stripe Account ID:", tenant.stripeAccountId);
    console.log("Stripe Charges Enabled:", tenant.stripeChargesEnabled);
    console.log("Stripe Payouts Enabled:", tenant.stripePayoutsEnabled);
    console.log("─────────────────────────────────────");

    // Update with proper Stripe account
    console.log("\nUpdating Stripe account...");
    tenant.stripeAccountId = "acct_1234567890";
    tenant.stripeChargesEnabled = true;
    tenant.stripePayoutsEnabled = true;
    tenant.stripeDetailsSubmitted = true;
    await tenant.save();
    
    console.log("✅ Stripe account updated!");
    console.log("\n📋 Updated Tenant Details:");
    console.log("─────────────────────────────────────");
    console.log("Stripe Account ID:", tenant.stripeAccountId);
    console.log("Stripe Charges Enabled:", tenant.stripeChargesEnabled);
    console.log("Stripe Payouts Enabled:", tenant.stripePayoutsEnabled);
    console.log("Stripe Details Submitted:", tenant.stripeDetailsSubmitted);
    console.log("─────────────────────────────────────");

    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

checkStripeAccount();
