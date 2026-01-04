import dotenv from "dotenv";
import mongoose from "mongoose";
import Tenant from "./src/models/Tenant.js";

dotenv.config();

async function updatePlatformFees() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;

    if (!mongoUri) {
      console.log(
        "❌ MONGODB_URI or MONGO_URI not found in environment variables"
      );
      process.exit(1);
    }

    console.log("Connecting to MongoDB...");
    await mongoose.connect(mongoUri);
    console.log("Connected to MongoDB\n");

    // Find all tenants with old platform fee
    const tenants = await Tenant.find({
      $or: [
        { "paymentSettings.platformFeePerBooking": 50 },
        { "paymentSettings.platformFeePerProduct": 50 },
      ],
    });

    console.log(`Found ${tenants.length} tenant(s) with old platform fees\n`);

    if (tenants.length === 0) {
      console.log("✅ No tenants need updating");
      await mongoose.disconnect();
      return;
    }

    // Update each tenant
    for (const tenant of tenants) {
      console.log(`Updating tenant: ${tenant.name} (${tenant.slug})`);
      console.log(
        `  Old booking fee: £${
          (tenant.paymentSettings?.platformFeePerBooking || 0) / 100
        }`
      );
      console.log(
        `  Old product fee: £${
          (tenant.paymentSettings?.platformFeePerProduct || 0) / 100
        }`
      );

      tenant.paymentSettings = tenant.paymentSettings || {};
      tenant.paymentSettings.platformFeePerBooking = 99;
      tenant.paymentSettings.platformFeePerProduct = 99;

      await tenant.save();

      console.log(`  ✅ Updated to £0.99 for both fees\n`);
    }

    console.log(`\n✅ Successfully updated ${tenants.length} tenant(s)`);

    await mongoose.disconnect();
    console.log("✅ Database connection closed");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

updatePlatformFees();
