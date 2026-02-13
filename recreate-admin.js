import mongoose from "mongoose";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import Admin from "./src/models/Admin.js";
import Tenant from "./src/models/Tenant.js";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI.replace(/^["']|["']$/g, "").trim();

async function recreateAdmin() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      family: 4,
    });
    console.log("✓ Connected to MongoDB");

    // Find tenant
    const tenant = await Tenant.findOne({ slug: "luxe-lashes" });
    
    if (!tenant) {
      console.error("❌ Tenant not found!");
      process.exit(1);
    }

    console.log("✓ Found tenant:", tenant.name);
    console.log("Tenant ID:", tenant._id);

    const adminEmail = "admin@luxelashes.com";
    
    // Delete old admin
    const oldAdmin = await Admin.findOne({ email: adminEmail });
    if (oldAdmin) {
      console.log("\n🗑️  Deleting old admin account...");
      await Admin.deleteOne({ email: adminEmail });
      console.log("✓ Old admin deleted");
    }

    // Create new admin with correct tenantId
    console.log("\n✨ Creating new admin account...");
    const hashedPassword = await bcrypt.hash("LuxeLashes2024!", 10);
    
    const newAdmin = await Admin.create({
      name: "Luxe Lashes Admin",
      email: adminEmail,
      password: hashedPassword,
      phone: "+44 20 7946 0958",
      businessName: "Luxe Lashes Studio",
      role: "super_admin",
      isActive: true,
      tenantId: tenant._id,
    });

    console.log("✅ New admin created!");

    // Update tenant ownerId
    console.log("\n🔧 Updating tenant owner...");
    tenant.ownerId = newAdmin._id;
    await tenant.save();
    console.log("✓ Tenant owner updated");

    // Verify password
    console.log("\n🔍 Verifying password...");
    const isMatch = await bcrypt.compare("LuxeLashes2024!", newAdmin.password);
    console.log("Password verification:", isMatch ? "✅ PASSED" : "❌ FAILED");

    console.log("\n📋 New Admin Details:");
    console.log("─────────────────────────────────────");
    console.log("ID:", newAdmin._id);
    console.log("Name:", newAdmin.name);
    console.log("Email:", newAdmin.email);
    console.log("Business Name:", newAdmin.businessName);
    console.log("Role:", newAdmin.role);
    console.log("Is Active:", newAdmin.isActive);
    console.log("Tenant ID:", newAdmin.tenantId);
    console.log("─────────────────────────────────────");

    console.log("\n✅ Login Credentials:");
    console.log("─────────────────────────────────────");
    console.log("Email: admin@luxelashes.com");
    console.log("Password: LuxeLashes2024!");
    console.log("URL: https://www.elitebooker.co.uk/admin/login");
    console.log("─────────────────────────────────────");

    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

recreateAdmin();
