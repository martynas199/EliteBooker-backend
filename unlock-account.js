import dotenv from "dotenv";
import mongoose from "mongoose";
import Admin from "./src/models/Admin.js";

dotenv.config();

async function unlockAccount(email) {
  try {
    await mongoose.connect(
      process.env.MONGO_URI ||
        process.env.MONGODB_URI ||
        "mongodb://localhost:27017/booking-app"
    );
    console.log("✅ Connected to database");

    const admin = await Admin.findOne({ email });

    if (!admin) {
      console.log(`❌ Admin with email "${email}" not found`);
      process.exit(1);
    }

    console.log("\n📊 Before unlock:");
    console.log("  Email:", admin.email);
    console.log("  Name:", admin.name);
    console.log("  Login attempts:", admin.loginAttempts);
    console.log("  Lock until:", admin.lockUntil);
    console.log("  Is locked:", admin.isLocked);

    admin.loginAttempts = 0;
    admin.lockUntil = undefined;
    await admin.save();

    console.log("\n✅ Account unlocked successfully!");
    console.log("\n📊 After unlock:");
    console.log("  Login attempts:", admin.loginAttempts);
    console.log("  Lock until:", admin.lockUntil);
    console.log("  Is locked:", admin.isLocked);

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error("❌ Error:", err.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

const email = process.argv[2] || "martynas2.20@hotmail.com";
unlockAccount(email);
