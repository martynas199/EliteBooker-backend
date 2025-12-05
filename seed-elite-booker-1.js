import mongoose from "mongoose";
import dotenv from "dotenv";
import Tenant from "./src/models/Tenant.js";
import Beautician from "./src/models/Beautician.js";
import Service from "./src/models/Service.js";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI.replace(/^["']|["']$/g, "").trim();

async function seedEliteBooker1() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      family: 4,
    });
    console.log("✓ Connected to MongoDB");

    // Find the elite-booker-1 tenant
    console.log("\nLooking for elite-booker-1 tenant...");
    const tenant = await Tenant.findOne({ slug: "elite-booker-1" });

    if (!tenant) {
      console.error("❌ Tenant 'elite-booker-1' not found!");
      console.log("\nAvailable tenants:");
      const tenants = await Tenant.find({}, "slug name");
      tenants.forEach((t) => console.log(`  - ${t.slug} (${t.name})`));
      process.exit(1);
    }

    console.log("✓ Found tenant:", tenant.name);

    // Create beauticians/staff
    console.log("\nCreating beauticians...");

    const beauticians = [
      {
        name: "Sarah Johnson",
        email: "sarah@elite-booker-1.com",
        phone: "+44 20 1111 2222",
        bio: "Expert stylist with 10+ years of experience in hair color and styling",
        specialties: ["Hair Coloring", "Hair Styling", "Balayage"],
        active: true,
        color: "#FF6B6B",
        workingHours: [
          { dayOfWeek: 1, start: "09:00", end: "17:00" }, // Monday
          { dayOfWeek: 2, start: "09:00", end: "17:00" }, // Tuesday
          { dayOfWeek: 3, start: "09:00", end: "17:00" }, // Wednesday
          { dayOfWeek: 4, start: "09:00", end: "17:00" }, // Thursday
          { dayOfWeek: 5, start: "09:00", end: "17:00" }, // Friday
        ],
        tenantId: tenant._id,
      },
      {
        name: "Emily Chen",
        email: "emily@elite-booker-1.com",
        phone: "+44 20 3333 4444",
        bio: "Nail art specialist and beauty therapist",
        specialties: ["Manicure", "Pedicure", "Nail Art", "Gel Nails"],
        active: true,
        color: "#4ECDC4",
        workingHours: [
          { dayOfWeek: 2, start: "10:00", end: "18:00" }, // Tuesday
          { dayOfWeek: 3, start: "10:00", end: "18:00" }, // Wednesday
          { dayOfWeek: 4, start: "10:00", end: "18:00" }, // Thursday
          { dayOfWeek: 5, start: "10:00", end: "18:00" }, // Friday
          { dayOfWeek: 6, start: "09:00", end: "15:00" }, // Saturday
        ],
        tenantId: tenant._id,
      },
      {
        name: "James Mitchell",
        email: "james@elite-booker-1.com",
        phone: "+44 20 5555 6666",
        bio: "Master barber specializing in men's grooming",
        specialties: ["Men's Haircut", "Beard Trim", "Hot Towel Shave"],
        active: true,
        color: "#95E1D3",
        workingHours: [
          { dayOfWeek: 1, start: "08:00", end: "16:00" }, // Monday
          { dayOfWeek: 2, start: "08:00", end: "16:00" }, // Tuesday
          { dayOfWeek: 3, start: "08:00", end: "16:00" }, // Wednesday
          { dayOfWeek: 4, start: "08:00", end: "16:00" }, // Thursday
          { dayOfWeek: 5, start: "08:00", end: "16:00" }, // Friday
          { dayOfWeek: 6, start: "09:00", end: "13:00" }, // Saturday
        ],
        tenantId: tenant._id,
      },
      {
        name: "Maria Rodriguez",
        email: "maria@elite-booker-1.com",
        phone: "+44 20 7777 8888",
        bio: "Licensed esthetician and skincare expert",
        specialties: ["Facial", "Chemical Peel", "Microdermabrasion", "Waxing"],
        active: true,
        color: "#F38181",
        workingHours: [
          { dayOfWeek: 1, start: "10:00", end: "19:00" }, // Monday
          { dayOfWeek: 3, start: "10:00", end: "19:00" }, // Wednesday
          { dayOfWeek: 4, start: "10:00", end: "19:00" }, // Thursday
          { dayOfWeek: 5, start: "10:00", end: "19:00" }, // Friday
          { dayOfWeek: 6, start: "10:00", end: "16:00" }, // Saturday
        ],
        tenantId: tenant._id,
      },
    ];

    const createdBeauticians = [];
    for (const beautician of beauticians) {
      const existing = await Beautician.findOne({
        email: beautician.email,
        tenantId: tenant._id,
      });

      if (!existing) {
        const created = await Beautician.create(beautician);
        createdBeauticians.push(created);
        console.log(`✓ Created beautician: ${created.name}`);
      } else {
        createdBeauticians.push(existing);
        console.log(`✓ Beautician already exists: ${existing.name}`);
      }
    }

    // Create services
    console.log("\nCreating services...");

    const services = [
      // Hair Services
      {
        name: "Women's Haircut & Style",
        category: "Hair",
        description: "Complete haircut with wash, cut, style and blow dry",
        price: 45,
        duration: 60,
        primaryBeauticianId: createdBeauticians[0]._id, // Sarah Johnson
        active: true,
        tenantId: tenant._id,
      },
      {
        name: "Men's Haircut",
        category: "Hair",
        description: "Classic men's haircut with styling",
        price: 25,
        duration: 30,
        primaryBeauticianId: createdBeauticians[2]._id, // James Mitchell
        active: true,
        tenantId: tenant._id,
      },
      {
        name: "Hair Coloring - Full",
        category: "Hair",
        description: "Full hair color application with toning",
        price: 85,
        duration: 120,
        primaryBeauticianId: createdBeauticians[0]._id, // Sarah Johnson
        active: true,
        tenantId: tenant._id,
      },
      {
        name: "Balayage Highlights",
        category: "Hair",
        description: "Hand-painted highlights for a natural look",
        price: 120,
        duration: 180,
        primaryBeauticianId: createdBeauticians[0]._id, // Sarah Johnson
        active: true,
        tenantId: tenant._id,
      },
      {
        name: "Beard Trim & Shape",
        category: "Hair",
        description: "Professional beard trimming and shaping",
        price: 20,
        duration: 20,
        primaryBeauticianId: createdBeauticians[2]._id, // James Mitchell
        active: true,
        tenantId: tenant._id,
      },

      // Nail Services
      {
        name: "Classic Manicure",
        category: "Nails",
        description: "Nail shaping, cuticle care, polish",
        price: 30,
        duration: 45,
        primaryBeauticianId: createdBeauticians[1]._id, // Emily Chen
        active: true,
        tenantId: tenant._id,
      },
      {
        name: "Gel Manicure",
        category: "Nails",
        description: "Long-lasting gel polish manicure",
        price: 40,
        duration: 60,
        primaryBeauticianId: createdBeauticians[1]._id, // Emily Chen
        active: true,
        tenantId: tenant._id,
      },
      {
        name: "Luxury Pedicure",
        category: "Nails",
        description: "Full pedicure with exfoliation and massage",
        price: 50,
        duration: 75,
        primaryBeauticianId: createdBeauticians[1]._id, // Emily Chen
        active: true,
        tenantId: tenant._id,
      },
      {
        name: "Nail Art - Simple Design",
        category: "Nails",
        description: "Custom nail art on up to 5 nails",
        price: 15,
        duration: 30,
        primaryBeauticianId: createdBeauticians[1]._id, // Emily Chen
        active: true,
        tenantId: tenant._id,
      },

      // Skincare Services
      {
        name: "Express Facial",
        category: "Skincare",
        description: "Quick cleansing facial for busy schedules",
        price: 45,
        duration: 30,
        primaryBeauticianId: createdBeauticians[3]._id, // Maria Rodriguez
        active: true,
        tenantId: tenant._id,
      },
      {
        name: "Signature Facial",
        category: "Skincare",
        description: "Deep cleansing facial with extractions and mask",
        price: 75,
        duration: 60,
        primaryBeauticianId: createdBeauticians[3]._id, // Maria Rodriguez
        active: true,
        tenantId: tenant._id,
      },
      {
        name: "Anti-Aging Facial",
        category: "Skincare",
        description: "Specialized treatment for mature skin",
        price: 95,
        duration: 75,
        primaryBeauticianId: createdBeauticians[3]._id, // Maria Rodriguez
        active: true,
        tenantId: tenant._id,
      },
      {
        name: "Chemical Peel",
        category: "Skincare",
        description: "Professional chemical peel for skin rejuvenation",
        price: 120,
        duration: 45,
        primaryBeauticianId: createdBeauticians[3]._id, // Maria Rodriguez
        active: true,
        tenantId: tenant._id,
      },
      {
        name: "Eyebrow Wax & Shape",
        category: "Waxing",
        description: "Professional eyebrow shaping and waxing",
        price: 18,
        duration: 15,
        primaryBeauticianId: createdBeauticians[3]._id, // Maria Rodriguez
        active: true,
        tenantId: tenant._id,
      },
      {
        name: "Full Face Waxing",
        category: "Waxing",
        description: "Complete facial hair removal",
        price: 35,
        duration: 30,
        primaryBeauticianId: createdBeauticians[3]._id, // Maria Rodriguez
        active: true,
        tenantId: tenant._id,
      },
    ];

    for (const service of services) {
      const existing = await Service.findOne({
        name: service.name,
        tenantId: tenant._id,
      });

      if (!existing) {
        await Service.create(service);
        console.log(`✓ Created service: ${service.name} - £${service.price}`);
      } else {
        console.log(`✓ Service already exists: ${existing.name}`);
      }
    }

    console.log("\n✅ Seeding completed successfully!");
    console.log("\nSummary:");
    console.log(`- Tenant: ${tenant.name} (${tenant.slug})`);
    console.log(`- Staff members: ${createdBeauticians.length}`);
    console.log(`- Services: ${services.length}`);
    console.log(
      `\nAccess at: https://www.elitebooker.co.uk/salon/${tenant.slug}`
    );

    process.exit(0);
  } catch (error) {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  }
}

seedEliteBooker1();
