import mongoose from "mongoose";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import Admin from "./src/models/Admin.js";
import Tenant from "./src/models/Tenant.js";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI.replace(/^["']|["']$/g, "").trim();

async function fixAdminAccount() {
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

    console.log("\n📋 Current Admin Details:");
    console.log("─────────────────────────────────────");
    console.log("ID:", admin._id);
    console.log("Name:", admin.name);
    console.log("Email:", admin.email);
    console.log("Business Name:", admin.businessName);
    console.log("Role:", admin.role);
    console.log("Is Active:", admin.isActive);
    console.log("Tenant ID:", admin.tenantId);
    console.log("Has Password:", !!admin.password);
    console.log("─────────────────────────────────────");

    // Find tenant
    const tenant = await Tenant.findOne({ slug: "luxe-lashes" });
    
    if (!tenant) {
      console.error("❌ Tenant not found!");
      process.exit(1);
    }

    console.log("\nTenant found:", tenant.name);
    console.log("Tenant ID:", tenant._id);
    console.log("Tenant Owner ID:", tenant.ownerId);

    // Update admin with all required fields
    console.log("\n🔧 Updating admin account...");
    const hashedPassword = await bcrypt.hash("LuxeLashes2024!", 10);
    
    admin.password = hashedPassword;
    admin.isActive = true;
    admin.businessName = "Luxe Lashes Studio";
    admin.tenantId = tenant._id;
    admin.role = "super_admin";
    
    await admin.save();
    
    console.log("✅ Admin account updated!");

    // Verify password works
    console.log("\n🔍 Verifying password...");
    const testPassword = "LuxeLashes2024!";
    const isMatch = await bcrypt.compare(testPassword, admin.password);
    console.log("Password verification:", isMatch ? "✅ PASSED" : "❌ FAILED");

    console.log("\n📋 Updated Admin Details:");
    console.log("─────────────────────────────────────");
    console.log("Name:", admin.name);
    console.log("Email:", admin.email);
    console.log("Business Name:", admin.businessName);
    console.log("Role:", admin.role);
    console.log("Is Active:", admin.isActive);
    console.log("Tenant ID:", admin.tenantId);
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

fixAdminAccount();
