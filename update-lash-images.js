import mongoose from "mongoose";
import dotenv from "dotenv";
import Service from "./src/models/Service.js";
import Tenant from "./src/models/Tenant.js";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI.replace(/^["']|["']$/g, "").trim();

async function updateLashImages() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      family: 4,
    });
    console.log("✓ Connected to MongoDB");

    // Find the luxe-lashes tenant
    const tenant = await Tenant.findOne({ slug: "luxe-lashes" });
    
    if (!tenant) {
      console.error("❌ Tenant 'luxe-lashes' not found!");
      process.exit(1);
    }

    console.log("✓ Found tenant:", tenant.name);

    // Service images mapping
    const serviceImages = {
      "Classic Lash Extensions": {
        provider: "unsplash",
        url: "https://images.unsplash.com/photo-1588783948922-ac266f6c5eef?w=800&h=600&fit=crop",
        alt: "Classic Lash Extensions",
        width: 800,
        height: 600,
      },
      "Volume Lash Extensions": {
        provider: "unsplash",
        url: "https://images.unsplash.com/photo-1583001931096-959e0c1a6d56?w=800&h=600&fit=crop",
        alt: "Volume Lash Extensions",
        width: 800,
        height: 600,
      },
      "Mega Volume Lash Extensions": {
        provider: "unsplash",
        url: "https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=800&h=600&fit=crop",
        alt: "Mega Volume Lash Extensions",
        width: 800,
        height: 600,
      },
      "Hybrid Lash Extensions": {
        provider: "unsplash",
        url: "https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?w=800&h=600&fit=crop",
        alt: "Hybrid Lash Extensions",
        width: 800,
        height: 600,
      },
      "Lash Fill - 2 Weeks": {
        provider: "unsplash",
        url: "https://images.unsplash.com/photo-1519699047748-de8e457a634e?w=800&h=600&fit=crop",
        alt: "Lash Fill - 2 Weeks",
        width: 800,
        height: 600,
      },
      "Lash Fill - 3 Weeks": {
        provider: "unsplash",
        url: "https://images.unsplash.com/photo-1631730486572-226d1f595b68?w=800&h=600&fit=crop",
        alt: "Lash Fill - 3 Weeks",
        width: 800,
        height: 600,
      },
      "Lash Lift & Tint": {
        provider: "unsplash",
        url: "https://images.unsplash.com/photo-1620843002805-05a08cb72f57?w=800&h=600&fit=crop",
        alt: "Lash Lift & Tint",
        width: 800,
        height: 600,
      },
      "Lash Removal": {
        provider: "unsplash",
        url: "https://images.unsplash.com/photo-1596704017254-9b121068ec31?w=800&h=600&fit=crop",
        alt: "Lash Removal",
        width: 800,
        height: 600,
      },
      "Lash Consultation": {
        provider: "unsplash",
        url: "https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?w=800&h=600&fit=crop",
        alt: "Lash Consultation",
        width: 800,
        height: 600,
      },
    };

    console.log("\nUpdating service images...");
    
    for (const [serviceName, imageData] of Object.entries(serviceImages)) {
      const service = await Service.findOne({
        name: serviceName,
        tenantId: tenant._id,
      });

      if (service) {
        service.image = imageData;
        await service.save();
        console.log(`✓ Updated: ${serviceName}`);
      } else {
        console.log(`⚠ Not found: ${serviceName}`);
      }
    }

    console.log("\n✅ All images updated successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error updating images:", error);
    process.exit(1);
  }
}

updateLashImages();
