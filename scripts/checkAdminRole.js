/**
 * Script to check admin role and upgrade to super_admin if needed
 *
 * Usage:
 * node scripts/checkAdminRole.js <adminEmail>
 * node scripts/checkAdminRole.js <adminEmail> upgrade
 */

import mongoose from "mongoose";
import Admin from "../src/models/Admin.js";
import dotenv from "dotenv";

dotenv.config();

async function checkAndUpdateAdmin(adminEmail, shouldUpgrade = false) {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoUri) {
      console.error(
        "❌ Error: MONGODB_URI or MONGO_URI not found in .env file"
      );
      process.exit(1);
    }
    await mongoose.connect(mongoUri);
    console.log("✅ Connected to MongoDB\n");

    // Find admin
    const admin = await Admin.findOne({ email: adminEmail });
    if (!admin) {
      console.error(`❌ Admin not found with email: ${adminEmail}`);

      // List all admins
      const allAdmins = await Admin.find({}).select("-password").lean();
      if (allAdmins.length > 0) {
        console.log("\n📋 Available admins:");
        allAdmins.forEach((a) => {
          console.log(`   - ${a.name} (${a.email}) - Role: ${a.role}`);
        });
      }
      process.exit(1);
    }

    console.log("✅ Found admin:");
    console.log(`   Name: ${admin.name}`);
    console.log(`   Email: ${admin.email}`);
    console.log(`   Current Role: ${admin.role}`);
    console.log(`   Specialist Linked: ${admin.specialistId ? "Yes" : "No"}`);
    if (admin.specialistId) {
      console.log(`   Specialist ID: ${admin.specialistId}`);
    }

    if (shouldUpgrade) {
      if (admin.role === "super_admin") {
        console.log("\n✅ Admin is already a super_admin!");
      } else {
        admin.role = "super_admin";
        await admin.save();
        console.log(`\n🎉 Successfully upgraded ${admin.name} to super_admin!`);
        console.log("✅ Now log out and log back in to see full admin access!");
      }
    } else {
      console.log("\n💡 To upgrade this admin to super_admin, run:");
      console.log(`   node scripts/checkAdminRole.js ${adminEmail} upgrade`);
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    await mongoose.connection.close();
    console.log("\n✅ Database connection closed");
  }
}

// Get arguments
const args = process.argv.slice(2);
if (args.length === 0) {
  console.log("Usage: node scripts/checkAdminRole.js <adminEmail> [upgrade]");
  console.log("\nExamples:");
  console.log("  node scripts/checkAdminRole.js admin@salon.com");
  console.log("  node scripts/checkAdminRole.js admin@salon.com upgrade");
  process.exit(1);
}

const adminEmail = args[0];
const shouldUpgrade = args[1] === "upgrade";

checkAndUpdateAdmin(adminEmail, shouldUpgrade);
