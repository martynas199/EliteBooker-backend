import dotenv from "dotenv";
import mongoose from "mongoose";

// Import models
import Tenant from "./src/models/Tenant.js";
import Location from "./src/models/Location.js";

dotenv.config();

async function checkLocations() {
  try {
    // Connect to MongoDB
    const mongoUri =
      process.env.MONGODB_URI || "mongodb://localhost:27017/booking-app";
    console.log("Connecting to MongoDB...");
    await mongoose.connect(mongoUri);
    console.log("Connected to MongoDB\n");

    // Find Elite Beauty Group tenant
    const tenant = await Tenant.findOne({ slug: "elite-beauty-group" });

    if (!tenant) {
      console.log("❌ Elite Beauty Group tenant NOT FOUND");
      await mongoose.disconnect();
      return;
    }

    console.log("✅ Tenant found:", tenant.name);
    console.log("   Tenant ID:", tenant._id);
    console.log("   Slug:", tenant.slug);
    console.log();

    // Find all locations for this tenant
    const locations = await Location.find({ tenant: tenant._id });

    console.log(`📍 Locations count: ${locations.length}`);
    console.log();

    if (locations.length === 0) {
      console.log("❌ No locations found for this tenant");
    } else {
      locations.forEach((loc, index) => {
        console.log(`Location ${index + 1}:`);
        console.log(`  Name: ${loc.name}`);
        console.log(`  Primary: ${loc.isPrimary ? "⭐ YES" : "No"}`);
        console.log(`  Address: ${loc.address.street}, ${loc.address.city}`);
        console.log(`  Phone: ${loc.phone || "N/A"}`);
        console.log();
      });
    }

    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
  } catch (error) {
    console.error("Error:", error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

checkLocations();
