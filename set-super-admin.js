import mongoose from "mongoose";
import dotenv from "dotenv";
import Admin from "./src/models/Admin.js";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI.replace(/^["']|["']$/g, "").trim();

async function setSuperAdmin() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      family: 4,
    });
    console.log("✓ Connected to MongoDB");

    const adminEmail = "admin@luxelashes.com";
    let admin = await Admin.findOne({ email: adminEmail }).select("+password");

    if (!admin) {
      console.error("❌ Admin not found!");
      process.exit(1);
    }

    console.log("\n📋 Current Admin Details:");
    console.log("─────────────────────────────────────");
    console.log("Name:", admin.name);
    console.log("Email:", admin.email);
    console.log("Current Role:", admin.role);
    console.log("─────────────────────────────────────");

    // Update only the role and password (let the model handle hashing)
    console.log("\n🔧 Updating admin to super_admin and resetting password...");

    admin.role = "super_admin";
    admin.password = "LuxeLashes2024!"; // This will be hashed by the pre-save hook
    admin.isActive = true;

    await admin.save();

    console.log("✅ Admin updated!");

    // Verify the update
    const updatedAdmin = await Admin.findOne({ email: adminEmail });

    console.log("\n📋 Updated Admin Details:");
    console.log("─────────────────────────────────────");
    console.log("Name:", updatedAdmin.name);
    console.log("Email:", updatedAdmin.email);
    console.log("New Role:", updatedAdmin.role);
    console.log("Is Active:", updatedAdmin.isActive);
    console.log("─────────────────────────────────────");

    console.log("\n✅ Login Credentials:");
    console.log("─────────────────────────────────────");
    console.log("Email: admin@luxelashes.com");
    console.log("Password: LuxeLashes2024!");
    console.log("─────────────────────────────────────");

    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

setSuperAdmin();
