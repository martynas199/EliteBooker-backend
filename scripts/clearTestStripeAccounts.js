import mongoose from "mongoose";
import Beautician from "../src/models/Beautician.js";
import dotenv from "dotenv";

dotenv.config();

async function clearTestStripeAccounts() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");

    // Find all specialists with Stripe accounts
    const specialists = await Beautician.find({
      stripeAccountId: { $exists: true, $ne: null },
    });

    console.log(
      `Found ${specialists.length} specialist(s) with Stripe accounts`
    );

    for (const specialist of specialists) {
      console.log(`\nBeautician: ${specialist.name}`);
      console.log(`Current Stripe Account: ${specialist.stripeAccountId}`);
      console.log(`Email: ${specialist.email}`);

      // Clear the Stripe account ID
      specialist.stripeAccountId = null;
      specialist.stripeOnboardingComplete = false;
      await specialist.save();

      console.log(`✓ Cleared Stripe account for ${specialist.name}`);
    }

    console.log("\n✅ All test Stripe accounts cleared!");
    console.log("\nNext steps:");
    console.log(
      "1. Beauticians need to go through Stripe Connect onboarding again"
    );
    console.log("2. This time they will create LIVE mode accounts");
    console.log("3. Make sure your backend is using LIVE Stripe keys");
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await mongoose.disconnect();
  }
}

clearTestStripeAccounts();
