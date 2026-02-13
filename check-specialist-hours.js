import mongoose from "mongoose";
import dotenv from "dotenv";
import Specialist from "./src/models/Specialist.js";
import Tenant from "./src/models/Tenant.js";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI.replace(/^["']|["']$/g, "").trim();

async function checkSpecialistHours() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      family: 4,
    });
    console.log("✓ Connected to MongoDB");

    const tenant = await Tenant.findOne({ slug: "luxe-lashes" });
    
    if (!tenant) {
      console.error("❌ Tenant not found!");
      process.exit(1);
    }

    const specialist = await Specialist.findOne({
      email: "isabella@luxelashes.com",
      tenantId: tenant._id,
    });

    if (!specialist) {
      console.error("❌ Specialist not found!");
      process.exit(1);
    }

    console.log("\n📋 Specialist Working Hours:");
    console.log("─────────────────────────────────────");
    console.log("Name:", specialist.name);
    console.log("Active:", specialist.active);
    console.log("\nWorking Hours:");
    
    if (specialist.workingHours && specialist.workingHours.length > 0) {
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      specialist.workingHours.forEach(wh => {
        console.log(`  ${days[wh.dayOfWeek]}: ${wh.start} - ${wh.end}`);
      });
    } else {
      console.log("  ⚠️  No working hours set!");
    }
    console.log("─────────────────────────────────────");

    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

checkSpecialistHours();
