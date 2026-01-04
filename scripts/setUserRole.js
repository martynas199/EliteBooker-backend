/**
 * Script to set user role (e.g., support, super_admin)
 *
 * Usage:
 * node scripts/setUserRole.js <userEmail> <role>
 *
 * Example:
 * node scripts/setUserRole.js elitebooker.web@gmail.com support
 */

import mongoose from "mongoose";
import User from "../src/models/User.js";
import Admin from "../src/models/Admin.js";
import dotenv from "dotenv";

dotenv.config();

async function setUserRole(userEmail, targetRole) {
  try {
    // Validate role
    const validRoles = [
      "customer",
      "salon-admin",
      "specialist",
      "super-admin",
      "support",
    ];
    if (!validRoles.includes(targetRole)) {
      console.error(
        `❌ Invalid role. Valid roles are: ${validRoles.join(", ")}`
      );
      process.exit(1);
    }

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

    // Try to find user in User model first
    let user = await User.findOne({ email: userEmail });
    let isUserModel = true;

    // If not found in User model, try Admin model
    if (!user) {
      user = await Admin.findOne({ email: userEmail });
      isUserModel = false;
    }

    if (!user) {
      console.error(`❌ User not found with email: ${userEmail}`);

      // List some users
      const users = await User.find({}).select("-password").limit(10).lean();
      const admins = await Admin.find({}).select("-password").limit(10).lean();

      if (users.length > 0) {
        console.log("\n📋 Sample users in User model:");
        users.forEach((u) => {
          console.log(`   - ${u.name} (${u.email}) - Role: ${u.role}`);
        });
      }

      if (admins.length > 0) {
        console.log("\n📋 Sample users in Admin model:");
        admins.forEach((a) => {
          console.log(
            `   - ${a.name} (${a.email}) - Role: ${a.role || "admin"}`
          );
        });
      }

      process.exit(1);
    }

    const model = isUserModel ? "User" : "Admin";
    console.log(`✅ Found user in ${model} model:`);
    console.log(`   Name: ${user.name}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Current Role: ${user.role || "admin"}`);

    // Update role
    const oldRole = user.role || "admin";
    user.role = targetRole;
    await user.save();

    console.log(
      `\n🎉 Successfully updated role from "${oldRole}" to "${targetRole}"!`
    );
    console.log(
      "✅ The user needs to log out and log back in for changes to take effect."
    );
  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error(error);
  } finally {
    await mongoose.connection.close();
    console.log("\n✅ Database connection closed");
  }
}

// Get arguments
const args = process.argv.slice(2);
if (args.length !== 2) {
  console.log("Usage: node scripts/setUserRole.js <userEmail> <role>");
  console.log(
    "\nValid roles: customer, salon-admin, specialist, super-admin, support"
  );
  console.log("\nExamples:");
  console.log("  node scripts/setUserRole.js user@example.com support");
  console.log("  node scripts/setUserRole.js admin@salon.com super-admin");
  process.exit(1);
}

const [email, role] = args;
setUserRole(email, role);
