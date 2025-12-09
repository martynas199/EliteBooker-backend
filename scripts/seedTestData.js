/**
 * Test Database Seeding Script
 * Seeds the database with sample data for E2E testing
 *
 * Usage: node scripts/seedTestData.js
 */

import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

// Models
import User from "../src/models/User.js";
import Admin from "../src/models/Admin.js";
import Tenant from "../src/models/Tenant.js";
import Service from "../src/models/Service.js";
import Specialist from "../src/models/Specialist.js";
import Appointment from "../src/models/Appointment.js";

// Load environment variables
dotenv.config();

const TEST_DATA = {
  admins: [
    {
      email: "superadmin@platform.com",
      password: "SuperAdmin123!",
      name: "Platform Admin",
      role: "super_admin",
    },
    {
      email: "admin@salon1.com",
      password: "TenantAdmin123!",
      name: "Salon 1 Admin",
      role: "salon-admin",
    },
    {
      email: "admin@salon2.com",
      password: "TenantAdmin123!",
      name: "Salon 2 Admin",
      role: "salon-admin",
    },
  ],
  users: [
    {
      email: "user@example.com",
      password: "User123!",
      name: "Test User",
      phone: "+447700900000",
      role: "customer",
    },
  ],
  tenants: [
    {
      name: "Luxury Beauty Salon",
      businessName: "Luxury Beauty Salon Ltd",
      slug: "salon1",
      domain: "salon1.example.com",
      businessType: "salon",
      description: "Premium beauty and styling services in the heart of London",
      email: "contact@salon1.com",
      phone: "+447700900100",
      address: {
        street: "123 High Street",
        city: "London",
        state: "Greater London",
        postalCode: "SW1A 1AA",
        country: "United Kingdom",
      },
      branding: {
        primaryColor: "#8B5CF6",
        secondaryColor: "#EC4899",
        accentColor: "#F59E0B",
      },
      settings: {
        bookingEnabled: true,
        acceptsDeposits: true,
        depositAmount: 1000, // £10
        currency: "GBP",
        timezone: "Europe/London",
      },
      status: "active",
    },
    {
      name: "Modern Spa Studio",
      businessName: "Modern Spa Studio Ltd",
      slug: "salon2",
      domain: "salon2.example.com",
      businessType: "spa",
      description: "Relaxation and wellness treatments in Manchester",
      email: "contact@salon2.com",
      phone: "+447700900200",
      address: {
        street: "456 Oxford Street",
        city: "Manchester",
        state: "Greater Manchester",
        postalCode: "M1 1AA",
        country: "United Kingdom",
      },
      branding: {
        primaryColor: "#06B6D4",
        secondaryColor: "#10B981",
        accentColor: "#F59E0B",
      },
      settings: {
        bookingEnabled: true,
        acceptsDeposits: false,
        currency: "GBP",
        timezone: "Europe/London",
      },
      status: "active",
    },
  ],
};

async function seedDatabase() {
  try {
    console.log("🌱 Starting database seeding...");

    // Connect to MongoDB
    const mongoUri =
      process.env.MONGO_URI_TEST ||
      process.env.MONGO_URI ||
      "mongodb://localhost:27017/booking-test";
    await mongoose.connect(mongoUri);
    console.log("✅ Connected to MongoDB");

    // Clear existing test data
    console.log("🗑️  Clearing existing test data...");
    await Admin.deleteMany({
      email: { $in: TEST_DATA.admins.map((a) => a.email) },
    });
    await User.deleteMany({
      email: { $in: TEST_DATA.users.map((u) => u.email) },
    });
    await Tenant.deleteMany({
      slug: { $in: TEST_DATA.tenants.map((t) => t.slug) },
    });
    await Service.deleteMany({ tenantId: { $exists: true } });
    await Specialist.deleteMany({ tenantId: { $exists: true } });
    await Appointment.deleteMany({});
    console.log("✅ Cleared existing data");

    // Create tenants
    console.log("🏢 Creating tenants...");
    const createdTenants = [];
    for (const tenantData of TEST_DATA.tenants) {
      const tenant = await Tenant.create(tenantData);
      createdTenants.push(tenant);
      console.log(`  ✓ Created tenant: ${tenant.name} (${tenant.slug})`);
    }

    // Create admins and link to tenants
    console.log("👤 Creating admins...");
    const createdAdmins = [];
    for (const adminData of TEST_DATA.admins) {
      const adminDoc = {
        ...adminData,
        active: true,
      };

      // Link tenant admins to their tenants
      if (adminData.role === "salon-admin") {
        if (adminData.email === "admin@salon1.com") {
          adminDoc.tenantId = createdTenants[0]._id;
        } else if (adminData.email === "admin@salon2.com") {
          adminDoc.tenantId = createdTenants[1]._id;
        }
      }

      const admin = await Admin.create(adminDoc);
      createdAdmins.push(admin);
      console.log(`  ✓ Created admin: ${admin.name} (${admin.email})`);
    }

    // Create users
    console.log("👥 Creating users...");
    const createdUsers = [];
    for (const userData of TEST_DATA.users) {
      const user = await User.create(userData);
      createdUsers.push(user);
      console.log(`  ✓ Created user: ${user.name} (${user.email})`);
    }

    // Create services for each tenant
    console.log("💅 Creating services...");
    const services = [
      {
        name: "Haircut & Style",
        description: "Professional haircut with styling",
        duration: 60,
        price: 5000, // £50
        category: "Hair",
        variants: [
          { name: "Standard Haircut", price: 5000, duration: 60 },
          { name: "Premium Haircut with Wash", price: 7500, duration: 90 },
        ],
        active: true,
      },
      {
        name: "Luxury Facial Treatment",
        description: "Deep cleansing and rejuvenating facial",
        duration: 90,
        price: 8500, // £85
        category: "Facial",
        variants: [
          { name: "Express Facial", price: 6000, duration: 45 },
          { name: "Deluxe Facial", price: 8500, duration: 90 },
        ],
        active: true,
      },
      {
        name: "Relaxing Massage",
        description: "Full body relaxation massage",
        duration: 60,
        price: 7000, // £70
        category: "Massage",
        variants: [
          { name: "30min Express Massage", price: 4000, duration: 30 },
          { name: "60min Full Massage", price: 7000, duration: 60 },
          { name: "90min Deep Tissue", price: 10000, duration: 90 },
        ],
        active: true,
      },
    ];

    for (const tenant of createdTenants) {
      for (const serviceData of services) {
        await Service.create({
          ...serviceData,
          tenantId: tenant._id,
        });
      }
      console.log(`  ✓ Created services for: ${tenant.name}`);
    }

    // Create staff/specialists for each tenant
    // NOTE: Creating only 1 specialist per tenant so SalonLanding shows ServicesPage directly
    console.log("💆 Creating staff members...");
    const staff = [
      {
        name: "Emma Johnson",
        email: "emma@salon1.com",
        phone: "+447700900401",
        specialties: ["Hair", "Styling", "Facial", "Skincare"],
        bio: "Senior stylist with 10 years experience in all beauty services",
        workingHours: {
          monday: { start: "09:00", end: "17:00", enabled: true },
          tuesday: { start: "09:00", end: "17:00", enabled: true },
          wednesday: { start: "09:00", end: "17:00", enabled: true },
          thursday: { start: "09:00", end: "17:00", enabled: true },
          friday: { start: "09:00", end: "18:00", enabled: true },
          saturday: { start: "10:00", end: "16:00", enabled: true },
          sunday: { enabled: false },
        },
        breaks: [{ start: "13:00", end: "14:00" }],
        active: true,
      },
    ];

    for (const tenant of createdTenants) {
      for (const staffData of staff) {
        await Specialist.create({
          ...staffData,
          tenantId: tenant._id,
          email: staffData.email.replace("@salon1.com", `@${tenant.slug}.com`),
        });
      }
      console.log(`  ✓ Created staff for: ${tenant.name}`);
    }

    console.log("\n✅ Database seeding completed successfully!");
    console.log("\n📊 Summary:");
    console.log(`   - Admins: ${TEST_DATA.admins.length}`);
    console.log(`   - Users: ${TEST_DATA.users.length}`);
    console.log(`   - Tenants: ${createdTenants.length}`);
    console.log(`   - Services: ${services.length * createdTenants.length}`);
    console.log(`   - Staff: ${staff.length * createdTenants.length}`);
    console.log("\n🔐 Test Credentials:");
    console.log("   Super Admin: superadmin@platform.com / SuperAdmin123!");
    console.log("   Tenant Admin: admin@salon1.com / TenantAdmin123!");
    console.log("   Regular User: user@example.com / User123!");

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding database:", error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

// Run the seeding function
seedDatabase();

export default seedDatabase;
