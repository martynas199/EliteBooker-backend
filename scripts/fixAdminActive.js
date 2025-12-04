import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import Admin from "../src/models/Admin.js";

async function fixAdminActiveField() {
  console.log("\n🔧 Fixing Admin Active Field\n");

  try {
    // Connect to database
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to database\n");

    // Find all admins
    const admins = await Admin.find({});
    console.log(`📊 Found ${admins.length} admin(s)\n`);

    if (admins.length === 0) {
      console.log("⚠️  No admins found in database");
      console.log("   Run: node scripts/createAdmin.js to create one\n");
      process.exit(0);
    }

    let updatedCount = 0;

    for (const admin of admins) {
      console.log(`\n👤 Admin: ${admin.name} (${admin.email})`);
      console.log(`   Current active status: ${admin.active}`);

      if (admin.active === undefined || admin.active === null) {
        admin.active = true;
        await admin.save();
        console.log(`   ✅ Updated to: true`);
        updatedCount++;
      } else {
        console.log(`   ℹ️  Already has active field set`);
      }
    }

    console.log(`\n✅ Migration complete!`);
    console.log(`   Updated: ${updatedCount} admin(s)`);
    console.log(`   Total: ${admins.length} admin(s)\n`);
  } catch (error) {
    console.error("\n❌ Error:", error.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

fixAdminActiveField();
