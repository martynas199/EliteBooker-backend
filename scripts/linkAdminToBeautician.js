/**
 * Script to link an Admin account to a Beautician for Stripe Connect
 *
 * Usage:
 * node scripts/linkAdminToBeautician.js <adminEmail> <beauticianEmail>
 *
 * Example:
 * node scripts/linkAdminToBeautician.js admin@salon.com specialist@salon.com
 */

import mongoose from "mongoose";
import Admin from "../src/models/Admin.js";
import Beautician from "../src/models/Beautician.js";
import dotenv from "dotenv";

dotenv.config();

async function linkAdminToBeautician(adminEmail, beauticianEmail) {
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
    console.log("✅ Connected to MongoDB");

    // Find admin
    const admin = await Admin.findOne({ email: adminEmail });
    if (!admin) {
      console.error(`❌ Admin not found with email: ${adminEmail}`);
      process.exit(1);
    }
    console.log(`✅ Found admin: ${admin.name} (${admin.email})`);

    // Find specialist
    const specialist = await Beautician.findOne({ email: beauticianEmail });
    if (!specialist) {
      console.error(`❌ Beautician not found with email: ${beauticianEmail}`);
      console.log("\n📋 Available specialists:");
      const allBeauticians = await Beautician.find({});
      allBeauticians.forEach((b) => {
        console.log(`   - ${b.name} (${b.email || "no email"})`);
      });
      process.exit(1);
    }
    console.log(
      `✅ Found specialist: ${specialist.name} (${
        specialist.email || "no email"
      })`
    );

    // Link them
    admin.beauticianId = specialist._id;
    await admin.save();

    console.log("\n🎉 Successfully linked admin to specialist!");
    console.log(`   Admin: ${admin.name} (${admin.email})`);
    console.log(`   Beautician: ${specialist.name}`);
    console.log(`   Beautician ID: ${specialist._id}`);
    console.log(
      "\n✅ Now log out and log back in to see Stripe Connect settings!"
    );
  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    await mongoose.connection.close();
    console.log("\n✅ Database connection closed");
  }
}

// Get arguments
const args = process.argv.slice(2);
if (args.length !== 2) {
  console.log(
    "Usage: node scripts/linkAdminToBeautician.js <adminEmail> <beauticianEmail>"
  );
  console.log(
    "Example: node scripts/linkAdminToBeautician.js admin@salon.com specialist@salon.com"
  );
  process.exit(1);
}

const [adminEmail, beauticianEmail] = args;
linkAdminToBeautician(adminEmail, beauticianEmail);
