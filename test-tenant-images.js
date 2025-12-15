const mongoose = require("mongoose");
require("dotenv").config();

async function testTenantImages() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    const Tenant = require("./src/models/Tenant");
    const HeroSection = require("./src/models/HeroSection");
    const Settings = require("./src/models/Settings");

    // Get all active tenants
    const tenants = await Tenant.find({
      status: { $in: ["active", "trial"] },
    })
      .select("name slug _id")
      .lean();

    console.log(`\n📊 Found ${tenants.length} active tenants\n`);

    for (const tenant of tenants) {
      console.log(`\n🏢 Tenant: ${tenant.name} (${tenant.slug})`);
      console.log(`   ID: ${tenant._id}`);

      // Check HeroSection
      const heroSection = await HeroSection.findOne({
        tenantId: tenant._id,
      })
        .select("centerImage")
        .sort({ order: 1 })
        .lean();

      if (heroSection) {
        console.log("   ✅ HeroSection found:");
        console.log(`      URL: ${heroSection.centerImage?.url || "N/A"}`);
        console.log(`      Alt: ${heroSection.centerImage?.alt || "N/A"}`);
      } else {
        console.log("   ❌ No HeroSection found");
      }

      // Check Settings
      const settings = await Settings.findOne({ tenantId: tenant._id })
        .select("heroImage")
        .lean();

      if (settings) {
        console.log("   ✅ Settings found:");
        console.log(`      URL: ${settings.heroImage?.url || "N/A"}`);
        console.log(`      Alt: ${settings.heroImage?.alt || "N/A"}`);
      } else {
        console.log("   ❌ No Settings found");
      }

      // Show what would be used
      const heroUrl = heroSection?.centerImage?.url || settings?.heroImage?.url;
      if (heroUrl) {
        console.log(`   🎯 Final URL: ${heroUrl}`);
      } else {
        console.log("   ⚠️  No image URL found - will use default");
      }
    }

    console.log("\n✅ Test complete");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

testTenantImages();
