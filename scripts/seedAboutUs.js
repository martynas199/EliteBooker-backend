import mongoose from "mongoose";
import "../config/env.js";
import AboutUs from "../models/AboutUs.js";

const aboutUsData = {
  image: {
    url: "https://images.unsplash.com/photo-1560066984-138dadb4c035?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1974&q=80",
    publicId: null, // Will be set when admin uploads actual image
  },
  quote:
    "Beauty isn't only seen in the mirror. It's felt in the way we treat our clients, the conversations we share, and the energy we pour into our work.",
  description: `Noble Elegance was never meant to be just a salon — it's a feeling, a world of calm and beauty created with heart and precision.

It started from a dream: to build a place where women could reconnect with their femininity, confidence, and grace. A place that feels like home, but more — where every detail whispers care, and every touch reminds you that you matter.

Here, beauty isn't only seen in the mirror. It's felt in the way we treat our clients, the conversations we share, and the energy we pour into our work. We believe true elegance comes from within, and our role is to bring it forward — softly, naturally, and beautifully.

Every product, every method, every moment is chosen with purpose. Nothing is rushed, nothing is done halfway. Because for us, it's not about trends or noise — it's about timeless beauty, inner peace, and the quiet confidence that never goes out of style.

At Noble Elegance, we don't just transform looks. We remind women of who they've always been — strong, graceful, and endlessly beautiful.`,
  isActive: true,
};

async function seedAboutUs() {
  try {
    console.log("🌱 Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    // Check if About Us content already exists
    const existing = await AboutUs.findOne({ isActive: true });

    if (existing) {
      console.log("ℹ️  About Us content already exists, skipping seed");
      console.log("📄 Existing content:", {
        id: existing._id,
        quote: existing.quote.substring(0, 50) + "...",
        imageUrl: existing.image?.url,
        lastUpdated: existing.updatedAt,
      });
    } else {
      console.log("📝 Creating About Us content...");

      const aboutUs = await AboutUs.create(aboutUsData);

      console.log("✅ About Us content created successfully!");
      console.log("📄 Created content:", {
        id: aboutUs._id,
        quote: aboutUs.quote.substring(0, 50) + "...",
        imageUrl: aboutUs.image?.url,
        createdAt: aboutUs.createdAt,
      });
    }
  } catch (error) {
    console.error("❌ Error seeding About Us content:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Disconnected from MongoDB");
    process.exit(0);
  }
}

// Run the seeder
seedAboutUs();
