import mongoose from "mongoose";
import dotenv from "dotenv";
import Admin from "../src/models/Admin.js";

dotenv.config();

const checkLockedAccounts = async () => {
  try {
    console.log("🔍 Connecting to database...");
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error("MONGO_URI or MONGODB_URI environment variable not set");
    }
    await mongoose.connect(mongoUri);
    console.log("✅ Connected to MongoDB\n");

    // Find all admins
    const allAdmins = await Admin.find({}).select(
      "name email role loginAttempts lockUntil"
    );

    console.log(`📊 Total admin accounts: ${allAdmins.length}\n`);

    // Check each admin for lock status
    const lockedAdmins = [];
    const unlockedAdmins = [];

    for (const admin of allAdmins) {
      const isLocked = admin.isLocked();
      const lockInfo = {
        name: admin.name,
        email: admin.email,
        role: admin.role,
        loginAttempts: admin.loginAttempts || 0,
        lockUntil: admin.lockUntil,
        isLocked,
      };

      if (isLocked) {
        lockedAdmins.push(lockInfo);
      } else {
        unlockedAdmins.push(lockInfo);
      }
    }

    // Display locked accounts
    if (lockedAdmins.length > 0) {
      console.log("🔒 LOCKED ACCOUNTS:");
      console.log("=".repeat(80));
      lockedAdmins.forEach((admin, index) => {
        console.log(`\n${index + 1}. ${admin.name} (${admin.email})`);
        console.log(`   Role: ${admin.role}`);
        console.log(`   Login Attempts: ${admin.loginAttempts}`);
        console.log(
          `   Locked Until: ${admin.lockUntil?.toLocaleString() || "N/A"}`
        );

        if (admin.lockUntil) {
          const now = new Date();
          const minutesRemaining = Math.ceil(
            (admin.lockUntil - now) / (1000 * 60)
          );
          if (minutesRemaining > 0) {
            console.log(`   ⏰ Time Remaining: ${minutesRemaining} minutes`);
          } else {
            console.log(
              `   ⏰ Lock expired ${Math.abs(
                minutesRemaining
              )} minutes ago (will auto-unlock on next login)`
            );
          }
        }
      });
      console.log("\n" + "=".repeat(80));
    } else {
      console.log("✅ No locked accounts found");
    }

    // Display unlocked accounts with failed attempts
    const accountsWithAttempts = unlockedAdmins.filter(
      (admin) => admin.loginAttempts > 0
    );

    if (accountsWithAttempts.length > 0) {
      console.log("\n\n⚠️  UNLOCKED ACCOUNTS WITH FAILED LOGIN ATTEMPTS:");
      console.log("=".repeat(80));
      accountsWithAttempts.forEach((admin, index) => {
        console.log(`\n${index + 1}. ${admin.name} (${admin.email})`);
        console.log(`   Role: ${admin.role}`);
        console.log(`   Login Attempts: ${admin.loginAttempts}/5`);
        console.log(
          `   Status: ${5 - admin.loginAttempts} attempts remaining before lock`
        );
      });
      console.log("\n" + "=".repeat(80));
    }

    // Summary
    console.log("\n\n📈 SUMMARY:");
    console.log("=".repeat(80));
    console.log(`Total Admins: ${allAdmins.length}`);
    console.log(`🔒 Locked: ${lockedAdmins.length}`);
    console.log(`✅ Unlocked: ${unlockedAdmins.length}`);
    console.log(`⚠️  With Failed Attempts: ${accountsWithAttempts.length}`);
    console.log("=".repeat(80));

    await mongoose.disconnect();
    console.log("\n✅ Disconnected from MongoDB");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
};

checkLockedAccounts();
