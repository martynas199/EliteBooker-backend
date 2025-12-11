import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

async function checkLocations() {
  try {
    const mongoUri =
      process.env.MONGODB_URI || "mongodb://localhost:27017/booking-app";
    console.log("Connecting to MongoDB...");
    await mongoose.connect(mongoUri);
    console.log("Connected!\n");

    // Check all locations in the database (raw collection query)
    const locations = await mongoose.connection.db
      .collection("locations")
      .find({})
      .toArray();

    console.log("=== ALL LOCATIONS IN DATABASE ===");
    console.log("Total count:", locations.length);
    console.log();

    locations.forEach((loc, i) => {
      console.log(`Location ${i + 1}:`);
      console.log("  _id:", loc._id);
      console.log("  name:", loc.name);
      console.log("  tenantId:", loc.tenantId);
      console.log("  tenant:", loc.tenant);
      console.log("  isActive:", loc.isActive);
      console.log("  isPrimary:", loc.isPrimary);
      console.log();
    });

    // Check tenants
    const tenants = await mongoose.connection.db
      .collection("tenants")
      .find({})
      .toArray();
    console.log("=== ALL TENANTS ===");
    tenants.forEach((t) => {
      console.log(
        "  Tenant:",
        t.businessName,
        "| ID:",
        t._id,
        "| Slug:",
        t.slug
      );
    });

    await mongoose.disconnect();
  } catch (error) {
    console.error("Error:", error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

checkLocations();
