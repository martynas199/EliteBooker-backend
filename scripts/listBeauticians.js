/**
 * Script to list all specialists in the database
 *
 * Usage:
 * node scripts/listBeauticians.js
 */

import mongoose from "mongoose";
import Specialist from "../src/models/Specialist.js";
import dotenv from "dotenv";

dotenv.config();

async function listBeauticians() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoUri) {
      console.error(
        "❌ Error: MONGODB_URI or MONGO_URI not found in .env file"
      );
      process.exit(1);
    }
    await mongoose.connect(mongoUri);
    console.log("✅ Connected to MongoDB\n");

    // Find all specialists
    const specialists = await Specialist.find({}).lean();

    if (specialists.length === 0) {
      console.log("⚠️  No specialists found in the database.");
      console.log(
        "\nYou need to create a specialist first through the admin dashboard:"
      );
      console.log("1. Go to /admin/specialists");
      console.log("2. Click 'Add Specialist'");
      console.log("3. Fill in the details and save");
      console.log(
        "4. Then run this script again to get the specialist's email"
      );
    } else {
      console.log("📋 Available Specialists:\n");
      specialists.forEach((b, index) => {
        console.log(`${index + 1}. ${b.name}`);
        console.log(`   Email: ${b.email || "(no email)"}`);
        console.log(`   ID: ${b._id}`);
        console.log(`   Active: ${b.active ? "Yes" : "No"}`);
        console.log("");
      });
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    await mongoose.connection.close();
    console.log("✅ Database connection closed");
  }
}

listBeauticians();
