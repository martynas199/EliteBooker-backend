/**
 * Script to list all beauticians in the database
 *
 * Usage:
 * node scripts/listBeauticians.js
 */

import mongoose from "mongoose";
import Beautician from "../src/models/Beautician.js";
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

    // Find all beauticians
    const beauticians = await Beautician.find({}).lean();

    if (beauticians.length === 0) {
      console.log("⚠️  No beauticians found in the database.");
      console.log(
        "\nYou need to create a beautician first through the admin dashboard:"
      );
      console.log("1. Go to /admin/beauticians");
      console.log("2. Click 'Add Beautician'");
      console.log("3. Fill in the details and save");
      console.log(
        "4. Then run this script again to get the beautician's email"
      );
    } else {
      console.log("📋 Available Beauticians:\n");
      beauticians.forEach((b, index) => {
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
