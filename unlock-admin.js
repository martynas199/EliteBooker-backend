import mongoose from "mongoose";
import dotenv from "dotenv";
import Admin from "./src/models/Admin.js";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI.replace(/^["']|["']$/g, "").trim();

async function unlockAdmin() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      family: 4,
    });
    console.log("✓ Connected to MongoDB");

    const adminEmail = "admin@luxelashes.com";
    let admin = await Admin.findOne({ email: adminEmail });

    if (!admin) {
      console.error("❌ Admin not found!");
      process.exit(1);
    }

    console.log("\n📋 Current Admin Status:");
    console.log("─────────────────────────────────────");
    console.log("Name:", admin.name);
    console.log("Email:", admin.email);
    console.log("Login Attempts:", admin.loginAttempts);
    console.log("Locked Until:", admin.lockUntil);
    console.log("Is Locked:", admin.isLocked ? admin.isLocked() : "N/A");
    console.log("─────────────────────────────────────");

    // Unlock the account
    console.log("\n🔓 Unlocking admin account...");

    admin.loginAttempts = 0;
    admin.lockUntil = undefined;

    await admin.save();

    console.log("✅ Account unlocked!");

    // Verify the update
    const updatedAdmin = await Admin.findOne({ email: adminEmail });

    console.log("\n📋 Updated Admin Status:");
    console.log("─────────────────────────────────────");
    console.log("Name:", updatedAdmin.name);
    console.log("Email:", updatedAdmin.email);
    console.log("Login Attempts:", updatedAdmin.loginAttempts);
    console.log("Locked Until:", updatedAdmin.lockUntil);
    console.log("─────────────────────────────────────");

    console.log("\n✅ You can now login!");

    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

unlockAdmin();
