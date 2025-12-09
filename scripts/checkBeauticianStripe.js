import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import Specialist from "../src/models/Specialist.js";

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

    // Get all specialists and their Stripe info
    const specialists = await Specialist.find({});

    console.log("\n=== Specialist Stripe Status ===\n");

    for (const specialist of specialists) {
      console.log(`Name: ${specialist.name}`);
      console.log(`ID: ${specialist._id}`);
      console.log(
        `Stripe Account ID: ${specialist.stripeAccountId || "NOT SET"}`
      );
      console.log(`Stripe Status: ${specialist.stripeStatus || "NOT SET"}`);
      console.log(
        `Onboarding Completed: ${specialist.stripeOnboardingCompleted || false}`
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
