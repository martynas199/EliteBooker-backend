import mongoose from "mongoose";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import Admin from "./src/models/Admin.js";
import Tenant from "./src/models/Tenant.js";
import Specialist from "./src/models/Specialist.js";
import Service from "./src/models/Service.js";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI.replace(/^["']|["']$/g, "").trim();

async function seedLashTech() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      family: 4,
    });
    console.log("✓ Connected to MongoDB");

    // Create admin account
    console.log("\nCreating admin account...");
    const adminEmail = "admin@luxelashes.com";
    
    let admin = await Admin.findOne({ email: adminEmail });
    
    if (!admin) {
      const hashedPassword = await bcrypt.hash("LuxeLashes2024!", 10);
      admin = await Admin.create({
        name: "Luxe Lashes Studio",
        email: adminEmail,
        password: hashedPassword,
        phone: "+44 20 7946 0958",
        businessName: "Luxe Lashes Studio",
        role: "super_admin",
        isActive: true,
      });
      console.log("✓ Created admin account");
      console.log(`   Email: ${adminEmail}`);
      console.log(`   Password: LuxeLashes2024!`);
    } else {
      console.log("✓ Admin account already exists");
    }

    // Create tenant
    console.log("\nCreating tenant...");
    const tenantSlug = "luxe-lashes";
    
    let tenant = await Tenant.findOne({ slug: tenantSlug });
    
    if (!tenant) {
      tenant = await Tenant.create({
        slug: tenantSlug,
        name: "Luxe Lashes Studio",
        businessName: "Luxe Lashes Studio",
        email: adminEmail,
        phone: "+44 20 7946 0958",
        domain: `${tenantSlug}.elitebooker.co.uk`,
        ownerId: admin._id,
        stripeAccountId: "acct_test_dummy_account", // Dummy Stripe test account
        stripeChargesEnabled: true,
        stripePayoutsEnabled: true,
        settings: {
          bookingWindow: 60,
          allowCancellation: true,
          cancellationDeadline: 24,
          requireDeposit: false,
          depositAmount: 0,
          currency: "GBP",
          timezone: "Europe/London",
          businessHours: {
            monday: { open: "09:00", close: "18:00" },
            tuesday: { open: "09:00", close: "18:00" },
            wednesday: { open: "09:00", close: "18:00" },
            thursday: { open: "09:00", close: "19:00" },
            friday: { open: "09:00", close: "19:00" },
            saturday: { open: "10:00", close: "16:00" },
            sunday: { open: false, close: false },
          },
        },
        status: "active",
        subscriptionTier: "premium",
      });
      console.log("✓ Created tenant:", tenant.name);
    } else {
      console.log("✓ Tenant already exists:", tenant.name);
      // Update with Stripe test account if not set
      if (!tenant.stripeAccountId) {
        tenant.stripeAccountId = "acct_test_dummy_account";
        tenant.stripeChargesEnabled = true;
        tenant.stripePayoutsEnabled = true;
        await tenant.save();
        console.log("✓ Updated tenant with dummy Stripe account");
      }
    }

    // Create specialist
    console.log("\nCreating specialist...");
    
    const specialistData = {
      name: "Isabella Martinez",
      email: "isabella@luxelashes.com",
      phone: "+44 7700 900123",
      bio: "Certified lash artist with 5+ years of experience. Specializing in volume lashes, mega volume, and lash lifts. Trained in classic and Russian volume techniques.",
      specialties: ["Volume Lashes", "Mega Volume", "Classic Lashes", "Lash Lift", "Hybrid Lashes"],
      active: true,
      color: "#E91E63",
      image: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=400&h=400&fit=crop",
      workingHours: [
        { dayOfWeek: 1, start: "09:00", end: "18:00" }, // Monday
        { dayOfWeek: 2, start: "09:00", end: "18:00" }, // Tuesday
        { dayOfWeek: 3, start: "09:00", end: "18:00" }, // Wednesday
        { dayOfWeek: 4, start: "09:00", end: "19:00" }, // Thursday
        { dayOfWeek: 5, start: "09:00", end: "19:00" }, // Friday
        { dayOfWeek: 6, start: "10:00", end: "16:00" }, // Saturday
      ],
      tenantId: tenant._id,
    };

    let specialist = await Specialist.findOne({
      email: specialistData.email,
      tenantId: tenant._id,
    });

    if (!specialist) {
      specialist = await Specialist.create(specialistData);
      console.log(`✓ Created specialist: ${specialist.name}`);
    } else {
      console.log(`✓ Specialist already exists: ${specialist.name}`);
    }

    // Create lash services
    console.log("\nCreating lash services...");

    const services = [
      {
        name: "Classic Lash Extensions",
        category: "Lashes",
        description: "One extension per natural lash for a natural, elegant look. Perfect for everyday wear. Includes consultation, application, and aftercare instructions.",
        price: 85,
        durationMin: 120,
        primaryBeauticianId: specialist._id,
        active: true,
        image: {
          provider: "unsplash",
          url: "https://images.unsplash.com/photo-1588783948922-ac266f6c5eef?w=800&h=600&fit=crop",
          alt: "Classic Lash Extensions",
          width: 800,
          height: 600,
        },
        tenantId: tenant._id,
      },
      {
        name: "Volume Lash Extensions",
        category: "Lashes",
        description: "Multiple lightweight extensions per natural lash creating a fluffy, voluminous look. Ideal for special occasions or those wanting a more dramatic effect.",
        price: 120,
        durationMin: 150,
        primaryBeauticianId: specialist._id,
        active: true,
        image: {
          provider: "unsplash",
          url: "https://images.unsplash.com/photo-1583001931096-959e0c1a6d56?w=800&h=600&fit=crop",
          alt: "Volume Lash Extensions",
          width: 800,
          height: 600,
        },
        tenantId: tenant._id,
      },
      {
        name: "Mega Volume Lash Extensions",
        category: "Lashes",
        description: "Maximum volume with 6-10 ultra-fine extensions per natural lash. Creates an ultra-glamorous, full look. Russian volume technique.",
        price: 150,
        durationMin: 180,
        primaryBeauticianId: specialist._id,
        active: true,
        image: {
          provider: "unsplash",
          url: "https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=800&h=600&fit=crop",
          alt: "Mega Volume Lash Extensions",
          width: 800,
          height: 600,
        },
        tenantId: tenant._id,
      },
      {
        name: "Hybrid Lash Extensions",
        category: "Lashes",
        description: "Perfect blend of classic and volume techniques for a textured, wispy look. Best of both worlds - natural yet full.",
        price: 100,
        durationMin: 135,
        primaryBeauticianId: specialist._id,
        active: true,
        image: {
          provider: "unsplash",
          url: "https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?w=800&h=600&fit=crop",
          alt: "Hybrid Lash Extensions",
          width: 800,
          height: 600,
        },
        tenantId: tenant._id,
      },
      {
        name: "Lash Fill - 2 Weeks",
        category: "Lashes",
        description: "Maintenance session to fill in any gaps and replace outgrown lashes. Recommended every 2-3 weeks to maintain fullness.",
        price: 50,
        durationMin: 60,
        primaryBeauticianId: specialist._id,
        active: true,
        image: {
          provider: "unsplash",
          url: "https://images.unsplash.com/photo-1519699047748-de8e457a634e?w=800&h=600&fit=crop",
          alt: "Lash Fill - 2 Weeks",
          width: 800,
          height: 600,
        },
        tenantId: tenant._id,
      },
      {
        name: "Lash Fill - 3 Weeks",
        category: "Lashes",
        description: "Extended maintenance fill for those with slower lash growth cycles. Includes thorough cleaning and refill.",
        price: 65,
        durationMin: 75,
        primaryBeauticianId: specialist._id,
        active: true,
        image: {
          provider: "unsplash",
          url: "https://images.unsplash.com/photo-1631730486572-226d1f595b68?w=800&h=600&fit=crop",
          alt: "Lash Fill - 3 Weeks",
          width: 800,
          height: 600,
        },
        tenantId: tenant._id,
      },
      {
        name: "Lash Lift & Tint",
        category: "Lashes",
        description: "Natural lash enhancement - lifts, curls, and darkens your natural lashes. Lasts 6-8 weeks. Perfect for low-maintenance beauty.",
        price: 65,
        durationMin: 60,
        primaryBeauticianId: specialist._id,
        active: true,
        image: {
          provider: "unsplash",
          url: "https://images.unsplash.com/photo-1620843002805-05a08cb72f57?w=800&h=600&fit=crop",
          alt: "Lash Lift & Tint",
          width: 800,
          height: 600,
        },
        tenantId: tenant._id,
      },
      {
        name: "Lash Removal",
        category: "Lashes",
        description: "Safe and gentle professional removal of lash extensions. Includes conditioning treatment for natural lashes.",
        price: 25,
        durationMin: 30,
        primaryBeauticianId: specialist._id,
        active: true,
        image: {
          provider: "unsplash",
          url: "https://images.unsplash.com/photo-1596704017254-9b121068ec31?w=800&h=600&fit=crop",
          alt: "Lash Removal",
          width: 800,
          height: 600,
        },
        tenantId: tenant._id,
      },
      {
        name: "Lash Consultation",
        category: "Lashes",
        description: "Free consultation to discuss your desired look, assess your natural lashes, and determine the best style for you.",
        price: 0,
        durationMin: 15,
        primaryBeauticianId: specialist._id,
        active: true,
        image: {
          provider: "unsplash",
          url: "https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?w=800&h=600&fit=crop",
          alt: "Lash Consultation",
          width: 800,
          height: 600,
        },
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
        console.log(`✓ Created service: ${service.name}`);
      } else {
        console.log(`✓ Service already exists: ${service.name}`);
      }
    }

    console.log("\n✅ Seed completed successfully!");
    console.log("\n📋 Account Details:");
    console.log("─────────────────────────────────────");
    console.log(`Business: ${tenant.name}`);
    console.log(`URL: https://www.elitebooker.co.uk/salon/${tenant.slug}`);
    console.log(`Admin Email: ${adminEmail}`);
    console.log(`Admin Password: LuxeLashes2024!`);
    console.log(`Specialist: ${specialist.name}`);
    console.log(`Total Services: ${services.length}`);
    console.log("─────────────────────────────────────");

    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding database:", error);
    process.exit(1);
  }
}

seedLashTech();
