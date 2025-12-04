import mongoose from "mongoose";
import Beautician from "../src/models/Beautician.js";
import dotenv from "dotenv";

dotenv.config();

async function clearTestStripeAccounts() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");

    // Find all beauticians with Stripe accounts
    const beauticians = await Beautician.find({
      stripeAccountId: { $exists: true, $ne: null },
    });

    console.log(
      `Found ${beauticians.length} beautician(s) with Stripe accounts`
    );

    for (const beautician of beauticians) {
      console.log(`\nBeautician: ${beautician.name}`);
      console.log(`Current Stripe Account: ${beautician.stripeAccountId}`);
      console.log(`Email: ${beautician.email}`);

      // Clear the Stripe account ID
      beautician.stripeAccountId = null;
      beautician.stripeOnboardingComplete = false;
      await beautician.save();

      console.log(`✓ Cleared Stripe account for ${beautician.name}`);
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
