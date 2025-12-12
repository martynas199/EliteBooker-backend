/**
 * Geocode tenant addresses and add location coordinates
 * Run with: node scripts/geocode-tenants.js
 */

import mongoose from "mongoose";
import Tenant from "../src/models/Tenant.js";
import "dotenv/config";

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/booking-dev";
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

async function geocodeAddress(address) {
  if (!GOOGLE_MAPS_API_KEY) {
    console.log("⚠️  No Google Maps API key found, using mock coordinates");
    // Return London coordinates as fallback
    return { lat: 51.5074, lng: -0.1278 };
  }

  try {
    const addressString = [
      address.street,
      address.city,
      address.state,
      address.postalCode,
      address.country,
    ]
      .filter(Boolean)
      .join(", ");

    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
      addressString
    )}&key=${GOOGLE_MAPS_API_KEY}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.status === "OK" && data.results.length > 0) {
      const { lat, lng } = data.results[0].geometry.location;
      return { lat, lng };
    } else {
      console.log(`⚠️  Geocoding failed for: ${addressString}`);
      return null;
    }
  } catch (error) {
    console.error("Geocoding error:", error.message);
    return null;
  }
}

async function geocodeTenants() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("✓ Connected to MongoDB");

    // Find tenants without location coordinates
    const tenants = await Tenant.find({
      $or: [{ "location.coordinates": { $exists: false } }, { location: null }],
    });

    console.log(`\nFound ${tenants.length} tenants without coordinates\n`);

    for (const tenant of tenants) {
      console.log(`Processing: ${tenant.name}`);

      if (!tenant.address || !tenant.address.city) {
        console.log(
          `  ⚠️  Skipping - no address data. Consider adding manually.\n`
        );
        continue;
      }

      const coords = await geocodeAddress(tenant.address);

      if (coords) {
        tenant.location = {
          type: "Point",
          coordinates: [coords.lng, coords.lat], // GeoJSON format: [longitude, latitude]
        };

        await tenant.save();
        console.log(
          `  ✓ Updated with coordinates: [${coords.lng}, ${coords.lat}]\n`
        );
      } else {
        console.log(`  ✗ Failed to geocode address\n`);
      }

      // Add a small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    console.log("\n✓ Geocoding complete!");
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

geocodeTenants();
