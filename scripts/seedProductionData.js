/**
 * Seed production data for a specific tenant
 * Usage: node scripts/seedProductionData.js <tenantId>
 * Example: node scripts/seedProductionData.js 69275d2f4e765b23d7253837
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import Service from "../src/models/Service.js";
import Beautician from "../src/models/Beautician.js";

dotenv.config();

const MONGO_URI =
  process.env.MONGO_URI || "mongodb://localhost:27017/booking-app";

// Get tenantId from command line argument
const tenantIdArg = process.argv[2];

if (!tenantIdArg) {
  console.error("❌ Error: Please provide a tenantId as argument");
  console.error("Usage: node scripts/seedProductionData.js <tenantId>");
  process.exit(1);
}

let tenantId;
try {
  tenantId = new mongoose.Types.ObjectId(tenantIdArg);
} catch (err) {
  console.error("❌ Error: Invalid tenantId format");
  process.exit(1);
}

// Sample services data
const servicesData = [
  {
    name: "Classic Haircut",
    description: "Professional haircut with styling",
    duration: 30,
    price: 25,
    category: "Hair",
    active: true,
  },
  {
    name: "Hair Coloring",
    description: "Full hair color treatment",
    duration: 120,
    price: 80,
    category: "Hair",
    active: true,
  },
  {
    name: "Deep Cleansing Facial",
    description:
      "Relaxing facial treatment to cleanse and rejuvenate your skin",
    duration: 60,
    price: 50,
    category: "Facial",
    active: true,
  },
  {
    name: "Manicure",
    description: "Complete nail care with polish",
    duration: 45,
    price: 30,
    category: "Nails",
    active: true,
  },
  {
    name: "Pedicure",
    description: "Foot care treatment with polish",
    duration: 60,
    price: 40,
    category: "Nails",
    active: true,
  },
  {
    name: "Swedish Massage",
    description: "Relaxing full body massage",
    duration: 60,
    price: 60,
    category: "Massage",
    active: true,
  },
  {
    name: "Eyebrow Shaping",
    description: "Professional eyebrow threading or waxing",
    duration: 15,
    price: 15,
    category: "Beauty",
    active: true,
  },
  {
    name: "Makeup Application",
    description: "Professional makeup for special occasions",
    duration: 45,
    price: 50,
    category: "Beauty",
    active: true,
  },
];

// Sample beautician/staff data - names vary by tenant
const getBeauticiansData = (tenantName) => {
  const staffSets = {
    default: [
      {
        name: "Emma Wilson",
        email: "emma@example.com",
        phone: "+447700900001",
        specialties: ["Hair", "Nails"],
        bio: "10 years of experience in hair styling and nail art",
        active: true,
        image: {
          provider: "placeholder",
          url: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=800&h=800&fit=crop",
          alt: "Emma Wilson - Hair and Nails Specialist",
          width: 800,
          height: 800,
        },
        workingHours: {
          monday: { isWorking: true, start: "09:00", end: "17:00" },
          tuesday: { isWorking: true, start: "09:00", end: "17:00" },
          wednesday: { isWorking: true, start: "09:00", end: "17:00" },
          thursday: { isWorking: true, start: "09:00", end: "17:00" },
          friday: { isWorking: true, start: "09:00", end: "18:00" },
          saturday: { isWorking: true, start: "10:00", end: "16:00" },
          sunday: { isWorking: false, start: "00:00", end: "00:00" },
        },
      },
      {
        name: "Sarah Johnson",
        email: "sarah@example.com",
        phone: "+447700900002",
        specialties: ["Facial", "Massage", "Beauty"],
        bio: "Certified beautician specializing in skincare and massage therapy",
        active: true,
        image: {
          provider: "placeholder",
          url: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=800&h=800&fit=crop",
          alt: "Sarah Johnson - Facial and Massage Specialist",
          width: 800,
          height: 800,
        },
        workingHours: {
          monday: { isWorking: true, start: "10:00", end: "18:00" },
          tuesday: { isWorking: true, start: "10:00", end: "18:00" },
          wednesday: { isWorking: false, start: "00:00", end: "00:00" },
          thursday: { isWorking: true, start: "10:00", end: "18:00" },
          friday: { isWorking: true, start: "10:00", end: "18:00" },
          saturday: { isWorking: true, start: "09:00", end: "15:00" },
          sunday: { isWorking: false, start: "00:00", end: "00:00" },
        },
      },
    ],
    namboo: [
      {
        name: "Olivia Martinez",
        email: "olivia@example.com",
        phone: "+447700900011",
        specialties: ["Hair", "Nails"],
        bio: "Award-winning stylist with expertise in modern cuts and nail designs",
        active: true,
        image: {
          provider: "placeholder",
          url: "https://images.unsplash.com/photo-1594744803329-e58b31de8bf5?w=800&h=800&fit=crop",
          alt: "Olivia Martinez - Hair and Nails Expert",
          width: 800,
          height: 800,
        },
        workingHours: {
          monday: { isWorking: true, start: "09:00", end: "17:00" },
          tuesday: { isWorking: true, start: "09:00", end: "17:00" },
          wednesday: { isWorking: true, start: "09:00", end: "17:00" },
          thursday: { isWorking: true, start: "09:00", end: "17:00" },
          friday: { isWorking: true, start: "09:00", end: "18:00" },
          saturday: { isWorking: true, start: "10:00", end: "16:00" },
          sunday: { isWorking: false, start: "00:00", end: "00:00" },
        },
      },
      {
        name: "Sophia Chen",
        email: "sophia@example.com",
        phone: "+447700900012",
        specialties: ["Facial", "Massage", "Beauty"],
        bio: "Holistic beauty therapist specializing in natural treatments",
        active: true,
        image: {
          provider: "placeholder",
          url: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=800&h=800&fit=crop",
          alt: "Sophia Chen - Beauty and Wellness Therapist",
          width: 800,
          height: 800,
        },
        workingHours: {
          monday: { isWorking: true, start: "10:00", end: "18:00" },
          tuesday: { isWorking: true, start: "10:00", end: "18:00" },
          wednesday: { isWorking: false, start: "00:00", end: "00:00" },
          thursday: { isWorking: true, start: "10:00", end: "18:00" },
          friday: { isWorking: true, start: "10:00", end: "18:00" },
          saturday: { isWorking: true, start: "09:00", end: "15:00" },
          sunday: { isWorking: false, start: "00:00", end: "00:00" },
        },
      },
    ],
  };

  return staffSets[tenantName.toLowerCase()] || staffSets.default;
};

async function seedProductionData() {
  try {
    console.log("🔗 Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to MongoDB");

    // Verify tenant exists
    const tenant = await mongoose.connection.db
      .collection("tenants")
      .findOne({ _id: tenantId });

    if (!tenant) {
      console.error(`❌ Error: Tenant with ID ${tenantId} not found`);
      process.exit(1);
    }

    console.log(
      `\n📋 Seeding data for tenant: ${tenant.name} (${tenant.slug})`
    );

    // Check existing data
    const existingServices = await Service.countDocuments({ tenantId });
    const existingBeauticians = await Beautician.countDocuments({ tenantId });

    console.log(`\n📊 Current data:`);
    console.log(`   Services: ${existingServices}`);
    console.log(`   Beauticians: ${existingBeauticians}`);

    if (existingServices > 0 || existingBeauticians > 0) {
      console.log("\n⚠️  Warning: This tenant already has data.");
      console.log(
        "   This script will ADD new data, not replace existing data."
      );
      console.log(
        "   Press Ctrl+C to cancel, or wait 3 seconds to continue..."
      );
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    // Create services
    console.log("\n📝 Creating services...");
    const createdServices = [];
    for (const serviceData of servicesData) {
      const service = await Service.create({
        ...serviceData,
        tenantId,
      });
      createdServices.push(service);
      console.log(
        `   ✅ Created: ${service.name} (${service.duration}min, $${service.price})`
      );
    }

    // Create beauticians
    console.log("\n👥 Creating staff members...");
    const beauticiansData = getBeauticiansData(tenant.name);
    const createdBeauticians = [];
    for (const beauticianData of beauticiansData) {
      const beautician = await Beautician.create({
        ...beauticianData,
        tenantId,
      });
      createdBeauticians.push(beautician);
      console.log(
        `   ✅ Created: ${beautician.name} (${beautician.specialties.join(
          ", "
        )})`
      );
    }

    console.log("\n✅ Production data seeded successfully!");
    console.log(`\n📊 Summary:`);
    console.log(`   Services created: ${createdServices.length}`);
    console.log(`   Staff created: ${createdBeauticians.length}`);
    console.log(`   Tenant: ${tenant.name} (${tenantId})`);

    console.log(
      "\n🎉 Done! You can now view your services and staff in the admin dashboard."
    );
  } catch (error) {
    console.error("\n❌ Error seeding production data:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("\n🔌 Disconnected from MongoDB");
  }
}

seedProductionData();
