import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import models
import Tenant from './src/models/Tenant.js';
import HeroSection from './src/models/HeroSection.js';

async function checkHeroSection() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Find the tenant
    const tenant = await Tenant.findOne({ slug: 'luxe-lashes' });
    if (!tenant) {
      console.error('❌ Tenant not found');
      return;
    }
    console.log('✓ Found tenant:', tenant.businessName);

    // Find hero sections for this tenant
    const heroSections = await HeroSection.find({ tenantId: tenant._id });
    
    console.log(`\n📋 Found ${heroSections.length} hero sections:`);
    heroSections.forEach((hero, index) => {
      console.log(`\n--- Hero Section ${index + 1} ---`);
      console.log('  Title:', hero.title);
      console.log('  Subtitle:', hero.subtitle);
      console.log('  CTA Text:', hero.ctaText);
      console.log('  CTA Link:', hero.ctaLink);
      console.log('  Active:', hero.active);
      console.log('  Show CTA:', hero.showCta);
    });

    if (heroSections.length === 0) {
      console.log('\n⚠️ No hero sections found. The page is showing default UI.');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkHeroSection();
