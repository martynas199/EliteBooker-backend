import mongoose from "mongoose";
import dotenv from "dotenv";
import Specialist from "./src/models/Specialist.js";
import Tenant from "./src/models/Tenant.js";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI.replace(/^["']|["']$/g, "").trim();

async function updateSpecialistStripe() {
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

    const specialist = await Specialist.findOne({
      email: "isabella@luxelashes.com",
      tenantId: tenant._id,
    });

    if (!specialist) {
      console.error("❌ Specialist not found!");
      process.exit(1);
    }

    console.log("\n📋 Current Specialist Details:");
    console.log("─────────────────────────────────────");
    console.log("Name:", specialist.name);
    console.log("Email:", specialist.email);
    console.log("Stripe Status:", specialist.stripeStatus);
    console.log("Stripe Account ID:", specialist.stripeAccountId);
    console.log("─────────────────────────────────────");

    // Update specialist with Stripe connection
    console.log("\nUpdating specialist Stripe status...");
    specialist.stripeStatus = "connected";
    specialist.stripeAccountId = "acct_1234567890";
    specialist.stripeChargesEnabled = true;
    specialist.stripePayoutsEnabled = true;
    specialist.stripeDetailsSubmitted = true;
    await specialist.save();
    
    console.log("✅ Specialist updated!");
    console.log("\n📋 Updated Specialist Details:");
    console.log("─────────────────────────────────────");
    console.log("Name:", specialist.name);
    console.log("Stripe Status:", specialist.stripeStatus);
    console.log("Stripe Account ID:", specialist.stripeAccountId);
    console.log("Stripe Charges Enabled:", specialist.stripeChargesEnabled);
    console.log("Stripe Payouts Enabled:", specialist.stripePayoutsEnabled);
    console.log("─────────────────────────────────────");

    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

updateSpecialistStripe();
