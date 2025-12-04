/**
 * List all admins and beauticians in the database
 * Helps you see which accounts exist before linking
 *
 * Usage: node scripts/listAccounts.js
 */

import mongoose from "mongoose";
import Admin from "../src/models/Admin.js";
import Beautician from "../src/models/Beautician.js";
import dotenv from "dotenv";

dotenv.config();

async function listAccounts() {
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

    // List all admins
    console.log("👤 ADMIN ACCOUNTS:");
    console.log("━".repeat(60));
    const admins = await Admin.find({});
    if (admins.length === 0) {
      console.log("   (No admins found)");
    } else {
      admins.forEach((admin, idx) => {
        console.log(`${idx + 1}. ${admin.name}`);
        console.log(`   Email: ${admin.email}`);
        console.log(`   Role: ${admin.role}`);
        console.log(
          `   Beautician ID: ${admin.beauticianId || "(not linked)"}`
        );
        console.log(`   Active: ${admin.active ? "Yes" : "No"}`);
        console.log();
      });
    }

    // List all beauticians
    console.log("\n💇 BEAUTICIAN ACCOUNTS:");
    console.log("━".repeat(60));
    const beauticians = await Beautician.find({});
    if (beauticians.length === 0) {
      console.log("   (No beauticians found)");
    } else {
      beauticians.forEach((beautician, idx) => {
        console.log(`${idx + 1}. ${beautician.name}`);
        console.log(`   ID: ${beautician._id}`);
        console.log(`   Email: ${beautician.email || "(no email)"}`);
        console.log(`   Active: ${beautician.active ? "Yes" : "No"}`);
        console.log(`   Stripe Status: ${beautician.stripeStatus}`);
        if (beautician.stripeAccountId) {
          console.log(`   Stripe Account: ${beautician.stripeAccountId}`);
        }
        console.log();
      });
    }

    // Show linking instructions
    console.log("\n📝 TO LINK AN ADMIN TO A BEAUTICIAN:");
    console.log("━".repeat(60));
    console.log("Run this command:");
    console.log(
      "node scripts/linkAdminToBeautician.js <admin-email> <beautician-email>"
    );
    console.log("\nExample:");
    if (admins.length > 0 && beauticians.length > 0) {
      console.log(
        `node scripts/linkAdminToBeautician.js ${admins[0].email} ${
          beauticians[0].email || beauticians[0].name
        }`
      );
    } else {
      console.log(
        "node scripts/linkAdminToBeautician.js admin@salon.com beautician@salon.com"
      );
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    await mongoose.connection.close();
    console.log("\n✅ Database connection closed");
  }
}

listAccounts();
