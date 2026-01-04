import dotenv from "dotenv";
import mongoose from "mongoose";
import Specialist from "./src/models/Specialist.js";

dotenv.config();

async function checkStripeAccount() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;

    if (!mongoUri) {
      console.log(
        "❌ MONGODB_URI or MONGO_URI not found in environment variables"
      );
      process.exit(1);
    }

    console.log("Connecting to MongoDB...");
    await mongoose.connect(mongoUri);
    console.log("Connected to MongoDB\n");

    // Find specialist by email
    const email = "martynas19949@gmail.com";
    const specialist = await Specialist.findOne({ email: email });

    if (!specialist) {
      console.log(`❌ Specialist with email ${email} NOT FOUND`);
      await mongoose.disconnect();
      return;
    }

    console.log("✅ Specialist found:");
    console.log("   Name:", specialist.name);
    console.log("   Email:", specialist.email);
    console.log("   Specialist ID:", specialist._id);
    console.log("\n📊 Stripe Account Details:");
    console.log(
      "   Stripe Account ID:",
      specialist.stripeAccountId || "❌ Not set"
    );
    console.log(
      "   Stripe Account Type:",
      specialist.stripeAccountType || "❌ Not set"
    );
    console.log("   Stripe Status:", specialist.stripeStatus || "❌ Not set");
    console.log(
      "   Onboarding Completed:",
      specialist.stripeOnboardingCompleted ? "✅ Yes" : "❌ No"
    );

    await mongoose.disconnect();
    console.log("\n✅ Database connection closed");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

checkStripeAccount();
