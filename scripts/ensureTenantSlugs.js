/**
 * Migration script to ensure all tenants have slugs
 *
 * Run this once: node scripts/ensureTenantSlugs.js
 */

import mongoose from "mongoose";
import Tenant from "../src/models/Tenant.js";
import dotenv from "dotenv";

dotenv.config();

async function ensureTenantSlugs() {
  try {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoUri) {
      console.error(
        "❌ Error: MONGODB_URI or MONGO_URI not found in .env file"
      );
      process.exit(1);
    }

    await mongoose.connect(mongoUri);
    console.log("✅ Connected to MongoDB\n");

    // Find all tenants without slugs
    const tenantsWithoutSlugs = await Tenant.find({
      $or: [{ slug: null }, { slug: undefined }, { slug: "" }],
    });

    console.log(
      `📋 Found ${tenantsWithoutSlugs.length} tenant(s) without slugs\n`
    );

    if (tenantsWithoutSlugs.length === 0) {
      console.log("✅ All tenants already have slugs!");
      return;
    }

    for (const tenant of tenantsWithoutSlugs) {
      // Generate slug from businessName or name
      const baseName = tenant.businessName || tenant.name || "salon";
      let baseSlug = baseName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

      let slug = baseSlug;
      let counter = 1;

      // Check if slug exists and add counter if needed
      while (await Tenant.findOne({ slug, _id: { $ne: tenant._id } }).lean()) {
        slug = `${baseSlug}-${counter}`;
        counter++;
      }

      // Update tenant with slug
      tenant.slug = slug;
      await tenant.save();

      console.log(`✅ Updated tenant "${tenant.businessName || tenant.name}"`);
      console.log(`   ID: ${tenant._id}`);
      console.log(`   Slug: ${slug}`);
      console.log(`   URL: /salon/${slug}\n`);
    }

    console.log(
      `🎉 Successfully updated ${tenantsWithoutSlugs.length} tenant(s)!`
    );
  } catch (error) {
    console.error("❌ Migration error:", error);
  } finally {
    await mongoose.connection.close();
    console.log("\n✅ Database connection closed");
  }
}

ensureTenantSlugs();
