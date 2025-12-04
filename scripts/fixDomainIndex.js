/**
 * Migration script to fix domain index issue
 * Drops the old unique index on domains.domain and creates a sparse unique index
 *
 * Run this once: node scripts/fixDomainIndex.js
 */

import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

async function fixDomainIndex() {
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

    const db = mongoose.connection.db;
    const tenantsCollection = db.collection("tenants");

    console.log("📋 Checking existing indexes...");
    const indexes = await tenantsCollection.indexes();
    console.log("Current indexes:", indexes.map((i) => i.name).join(", "));

    // Drop the problematic index if it exists
    try {
      await tenantsCollection.dropIndex("domains.domain_1");
      console.log("✅ Dropped old domains.domain_1 index");
    } catch (err) {
      if (err.code === 27) {
        console.log(
          "ℹ️  Index domains.domain_1 doesn't exist (already dropped)"
        );
      } else {
        console.log("⚠️  Could not drop index:", err.message);
      }
    }

    // Create a new sparse unique index (sparse = only indexes documents that have the field)
    try {
      await tenantsCollection.createIndex(
        { "domains.domain": 1 },
        {
          unique: true,
          sparse: true, // This is the key - allows multiple null/undefined values
          name: "domains.domain_sparse",
        }
      );
      console.log("✅ Created new sparse unique index on domains.domain");
    } catch (err) {
      console.log("⚠️  Could not create sparse index:", err.message);
    }

    // Clean up any tenants with empty domains arrays
    const result = await tenantsCollection.updateMany(
      { $or: [{ domains: [] }, { domains: null }] },
      { $unset: { domains: "" } }
    );
    console.log(
      `✅ Cleaned up ${result.modifiedCount} tenant(s) with empty domains`
    );

    console.log("\n📋 Final indexes:");
    const finalIndexes = await tenantsCollection.indexes();
    finalIndexes.forEach((index) => {
      console.log(`  - ${index.name}: ${JSON.stringify(index.key)}`);
    });

    console.log("\n🎉 Migration completed successfully!");
  } catch (error) {
    console.error("❌ Migration error:", error);
  } finally {
    await mongoose.connection.close();
    console.log("\n✅ Database connection closed");
  }
}

fixDomainIndex();
