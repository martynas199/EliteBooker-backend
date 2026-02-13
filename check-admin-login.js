import mongoose from "mongoose";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import Admin from "./src/models/Admin.js";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI.replace(/^["']|["']$/g, "").trim();

async function checkAdminLogin() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      family: 4,
    });
    console.log("✓ Connected to MongoDB");

    const adminEmail = "admin@luxelashes.com";
    const admin = await Admin.findOne({ email: adminEmail });
    
    if (!admin) {
      console.error("❌ Admin not found!");
      process.exit(1);
    }

    console.log("\n📋 Admin Account Details:");
    console.log("─────────────────────────────────────");
    console.log("Name:", admin.name);
    console.log("Email:", admin.email);
    console.log("Business Name:", admin.businessName);
    console.log("Role:", admin.role);
    console.log("Is Active:", admin.isActive);
    console.log("─────────────────────────────────────");

    // Test password
    const testPassword = "LuxeLashes2024!";
    console.log("\nChecking password...");
    
    if (!admin.password) {
      console.log("⚠️  No password set! Setting password...");
      const hashedPassword = await bcrypt.hash(testPassword, 10);
      admin.password = hashedPassword;
      admin.isActive = true;
      await admin.save();
      console.log("✅ Password has been set to: LuxeLashes2024!");
    } else {
      console.log("Testing password:", testPassword);
      const isMatch = await bcrypt.compare(testPassword, admin.password);
      console.log("Password match:", isMatch);

      if (!isMatch) {
        console.log("\n⚠️  Password doesn't match! Resetting password...");
        const hashedPassword = await bcrypt.hash(testPassword, 10);
        admin.password = hashedPassword;
        admin.isActive = true;
        await admin.save();
        console.log("✅ Password has been reset to: LuxeLashes2024!");
      } else {
        console.log("\n✅ Password is correct!");
      }
    }

    console.log("\n📋 Login Credentials:");
    console.log("─────────────────────────────────────");
    console.log("Email:", adminEmail);
    console.log("Password: LuxeLashes2024!");
    console.log("─────────────────────────────────────");

    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

checkAdminLogin();
