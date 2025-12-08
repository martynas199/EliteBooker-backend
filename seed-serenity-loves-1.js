import mongoose from "mongoose";
import dotenv from "dotenv";
import Tenant from "./src/models/Tenant.js";
import Specialist from "./src/models/Specialist.js";
import Service from "./src/models/Service.js";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI.replace(/^["']|["']$/g, "").trim();

async function seedSerenityLoves1() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      family: 4,
    });
    console.log("✓ Connected to MongoDB");

    // Find the serenity-loves-1 tenant
    console.log("\nLooking for serenity-loves-1 tenant...");
    const tenant = await Tenant.findOne({ slug: "serenity-loves-1" });

    if (!tenant) {
      console.error("❌ Tenant 'serenity-loves-1' not found!");
      console.log("\nAvailable tenants:");
      const tenants = await Tenant.find({}, "slug name");
      tenants.forEach((t) => console.log(`  - ${t.slug} (${t.name})`));
      process.exit(1);
    }

    console.log("✓ Found tenant:", tenant.name);

    // Create specialists/therapists
    console.log("\nCreating specialists...");

    const specialists = [
      {
        name: "Luna Martinez",
        email: "luna@serenity-loves-1.com",
        phone: "+44 20 1111 1111",
        bio: "Certified massage therapist specializing in deep tissue and Swedish massage with 12+ years of experience",
        specialties: [
          "Deep Tissue Massage",
          "Swedish Massage",
          "Hot Stone Massage",
        ],
        active: true,
        color: "#9B59B6",
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
        name: "Zen Nakamura",
        email: "zen@serenity-loves-1.com",
        phone: "+44 20 2222 2222",
        bio: "Aromatherapy and reflexology expert bringing balance and healing",
        specialties: ["Aromatherapy", "Reflexology", "Thai Massage"],
        active: true,
        color: "#3498DB",
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
        name: "Harmony Blake",
        email: "harmony@serenity-loves-1.com",
        phone: "+44 20 3333 3333",
        bio: "Holistic wellness practitioner specializing in prenatal care and energy healing",
        specialties: ["Prenatal Massage", "Reiki", "Energy Healing"],
        active: true,
        color: "#1ABC9C",
        workingHours: [
          { dayOfWeek: 1, start: "10:00", end: "18:00" }, // Monday
          { dayOfWeek: 3, start: "10:00", end: "18:00" }, // Wednesday
          { dayOfWeek: 4, start: "10:00", end: "18:00" }, // Thursday
          { dayOfWeek: 5, start: "10:00", end: "18:00" }, // Friday
          { dayOfWeek: 6, start: "10:00", end: "16:00" }, // Saturday
        ],
        tenantId: tenant._id,
      },
      {
        name: "Serenity Park",
        email: "serenity@serenity-loves-1.com",
        phone: "+44 20 4444 4444",
        bio: "Certified yoga instructor and meditation guide specializing in stress relief",
        specialties: ["Yoga", "Meditation", "Mindfulness", "Breathwork"],
        active: true,
        color: "#E74C3C",
        workingHours: [
          { dayOfWeek: 1, start: "08:00", end: "16:00" }, // Monday
          { dayOfWeek: 2, start: "08:00", end: "16:00" }, // Tuesday
          { dayOfWeek: 3, start: "08:00", end: "16:00" }, // Wednesday
          { dayOfWeek: 5, start: "08:00", end: "16:00" }, // Friday
          { dayOfWeek: 6, start: "09:00", end: "13:00" }, // Saturday
        ],
        tenantId: tenant._id,
      },
      {
        name: "Aurora Chen",
        email: "aurora@serenity-loves-1.com",
        phone: "+44 20 5555 5555",
        bio: "Licensed esthetician and spa therapist specializing in holistic skincare",
        specialties: ["Facials", "Body Wraps", "Scrubs", "Natural Skincare"],
        active: true,
        color: "#F39C12",
        workingHours: [
          { dayOfWeek: 1, start: "09:00", end: "17:00" }, // Monday
          { dayOfWeek: 2, start: "09:00", end: "17:00" }, // Tuesday
          { dayOfWeek: 4, start: "09:00", end: "17:00" }, // Thursday
          { dayOfWeek: 5, start: "09:00", end: "17:00" }, // Friday
          { dayOfWeek: 6, start: "10:00", end: "16:00" }, // Saturday
        ],
        tenantId: tenant._id,
      },
    ];

    const createdSpecialists = [];
    for (const specialist of specialists) {
      const existing = await Specialist.findOne({
        email: specialist.email,
        tenantId: tenant._id,
      });

      if (!existing) {
        const created = await Specialist.create(specialist);
        createdSpecialists.push(created);
        console.log(`✓ Created specialist: ${created.name}`);
      } else {
        createdSpecialists.push(existing);
        console.log(`✓ Specialist already exists: ${existing.name}`);
      }
    }

    // Create services
    console.log("\nCreating services...");

    const services = [
      // Massage Services
      {
        name: "Swedish Relaxation Massage",
        category: "Massage",
        description:
          "Gentle, flowing massage to promote deep relaxation and stress relief",
        variants: [
          { name: "60 Minutes", price: 75, durationMin: 60 },
          { name: "90 Minutes", price: 105, durationMin: 90 },
        ],
        primaryBeauticianId: createdSpecialists[0]._id, // Luna Martinez
        beauticianIds: [createdSpecialists[0]._id],
        active: true,
        tenantId: tenant._id,
      },
      {
        name: "Deep Tissue Massage",
        category: "Massage",
        description:
          "Targeted pressure to release chronic muscle tension and knots",
        variants: [
          { name: "60 Minutes", price: 85, durationMin: 60 },
          { name: "90 Minutes", price: 120, durationMin: 90 },
        ],
        primaryBeauticianId: createdSpecialists[0]._id, // Luna Martinez
        beauticianIds: [createdSpecialists[0]._id],
        active: true,
        tenantId: tenant._id,
      },
      {
        name: "Hot Stone Massage",
        category: "Massage",
        description:
          "Heated stones combined with massage for ultimate relaxation",
        variants: [
          { name: "75 Minutes", price: 95, durationMin: 75 },
          { name: "90 Minutes", price: 115, durationMin: 90 },
        ],
        primaryBeauticianId: createdSpecialists[0]._id, // Luna Martinez
        beauticianIds: [createdSpecialists[0]._id],
        active: true,
        tenantId: tenant._id,
      },
      {
        name: "Aromatherapy Massage",
        category: "Massage",
        description:
          "Therapeutic massage using essential oils for healing and balance",
        variants: [
          { name: "60 Minutes", price: 80, durationMin: 60 },
          { name: "90 Minutes", price: 110, durationMin: 90 },
        ],
        primaryBeauticianId: createdSpecialists[1]._id, // Zen Nakamura
        beauticianIds: [createdSpecialists[1]._id],
        active: true,
        tenantId: tenant._id,
      },
      {
        name: "Thai Massage",
        category: "Massage",
        description:
          "Traditional Thai massage with stretching and pressure points",
        variants: [
          { name: "60 Minutes", price: 85, durationMin: 60 },
          { name: "90 Minutes", price: 115, durationMin: 90 },
        ],
        primaryBeauticianId: createdSpecialists[1]._id, // Zen Nakamura
        beauticianIds: [createdSpecialists[1]._id],
        active: true,
        tenantId: tenant._id,
      },
      {
        name: "Prenatal Massage",
        category: "Massage",
        description:
          "Specialized massage for expecting mothers (after first trimester)",
        variants: [
          { name: "60 Minutes", price: 80, durationMin: 60 },
          { name: "75 Minutes", price: 95, durationMin: 75 },
        ],
        primaryBeauticianId: createdSpecialists[2]._id, // Harmony Blake
        beauticianIds: [createdSpecialists[2]._id],
        active: true,
        tenantId: tenant._id,
      },
      {
        name: "Couples Massage",
        category: "Massage",
        description: "Side-by-side massage for two in our couples suite",
        variants: [
          { name: "60 Minutes", price: 160, durationMin: 60 },
          { name: "90 Minutes", price: 220, durationMin: 90 },
        ],
        primaryBeauticianId: createdSpecialists[0]._id,
        beauticianIds: [createdSpecialists[0]._id, createdSpecialists[1]._id],
        active: true,
        tenantId: tenant._id,
      },

      // Reflexology & Energy Healing
      {
        name: "Foot Reflexology",
        category: "Reflexology",
        description:
          "Pressure point therapy on feet to promote healing throughout the body",
        variants: [
          { name: "45 Minutes", price: 55, durationMin: 45 },
          { name: "60 Minutes", price: 70, durationMin: 60 },
        ],
        primaryBeauticianId: createdSpecialists[1]._id, // Zen Nakamura
        beauticianIds: [createdSpecialists[1]._id],
        active: true,
        tenantId: tenant._id,
      },
      {
        name: "Reiki Healing Session",
        category: "Energy Healing",
        description:
          "Energy healing to restore balance and promote natural healing",
        variants: [
          { name: "45 Minutes", price: 65, durationMin: 45 },
          { name: "60 Minutes", price: 85, durationMin: 60 },
        ],
        primaryBeauticianId: createdSpecialists[2]._id, // Harmony Blake
        beauticianIds: [createdSpecialists[2]._id],
        active: true,
        tenantId: tenant._id,
      },

      // Yoga & Meditation
      {
        name: "Private Yoga Session",
        category: "Yoga",
        description: "One-on-one yoga instruction tailored to your needs",
        variants: [
          { name: "60 Minutes", price: 70, durationMin: 60 },
          { name: "90 Minutes", price: 95, durationMin: 90 },
        ],
        primaryBeauticianId: createdSpecialists[3]._id, // Serenity Park
        beauticianIds: [createdSpecialists[3]._id],
        active: true,
        tenantId: tenant._id,
      },
      {
        name: "Guided Meditation",
        category: "Meditation",
        description:
          "Personal meditation guidance for stress relief and mindfulness",
        variants: [
          { name: "30 Minutes", price: 40, durationMin: 30 },
          { name: "45 Minutes", price: 55, durationMin: 45 },
        ],
        primaryBeauticianId: createdSpecialists[3]._id, // Serenity Park
        beauticianIds: [createdSpecialists[3]._id],
        active: true,
        tenantId: tenant._id,
      },
      {
        name: "Breathwork Session",
        category: "Wellness",
        description: "Breathing techniques for anxiety relief and energy",
        variants: [
          { name: "45 Minutes", price: 50, durationMin: 45 },
          { name: "60 Minutes", price: 65, durationMin: 60 },
        ],
        primaryBeauticianId: createdSpecialists[3]._id, // Serenity Park
        beauticianIds: [createdSpecialists[3]._id],
        active: true,
        tenantId: tenant._id,
      },

      // Spa Facials & Body Treatments
      {
        name: "Serenity Signature Facial",
        category: "Facial",
        description:
          "Customized facial with organic products for all skin types",
        variants: [
          { name: "60 Minutes", price: 85, durationMin: 60 },
          { name: "90 Minutes Deluxe", price: 120, durationMin: 90 },
        ],
        primaryBeauticianId: createdSpecialists[4]._id, // Aurora Chen
        beauticianIds: [createdSpecialists[4]._id],
        active: true,
        tenantId: tenant._id,
      },
      {
        name: "Anti-Aging Facial",
        category: "Facial",
        description:
          "Rejuvenating treatment with collagen boost and LED therapy",
        variants: [{ name: "75 Minutes", price: 110, durationMin: 75 }],
        primaryBeauticianId: createdSpecialists[4]._id, // Aurora Chen
        beauticianIds: [createdSpecialists[4]._id],
        active: true,
        tenantId: tenant._id,
      },
      {
        name: "Detox Body Wrap",
        category: "Body Treatment",
        description: "Full body wrap to detoxify and nourish skin",
        variants: [{ name: "75 Minutes", price: 95, durationMin: 75 }],
        primaryBeauticianId: createdSpecialists[4]._id, // Aurora Chen
        beauticianIds: [createdSpecialists[4]._id],
        active: true,
        tenantId: tenant._id,
      },
      {
        name: "Sea Salt Body Scrub",
        category: "Body Treatment",
        description: "Exfoliating scrub followed by moisturizing treatment",
        variants: [
          { name: "45 Minutes", price: 65, durationMin: 45 },
          { name: "60 Minutes", price: 80, durationMin: 60 },
        ],
        primaryBeauticianId: createdSpecialists[4]._id, // Aurora Chen
        beauticianIds: [createdSpecialists[4]._id],
        active: true,
        tenantId: tenant._id,
      },

      // Spa Packages
      {
        name: "Ultimate Serenity Package",
        category: "Spa Package",
        description: "90-min massage, 60-min facial, and reflexology session",
        variants: [{ name: "4 Hours", price: 280, durationMin: 240 }],
        primaryBeauticianId: createdSpecialists[0]._id,
        beauticianIds: [
          createdSpecialists[0]._id,
          createdSpecialists[1]._id,
          createdSpecialists[4]._id,
        ],
        active: true,
        tenantId: tenant._id,
      },
      {
        name: "Mini Spa Escape",
        category: "Spa Package",
        description: "60-min massage and 30-min express facial",
        variants: [{ name: "2 Hours", price: 140, durationMin: 120 }],
        primaryBeauticianId: createdSpecialists[0]._id,
        beauticianIds: [createdSpecialists[0]._id, createdSpecialists[4]._id],
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
        const priceInfo = service.variants
          ? `${service.variants.length} variants`
          : `£${service.price}`;
        console.log(`✓ Created service: ${service.name} - ${priceInfo}`);
      } else {
        console.log(`✓ Service already exists: ${existing.name}`);
      }
    }

    console.log("\n✅ Seeding completed successfully!");
    console.log("\nSummary:");
    console.log(`- Tenant: ${tenant.name} (${tenant.slug})`);
    console.log(`- Specialists/Therapists: ${createdSpecialists.length}`);
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

seedSerenityLoves1();
