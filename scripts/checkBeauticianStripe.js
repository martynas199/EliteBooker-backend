import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import Beautician from "../src/models/Beautician.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from project root
dotenv.config({ path: join(__dirname, "..", ".env") });

async function checkBeauticianStripe() {
  try {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;

    if (!mongoUri) {
      throw new Error(
        "MONGODB_URI or MONGO_URI not found in environment variables"
      );
    }

    await mongoose.connect(mongoUri);
    console.log("✓ Connected to MongoDB");

    // Get all beauticians and their Stripe info
    const beauticians = await Beautician.find({});

    console.log("\n=== Beautician Stripe Status ===\n");

    for (const beautician of beauticians) {
      console.log(`Name: ${beautician.name}`);
      console.log(`ID: ${beautician._id}`);
      console.log(
        `Stripe Account ID: ${beautician.stripeAccountId || "NOT SET"}`
      );
      console.log(`Stripe Status: ${beautician.stripeStatus || "NOT SET"}`);
      console.log(
        `Onboarding Completed: ${beautician.stripeOnboardingCompleted || false}`
      );
      console.log("---");
    }

    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

checkBeauticianStripe();
