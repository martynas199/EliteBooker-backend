import mongoose from "mongoose";
import dotenv from "dotenv";
import Tenant from "./src/models/Tenant.js";
import Admin from "./src/models/Admin.js";
import Settings from "./src/models/Settings.js";
import Location from "./src/models/Location.js";
import Specialist from "./src/models/Specialist.js";
import Service from "./src/models/Service.js";

dotenv.config();

const MONGO_URI =
  process.env.MONGO_URI || "mongodb://localhost:27017/booking-system";

async function seedMultiLocationBusiness() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("✓ Connected to MongoDB");

    // 1. Check if tenant exists, otherwise create it
    let tenant = await Tenant.findOne({ slug: "elite-beauty-group" });

    if (tenant) {
      console.log(`✓ Using existing tenant: ${tenant.businessName}`);
    } else {
      tenant = await Tenant.create({
        name: "Elite Beauty Group",
        businessName: "Elite Beauty Group",
        slug: "elite-beauty-group",
        businessType: "salon",
        description: "Luxury beauty services across New York City",
        email: "info@elitebeautygroup.com",
        phone: "+1-555-0100",
        address: {
          street: "123 Beauty Boulevard",
          city: "New York",
          state: "NY",
          postalCode: "10001",
          country: "United States",
        },
        timezone: "America/New_York",
        locale: "en-US",
        currency: "USD",
        plan: "professional",
        status: "active",
        stripeAccountId: null,
      });
      console.log(`✓ Created tenant: ${tenant.businessName}`);
    }

    // Clear existing data for this tenant
    console.log("\nClearing existing data...");
    await Admin.deleteMany({ tenantId: tenant._id });
    await Settings.deleteMany({ tenantId: tenant._id });
    await Location.deleteMany({ tenantId: tenant._id });
    await Specialist.deleteMany({ tenantId: tenant._id });
    await Service.deleteMany({ tenantId: tenant._id });
    console.log("✓ Cleared existing data");

    // 2. Create Super Admin
    const superAdmin = await Admin.create({
      tenantId: tenant._id,
      email: "admin@elitebeautygroup.com",
      password: "Admin123!", // Plain password - will be hashed by pre-save hook
      name: "Emma Thompson",
      role: "super_admin",
      active: true,
    });
    console.log(`✓ Created super admin: ${superAdmin.email}`);

    // 3. Create Settings
    await Settings.create({
      tenantId: tenant._id,
      businessName: tenant.businessName,
      email: tenant.email,
      phone: tenant.phone,
      address: tenant.address,
      city: tenant.city,
      state: tenant.state,
      postalCode: tenant.postalCode,
      country: tenant.country,
      workingHours: [
        { day: "Monday", open: "09:00", close: "18:00", isOpen: true },
        { day: "Tuesday", open: "09:00", close: "18:00", isOpen: true },
        { day: "Wednesday", open: "09:00", close: "18:00", isOpen: true },
        { day: "Thursday", open: "09:00", close: "20:00", isOpen: true },
        { day: "Friday", open: "09:00", close: "20:00", isOpen: true },
        { day: "Saturday", open: "10:00", close: "17:00", isOpen: true },
        { day: "Sunday", open: "10:00", close: "16:00", isOpen: true },
      ],
      bookingBuffer: 15,
      maxAdvanceBookingDays: 60,
      cancellationWindow: 24,
      slotDuration: 30,
      currency: "USD",
      timezone: "America/New_York",
    });
    console.log("✓ Created settings");

    // 4. Create Locations
    const downtownLocation = await Location.create({
      tenantId: tenant._id,
      name: "Downtown Manhattan",
      slug: "downtown-manhattan",
      address: {
        street: "123 Beauty Boulevard",
        city: "New York",
        state: "NY",
        postalCode: "10001",
        country: "United States",
        coordinates: {
          lat: 40.7589,
          lng: -73.9851,
        },
      },
      phone: "+1-555-0101",
      email: "downtown@elitebeautygroup.com",
      workingHours: [
        { dayOfWeek: 0, start: "11:00", end: "17:00" }, // Sunday
        { dayOfWeek: 1, start: "09:00", end: "20:00" }, // Monday
        { dayOfWeek: 2, start: "09:00", end: "20:00" }, // Tuesday
        { dayOfWeek: 3, start: "09:00", end: "20:00" }, // Wednesday
        { dayOfWeek: 4, start: "09:00", end: "21:00" }, // Thursday
        { dayOfWeek: 5, start: "09:00", end: "21:00" }, // Friday
        { dayOfWeek: 6, start: "10:00", end: "18:00" }, // Saturday
      ],
      settings: {
        images: {
          featured:
            "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=800",
          gallery: [
            "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800",
            "https://images.unsplash.com/photo-1519415510236-718bdfcd89c8?w=800",
          ],
        },
        amenities: ["WiFi", "Parking", "Refreshments", "Wheelchair Accessible"],
        timezone: "America/New_York",
      },
      isPrimary: true,
      isActive: true,
      displayOrder: 0,
    });
    console.log(`✓ Created location: ${downtownLocation.name}`);

    const brooklynLocation = await Location.create({
      tenantId: tenant._id,
      name: "Brooklyn Heights",
      slug: "brooklyn-heights",
      address: {
        street: "456 Heights Avenue",
        city: "Brooklyn",
        state: "NY",
        postalCode: "11201",
        country: "United States",
        coordinates: {
          lat: 40.6955,
          lng: -73.9937,
        },
      },
      phone: "+1-555-0102",
      email: "brooklyn@elitebeautygroup.com",
      workingHours: [
        { dayOfWeek: 0, start: "10:00", end: "16:00" }, // Sunday
        { dayOfWeek: 1, start: "10:00", end: "19:00" }, // Monday
        { dayOfWeek: 2, start: "10:00", end: "19:00" }, // Tuesday
        { dayOfWeek: 3, start: "10:00", end: "19:00" }, // Wednesday
        { dayOfWeek: 4, start: "10:00", end: "20:00" }, // Thursday
        { dayOfWeek: 5, start: "10:00", end: "20:00" }, // Friday
        { dayOfWeek: 6, start: "09:00", end: "18:00" }, // Saturday
      ],
      settings: {
        images: {
          featured:
            "https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?w=800",
          gallery: [
            "https://images.unsplash.com/photo-1633681926022-84c23e8cb2d6?w=800",
          ],
        },
        amenities: ["WiFi", "Parking", "Refreshments", "Pet Friendly"],
        timezone: "America/New_York",
      },
      isPrimary: false,
      isActive: true,
      displayOrder: 1,
    });
    console.log(`✓ Created location: ${brooklynLocation.name}`);

    const queensLocation = await Location.create({
      tenantId: tenant._id,
      name: "Queens Plaza",
      slug: "queens-plaza",
      address: {
        street: "789 Plaza Street",
        city: "Queens",
        state: "NY",
        postalCode: "11101",
        country: "United States",
        coordinates: {
          lat: 40.7498,
          lng: -73.9375,
        },
      },
      phone: "+1-555-0103",
      email: "queens@elitebeautygroup.com",
      workingHours: [
        { dayOfWeek: 1, start: "09:00", end: "18:00" }, // Monday
        { dayOfWeek: 2, start: "09:00", end: "18:00" }, // Tuesday
        { dayOfWeek: 3, start: "09:00", end: "18:00" }, // Wednesday
        { dayOfWeek: 4, start: "09:00", end: "19:00" }, // Thursday
        { dayOfWeek: 5, start: "09:00", end: "19:00" }, // Friday
        { dayOfWeek: 6, start: "10:00", end: "17:00" }, // Saturday
        // Closed Sunday
      ],
      settings: {
        images: {
          featured:
            "https://images.unsplash.com/photo-1562322140-8baeececf3df?w=800",
          gallery: [],
        },
        amenities: ["WiFi", "Refreshments"],
        timezone: "America/New_York",
      },
      isPrimary: false,
      isActive: true,
      displayOrder: 2,
    });
    console.log(`✓ Created location: ${queensLocation.name}`);

    // 5. Create Staff Admins
    const staffAdmins = [];

    const sarah = await Admin.create({
      tenantId: tenant._id,
      email: "sarah@elitebeautygroup.com",
      password: "Staff123!",
      name: "Sarah Johnson",
      role: "specialist",
      active: true,
    });
    staffAdmins.push(sarah);

    const michael = await Admin.create({
      tenantId: tenant._id,
      email: "michael@elitebeautygroup.com",
      password: "Staff123!",
      name: "Michael Chen",
      role: "specialist",
      active: true,
    });
    staffAdmins.push(michael);

    const jessica = await Admin.create({
      tenantId: tenant._id,
      email: "jessica@elitebeautygroup.com",
      password: "Staff123!",
      name: "Jessica Martinez",
      role: "specialist",
      active: true,
    });
    staffAdmins.push(jessica);

    const david = await Admin.create({
      tenantId: tenant._id,
      email: "david@elitebeautygroup.com",
      password: "Staff123!",
      name: "David Williams",
      role: "specialist",
      active: true,
    });
    staffAdmins.push(david);

    const lisa = await Admin.create({
      tenantId: tenant._id,
      email: "lisa@elitebeautygroup.com",
      password: "Staff123!",
      name: "Lisa Anderson",
      role: "specialist",
      active: true,
    });
    staffAdmins.push(lisa);

    console.log(`✓ Created ${staffAdmins.length} staff admin accounts`);

    // 6. Create Specialists
    const specialists = [];

    // Sarah - Works at Downtown & Brooklyn (Hair specialist)
    const sarahSpecialist = await Specialist.create({
      tenantId: tenant._id,
      name: "Sarah Johnson",
      email: "sarah@elitebeautygroup.com",
      phone: "+1-555-0201",
      bio: "Expert hair stylist with 10+ years experience. Specializes in color correction and balayage.",
      photo:
        "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=400",
      specialties: ["Hair Styling", "Hair Coloring", "Balayage"],
      workingHours: [
        { day: "Monday", start: "09:00", end: "18:00", isAvailable: true },
        { day: "Tuesday", start: "09:00", end: "18:00", isAvailable: true },
        { day: "Wednesday", start: "09:00", end: "18:00", isAvailable: true },
        { day: "Thursday", start: "09:00", end: "18:00", isAvailable: true },
        { day: "Friday", start: "09:00", end: "18:00", isAvailable: true },
        { day: "Saturday", start: "10:00", end: "16:00", isAvailable: true },
        { day: "Sunday", start: "closed", end: "closed", isAvailable: false },
      ],
      locationIds: [downtownLocation._id, brooklynLocation._id],
      primaryLocationId: downtownLocation._id,
      adminId: sarah._id,
      isActive: true,
    });
    specialists.push(sarahSpecialist);

    // Michael - Works at Downtown only (Nail specialist)
    const michaelSpecialist = await Specialist.create({
      tenantId: tenant._id,
      name: "Michael Chen",
      email: "michael@elitebeautygroup.com",
      phone: "+1-555-0202",
      bio: "Professional nail technician specializing in gel and acrylic applications.",
      photo:
        "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400",
      specialties: ["Manicure", "Pedicure", "Nail Art"],
      workingHours: [
        { day: "Monday", start: "10:00", end: "19:00", isAvailable: true },
        { day: "Tuesday", start: "10:00", end: "19:00", isAvailable: true },
        { day: "Wednesday", start: "10:00", end: "19:00", isAvailable: true },
        { day: "Thursday", start: "10:00", end: "19:00", isAvailable: true },
        { day: "Friday", start: "10:00", end: "19:00", isAvailable: true },
        { day: "Saturday", start: "09:00", end: "17:00", isAvailable: true },
        { day: "Sunday", start: "closed", end: "closed", isAvailable: false },
      ],
      locationIds: [downtownLocation._id],
      primaryLocationId: downtownLocation._id,
      adminId: michael._id,
      isActive: true,
    });
    specialists.push(michaelSpecialist);

    // Jessica - Works at Brooklyn & Queens (Skincare specialist)
    const jessicaSpecialist = await Specialist.create({
      tenantId: tenant._id,
      name: "Jessica Martinez",
      email: "jessica@elitebeautygroup.com",
      phone: "+1-555-0203",
      bio: "Licensed esthetician with expertise in anti-aging treatments and facials.",
      photo:
        "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400",
      specialties: ["Facials", "Chemical Peels", "Microdermabrasion"],
      workingHours: [
        { day: "Monday", start: "09:00", end: "17:00", isAvailable: true },
        { day: "Tuesday", start: "09:00", end: "17:00", isAvailable: true },
        { day: "Wednesday", start: "09:00", end: "17:00", isAvailable: true },
        { day: "Thursday", start: "09:00", end: "17:00", isAvailable: true },
        { day: "Friday", start: "09:00", end: "17:00", isAvailable: true },
        { day: "Saturday", start: "10:00", end: "16:00", isAvailable: true },
        { day: "Sunday", start: "closed", end: "closed", isAvailable: false },
      ],
      locationIds: [brooklynLocation._id, queensLocation._id],
      primaryLocationId: brooklynLocation._id,
      adminId: jessica._id,
      isActive: true,
    });
    specialists.push(jessicaSpecialist);

    // David - Works at all locations (Massage therapist)
    const davidSpecialist = await Specialist.create({
      tenantId: tenant._id,
      name: "David Williams",
      email: "david@elitebeautygroup.com",
      phone: "+1-555-0204",
      bio: "Certified massage therapist offering therapeutic and relaxation massages.",
      photo:
        "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400",
      specialties: ["Deep Tissue Massage", "Swedish Massage", "Sports Massage"],
      workingHours: [
        { day: "Monday", start: "10:00", end: "18:00", isAvailable: true },
        { day: "Tuesday", start: "10:00", end: "18:00", isAvailable: true },
        { day: "Wednesday", start: "10:00", end: "18:00", isAvailable: true },
        { day: "Thursday", start: "10:00", end: "18:00", isAvailable: true },
        { day: "Friday", start: "10:00", end: "18:00", isAvailable: true },
        { day: "Saturday", start: "11:00", end: "16:00", isAvailable: true },
        { day: "Sunday", start: "11:00", end: "16:00", isAvailable: true },
      ],
      locationIds: [
        downtownLocation._id,
        brooklynLocation._id,
        queensLocation._id,
      ],
      primaryLocationId: downtownLocation._id,
      adminId: david._id,
      isActive: true,
    });
    specialists.push(davidSpecialist);

    // Lisa - Works at Queens only (Makeup artist)
    const lisaSpecialist = await Specialist.create({
      tenantId: tenant._id,
      name: "Lisa Anderson",
      email: "lisa@elitebeautygroup.com",
      phone: "+1-555-0205",
      bio: "Professional makeup artist specializing in bridal and special events.",
      photo:
        "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400",
      specialties: ["Bridal Makeup", "Special Events", "Airbrush Makeup"],
      workingHours: [
        { day: "Monday", start: "09:00", end: "17:00", isAvailable: true },
        { day: "Tuesday", start: "09:00", end: "17:00", isAvailable: true },
        { day: "Wednesday", start: "09:00", end: "17:00", isAvailable: true },
        { day: "Thursday", start: "09:00", end: "18:00", isAvailable: true },
        { day: "Friday", start: "09:00", end: "18:00", isAvailable: true },
        { day: "Saturday", start: "08:00", end: "17:00", isAvailable: true },
        { day: "Sunday", start: "closed", end: "closed", isAvailable: false },
      ],
      locationIds: [queensLocation._id],
      primaryLocationId: queensLocation._id,
      adminId: lisa._id,
      isActive: true,
    });
    specialists.push(lisaSpecialist);

    console.log(`✓ Created ${specialists.length} specialists`);

    // 7. Create Services
    const services = [];

    // Hair Services - Available at Downtown & Brooklyn
    const haircut = await Service.create({
      tenantId: tenant._id,
      name: "Women's Haircut",
      description: "Professional haircut with wash and style",
      category: "Hair",
      duration: 60,
      price: 75,
      currency: "USD",
      image: "https://images.unsplash.com/photo-1562322140-8baeececf3df?w=400",
      availableAt: [downtownLocation._id, brooklynLocation._id],
      isActive: true,
    });
    services.push(haircut);

    const coloring = await Service.create({
      tenantId: tenant._id,
      name: "Hair Coloring",
      description: "Full color treatment with toner and style",
      category: "Hair",
      duration: 120,
      price: 150,
      currency: "USD",
      image:
        "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=400",
      availableAt: [downtownLocation._id, brooklynLocation._id],
      isActive: true,
    });
    services.push(coloring);

    // Nail Services - Available at Downtown only
    const manicure = await Service.create({
      tenantId: tenant._id,
      name: "Gel Manicure",
      description: "Long-lasting gel manicure with nail art options",
      category: "Nails",
      duration: 45,
      price: 50,
      currency: "USD",
      image:
        "https://images.unsplash.com/photo-1604654894610-df63bc536371?w=400",
      availableAt: [downtownLocation._id],
      isActive: true,
    });
    services.push(manicure);

    const pedicure = await Service.create({
      tenantId: tenant._id,
      name: "Spa Pedicure",
      description: "Relaxing pedicure with massage and polish",
      category: "Nails",
      duration: 60,
      price: 65,
      currency: "USD",
      image:
        "https://images.unsplash.com/photo-1519014816548-bf5fe059798b?w=400",
      availableAt: [downtownLocation._id],
      isActive: true,
    });
    services.push(pedicure);

    // Skincare Services - Available at Brooklyn & Queens
    const facial = await Service.create({
      tenantId: tenant._id,
      name: "Signature Facial",
      description: "Customized facial treatment for your skin type",
      category: "Skincare",
      duration: 75,
      price: 120,
      currency: "USD",
      image:
        "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=400",
      availableAt: [brooklynLocation._id, queensLocation._id],
      isActive: true,
    });
    services.push(facial);

    const chemicalPeel = await Service.create({
      tenantId: tenant._id,
      name: "Chemical Peel",
      description: "Advanced exfoliation treatment for skin renewal",
      category: "Skincare",
      duration: 60,
      price: 150,
      currency: "USD",
      image:
        "https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?w=400",
      availableAt: [brooklynLocation._id, queensLocation._id],
      isActive: true,
    });
    services.push(chemicalPeel);

    // Massage Services - Available at all locations
    const deepTissue = await Service.create({
      tenantId: tenant._id,
      name: "Deep Tissue Massage",
      description: "Therapeutic massage for muscle tension relief",
      category: "Massage",
      duration: 90,
      price: 140,
      currency: "USD",
      image: "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=400",
      availableAt: [
        downtownLocation._id,
        brooklynLocation._id,
        queensLocation._id,
      ],
      isActive: true,
    });
    services.push(deepTissue);

    const swedish = await Service.create({
      tenantId: tenant._id,
      name: "Swedish Massage",
      description: "Relaxing full body massage",
      category: "Massage",
      duration: 60,
      price: 100,
      currency: "USD",
      image:
        "https://images.unsplash.com/photo-1600334129128-685c5582fd35?w=400",
      availableAt: [
        downtownLocation._id,
        brooklynLocation._id,
        queensLocation._id,
      ],
      isActive: true,
    });
    services.push(swedish);

    // Makeup Services - Available at Queens only
    const bridalMakeup = await Service.create({
      tenantId: tenant._id,
      name: "Bridal Makeup",
      description: "Complete bridal makeup with trial session",
      category: "Makeup",
      duration: 120,
      price: 200,
      currency: "USD",
      image:
        "https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?w=400",
      availableAt: [queensLocation._id],
      isActive: true,
    });
    services.push(bridalMakeup);

    const eventMakeup = await Service.create({
      tenantId: tenant._id,
      name: "Special Event Makeup",
      description: "Professional makeup for special occasions",
      category: "Makeup",
      duration: 90,
      price: 125,
      currency: "USD",
      image:
        "https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?w=400",
      availableAt: [queensLocation._id],
      isActive: true,
    });
    services.push(eventMakeup);

    console.log(`✓ Created ${services.length} services`);

    // 8. Summary
    console.log("\n========================================");
    console.log("✅ MULTI-LOCATION BUSINESS CREATED!");
    console.log("========================================\n");

    console.log("BUSINESS DETAILS:");
    console.log(`Name: ${tenant.businessName}`);
    console.log(`Slug: ${tenant.slug}`);
    console.log(`Email: ${tenant.email}\n`);

    console.log("ADMIN ACCOUNTS:");
    console.log(`Super Admin: admin@elitebeautygroup.com / Admin123!`);
    console.log(
      `Sarah (Downtown & Brooklyn): sarah@elitebeautygroup.com / Staff123!`
    );
    console.log(`Michael (Downtown): michael@elitebeautygroup.com / Staff123!`);
    console.log(
      `Jessica (Brooklyn & Queens): jessica@elitebeautygroup.com / Staff123!`
    );
    console.log(
      `David (All Locations): david@elitebeautygroup.com / Staff123!`
    );
    console.log(`Lisa (Queens): lisa@elitebeautygroup.com / Staff123!\n`);

    console.log("LOCATIONS:");
    console.log(
      `1. ${downtownLocation.name} (PRIMARY) - ${downtownLocation.address.city}`
    );
    console.log(`   Staff: Sarah, Michael, David`);
    console.log(`   Services: Hair, Nails, Massage\n`);

    console.log(
      `2. ${brooklynLocation.name} - ${brooklynLocation.address.city}`
    );
    console.log(`   Staff: Sarah, Jessica, David`);
    console.log(`   Services: Hair, Skincare, Massage\n`);

    console.log(`3. ${queensLocation.name} - ${queensLocation.address.city}`);
    console.log(`   Staff: Jessica, David, Lisa`);
    console.log(`   Services: Skincare, Massage, Makeup\n`);

    console.log("SERVICE CATEGORIES:");
    console.log(
      `- Hair Services (2): ${services
        .filter((s) => s.category === "Hair")
        .map((s) => s.name)
        .join(", ")}`
    );
    console.log(
      `- Nail Services (2): ${services
        .filter((s) => s.category === "Nails")
        .map((s) => s.name)
        .join(", ")}`
    );
    console.log(
      `- Skincare Services (2): ${services
        .filter((s) => s.category === "Skincare")
        .map((s) => s.name)
        .join(", ")}`
    );
    console.log(
      `- Massage Services (2): ${services
        .filter((s) => s.category === "Massage")
        .map((s) => s.name)
        .join(", ")}`
    );
    console.log(
      `- Makeup Services (2): ${services
        .filter((s) => s.category === "Makeup")
        .map((s) => s.name)
        .join(", ")}\n`
    );

    console.log("API ENDPOINTS TO TEST:");
    console.log(`GET /api/locations - List all locations`);
    console.log(
      `GET /api/locations/${downtownLocation._id}/specialists - Staff at Downtown`
    );
    console.log(
      `GET /api/locations/${brooklynLocation._id}/services - Services at Brooklyn`
    );
    console.log(`GET /api/specialists - All specialists`);
    console.log(`GET /api/services - All services\n`);

    console.log("========================================");
  } catch (error) {
    console.error("❌ Error seeding database:", error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log("✓ Disconnected from MongoDB");
  }
}

seedMultiLocationBusiness();
