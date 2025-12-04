import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import Admin from "../src/models/Admin.js";
import readline from "readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (query) =>
  new Promise((resolve) => rl.question(query, resolve));

async function createAdmin() {
  console.log("\n🔐 Create First Admin Account\n");

  try {
    // Connect to database
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to database\n");

    // Check if admin already exists
    const existingAdmin = await Admin.findOne({});
    if (existingAdmin) {
      const overwrite = await question(
        "⚠️  Admin account already exists. Create another? (y/n): "
      );
      if (overwrite.toLowerCase() !== "y") {
        console.log("\n❌ Cancelled");
        process.exit(0);
      }
    }

    // Get admin details
    const email = await question("Email: ");
    const password = await question("Password (min 8 chars): ");
    const name = await question("Full Name: ");
    const roleInput = await question("Role (admin/super_admin) [admin]: ");
    const role = roleInput || "admin";

    // Validate inputs
    if (!email || !email.includes("@")) {
      console.error("\n❌ Invalid email address");
      process.exit(1);
    }

    if (!password || password.length < 8) {
      console.error("\n❌ Password must be at least 8 characters");
      process.exit(1);
    }

    if (!name) {
      console.error("\n❌ Name is required");
      process.exit(1);
    }

    // Create admin
    const admin = await Admin.create({
      email,
      password,
      name,
      role: role === "super_admin" ? "super_admin" : "admin",
    });

    console.log("\n✅ Admin created successfully!");
    console.log("\n📋 Details:");
    console.log(`   Email: ${admin.email}`);
    console.log(`   Name: ${admin.name}`);
    console.log(`   Role: ${admin.role}`);
    console.log(`   ID: ${admin._id}`);
    console.log("\n🔑 You can now login with these credentials");
    console.log(`   Login URL: http://localhost:5173/admin/login\n`);
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    if (error.code === 11000) {
      console.error("   Admin with this email already exists");
    }
  } finally {
    rl.close();
    await mongoose.disconnect();
    process.exit(0);
  }
}

createAdmin();
