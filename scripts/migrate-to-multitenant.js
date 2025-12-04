/**
 * Migration Script: Single-Tenant to Multi-Tenant
 *
 * This script migrates existing data from a single-tenant structure
 * to a multi-tenant structure by:
 *
 * 1. Creating a default tenant for existing data
 * 2. Adding tenantId to all existing documents
 * 3. Migrating admin users to the new structure
 * 4. Setting up default configurations
 *
 * IMPORTANT: Backup your database before running this script!
 *
 * Usage:
 * node scripts/migrate-to-multitenant.js
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Load environment variables
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

// Import models
import Tenant from "../src/models/Tenant.js";
import Admin from "../src/models/Admin.js";
import User from "../src/models/User.js";
import Service from "../src/models/Service.js";
import Beautician from "../src/models/Beautician.js";
import Appointment from "../src/models/Appointment.js";
import Product from "../src/models/Product.js";
import Order from "../src/models/Order.js";
import Settings from "../src/models/Settings.js";
import HeroSection from "../src/models/HeroSection.js";
import BlogPost from "../src/models/BlogPost.js";
import AboutUs from "../src/models/AboutUs.js";
import CancellationPolicy from "../src/models/CancellationPolicy.js";
import AuditLog from "../src/models/AuditLog.js";
import Subscription from "../src/models/Subscription.js";

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error("❌ MONGO_URI not found in environment variables");
  process.exit(1);
}

// Configuration for the default tenant
const DEFAULT_TENANT_CONFIG = {
  businessName: process.env.DEFAULT_BUSINESS_NAME || "Noble Elegance",
  name: process.env.DEFAULT_SALON_NAME || "Noble Elegance Beauty Salon",
  slug: process.env.DEFAULT_TENANT_SLUG || "noble-elegance",
  email: process.env.DEFAULT_TENANT_EMAIL || "info@nobleelegance.co.uk",
  phone: process.env.DEFAULT_TENANT_PHONE || "+44 1945 123456",
  address: {
    street: "12 Blackfriars Rd",
    city: "Wisbech",
    state: "Cambridgeshire",
    postalCode: "PE13 1AT",
    country: "United Kingdom",
  },
  status: "active",
  isTrial: false,
};

async function connectDatabase() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to MongoDB");
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    process.exit(1);
  }
}

async function createDefaultTenant() {
  console.log("\n📝 Creating default tenant...");

  try {
    // Check if tenant already exists
    let tenant = await Tenant.findOne({ slug: DEFAULT_TENANT_CONFIG.slug });

    if (tenant) {
      console.log(
        `✅ Default tenant already exists: ${tenant.name} (${tenant._id})`
      );
      return tenant;
    }

    // Create new tenant
    tenant = new Tenant({
      ...DEFAULT_TENANT_CONFIG,
      defaultWorkingHours: [
        { dayOfWeek: 1, start: "09:00", end: "18:00" }, // Monday
        { dayOfWeek: 2, start: "09:00", end: "18:00" }, // Tuesday
        { dayOfWeek: 3, start: "09:00", end: "18:00" }, // Wednesday
        { dayOfWeek: 4, start: "09:00", end: "18:00" }, // Thursday
        { dayOfWeek: 5, start: "09:00", end: "18:00" }, // Friday
        { dayOfWeek: 6, start: "09:00", end: "17:00" }, // Saturday
      ],
    });

    await tenant.save();
    console.log(`✅ Created default tenant: ${tenant.name} (${tenant._id})`);
    return tenant;
  } catch (error) {
    console.error("❌ Error creating default tenant:", error);
    throw error;
  }
}

async function migrateCollection(Model, tenantId, collectionName) {
  console.log(`\n📝 Migrating ${collectionName}...`);

  try {
    // Find documents without tenantId
    const docs = await Model.find({ tenantId: { $exists: false } });

    if (docs.length === 0) {
      console.log(`✅ No documents to migrate in ${collectionName}`);
      return;
    }

    console.log(`   Found ${docs.length} documents to migrate`);

    // Update all documents with tenantId
    const result = await Model.updateMany(
      { tenantId: { $exists: false } },
      { $set: { tenantId } }
    );

    console.log(
      `✅ Migrated ${result.modifiedCount} documents in ${collectionName}`
    );
  } catch (error) {
    console.error(`❌ Error migrating ${collectionName}:`, error);
    throw error;
  }
}

async function migrateAdmins(tenantId) {
  console.log("\n📝 Migrating admin users...");

  try {
    const admins = await Admin.find({ tenantId: { $exists: false } });

    if (admins.length === 0) {
      console.log("✅ No admin users to migrate");
      return;
    }

    console.log(`   Found ${admins.length} admin users to migrate`);

    for (const admin of admins) {
      admin.tenantId = tenantId;

      // Update role if needed (map old roles to new roles)
      if (admin.role === "admin") {
        admin.role = "salon-admin";
      }

      await admin.save();
    }

    console.log(`✅ Migrated ${admins.length} admin users`);

    // Set first admin as tenant owner if not set
    const tenant = await Tenant.findById(tenantId);
    if (!tenant.ownerId && admins.length > 0) {
      tenant.ownerId = admins[0]._id;
      await tenant.save();
      console.log(`✅ Set ${admins[0].email} as tenant owner`);
    }
  } catch (error) {
    console.error("❌ Error migrating admin users:", error);
    throw error;
  }
}

async function migrateSettings(tenantId) {
  console.log("\n📝 Migrating settings...");

  try {
    // Find settings without tenantId
    const settings = await Settings.findOne({ _id: "salon-settings" });

    if (!settings) {
      console.log("✅ No settings to migrate");
      return;
    }

    // Create new settings document with tenantId
    const newSettings = new Settings({
      ...settings.toObject(),
      tenantId,
    });

    // Remove the fixed _id
    delete newSettings._id;

    await newSettings.save();

    console.log("✅ Migrated settings");
  } catch (error) {
    console.error("❌ Error migrating settings:", error);
    // Non-critical error, continue
  }
}

async function runMigration() {
  console.log("🚀 Starting Multi-Tenant Migration");
  console.log("===================================");

  try {
    await connectDatabase();

    // Step 1: Create default tenant
    const tenant = await createDefaultTenant();
    const tenantId = tenant._id;

    // Step 2: Migrate admin users first
    await migrateAdmins(tenantId);

    // Step 3: Migrate all collections
    await migrateCollection(User, tenantId, "Users");
    await migrateCollection(Service, tenantId, "Services");
    await migrateCollection(Beautician, tenantId, "Beauticians");
    await migrateCollection(Appointment, tenantId, "Appointments");
    await migrateCollection(Product, tenantId, "Products");
    await migrateCollection(Order, tenantId, "Orders");
    await migrateCollection(HeroSection, tenantId, "HeroSections");
    await migrateCollection(BlogPost, tenantId, "BlogPosts");
    await migrateCollection(AboutUs, tenantId, "AboutUs");
    await migrateCollection(
      CancellationPolicy,
      tenantId,
      "CancellationPolicies"
    );
    await migrateCollection(AuditLog, tenantId, "AuditLogs");
    await migrateCollection(Subscription, tenantId, "Subscriptions");

    // Step 4: Migrate settings (special case)
    await migrateSettings(tenantId);

    console.log("\n✅ Migration completed successfully!");
    console.log("===================================");
    console.log(`Default Tenant ID: ${tenantId}`);
    console.log(`Default Tenant Slug: ${tenant.slug}`);
    console.log(`\nYou can now access your salon at:`);
    console.log(`  - https://yourdomain.com/salon/${tenant.slug}`);
    console.log(`  - Custom domain (after DNS setup)`);

    // Verification
    console.log("\n📊 Migration Summary:");
    console.log("===================================");
    const counts = {
      admins: await Admin.countDocuments({ tenantId }),
      users: await User.countDocuments({ tenantId }),
      services: await Service.countDocuments({ tenantId }),
      beauticians: await Beautician.countDocuments({ tenantId }),
      appointments: await Appointment.countDocuments({ tenantId }),
      products: await Product.countDocuments({ tenantId }),
      orders: await Order.countDocuments({ tenantId }),
    };

    Object.entries(counts).forEach(([collection, count]) => {
      console.log(`${collection}: ${count}`);
    });
  } catch (error) {
    console.error("\n❌ Migration failed:", error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log("\n👋 Database connection closed");
  }
}

// Run migration
runMigration();
