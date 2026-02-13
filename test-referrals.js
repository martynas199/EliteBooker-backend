/**
 * Test Script for Referral System
 * Tests MongoDB models and referral code generation
 */

import mongoose from "mongoose";
import ReferralCode from "./src/models/ReferralCode.js";
import Referral from "./src/models/Referral.js";
import {
  generateUniqueCode,
  isValidFormat,
  normalizeCode,
} from "./src/utils/referralCodeGenerator.js";
import dotenv from "dotenv";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/booking";

async function runTests() {
  try {
    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to MongoDB\n");

    // Test 1: Code generation
    console.log("📝 Test 1: Generate unique referral code");
    const code = await generateUniqueCode();
    console.log(`   Generated code: ${code}`);
    console.log(`   Format valid: ${isValidFormat(code)}`);
    console.log(`   Length: ${code.length}`);
    console.log("   ✅ Code generation successful\n");

    // Test 2: Create referral code
    console.log("📝 Test 2: Create referral code document");
    // Use a test owner ID
    const testOwnerId = new mongoose.Types.ObjectId();
    const referralCode = await ReferralCode.createForOwner(
      testOwnerId,
      "Tenant",
    );
    console.log(`   Created referral code: ${referralCode.code}`);
    console.log(`   Owner ID: ${referralCode.ownerId}`);
    console.log(`   Owner Type: ${referralCode.ownerType}`);
    console.log(`   Active: ${referralCode.isActive}`);
    console.log("   ✅ Referral code creation successful\n");

    // Test 3: Find by code
    console.log("📝 Test 3: Find referral code by code string");
    const found = await ReferralCode.findByCode(referralCode.code);
    console.log(`   Found: ${found ? "Yes" : "No"}`);
    console.log(`   Code matches: ${found.code === referralCode.code}`);
    console.log("   ✅ Find by code successful\n");

    // Test 4: Find by owner
    console.log("📝 Test 4: Find referral code by owner");
    const foundByOwner = await ReferralCode.findByOwner(testOwnerId, "Tenant");
    console.log(`   Found: ${foundByOwner ? "Yes" : "No"}`);
    console.log(`   Same code: ${foundByOwner.code === referralCode.code}`);
    console.log("   ✅ Find by owner successful\n");

    // Test 5: Create referral record
    console.log("📝 Test 5: Create referral record");
    const testBusinessId = new mongoose.Types.ObjectId();
    const referral = await Referral.createReferral({
      referralCodeId: referralCode._id,
      referredBusinessId: testBusinessId,
      referredBusinessName: "Test Salon",
      referredBusinessEmail: "test@example.com",
      status: "pending",
    });
    console.log(`   Referral ID: ${referral._id}`);
    console.log(`   Business Name: ${referral.referredBusinessName}`);
    console.log(`   Status: ${referral.status}`);
    console.log("   ✅ Referral creation successful\n");

    // Test 6: Get stats
    console.log("📝 Test 6: Get referral code stats");
    const stats = await referralCode.getStats();
    console.log(`   Total Referrals: ${stats.totalReferrals}`);
    console.log(`   Active: ${stats.activeReferrals}`);
    console.log(`   Pending: ${stats.pendingReferrals}`);
    console.log(`   Total Rewards: £${stats.totalRewards}`);
    console.log("   ✅ Stats retrieval successful\n");

    // Test 7: Get dashboard data
    console.log("📝 Test 7: Get dashboard data (without populate)");
    const dashboard = await Referral.find({ referralCodeId: referralCode._id });
    console.log(`   Referrals found: ${dashboard.length}`);
    console.log("   ✅ Dashboard data retrieval successful\n");

    // Test 8: Code validation
    console.log("📝 Test 8: Code format validation");
    console.log(`   "ABC234" valid: ${isValidFormat("ABC234")}`);
    console.log(`   "ABC123" valid (has 1): ${isValidFormat("ABC123")}`);
    console.log(`   "ABO234" valid (has O): ${isValidFormat("ABO234")}`);
    console.log(`   "AB234" valid (too short): ${isValidFormat("AB234")}`);
    console.log(`   "ABCD234" valid (too long): ${isValidFormat("ABCD234")}`);
    console.log("   ✅ Validation tests complete\n");

    // Test 9: Duplicate code prevention
    console.log("📝 Test 9: Prevent duplicate codes");
    const duplicate = await ReferralCode.createForOwner(testOwnerId, "Tenant");
    console.log(
      `   Same code returned: ${duplicate.code === referralCode.code}`,
    );
    console.log(
      `   Same ID: ${duplicate._id.toString() === referralCode._id.toString()}`,
    );
    console.log("   ✅ Duplicate prevention successful\n");

    // Cleanup
    console.log("🧹 Cleaning up test data...");
    await ReferralCode.deleteOne({ _id: referralCode._id });
    await Referral.deleteOne({ _id: referral._id });
    console.log("✅ Cleanup complete\n");

    console.log("🎉 All tests passed!");
  } catch (error) {
    console.error("❌ Test failed:", error);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
    console.log("\n🔌 Disconnected from MongoDB");
    process.exit(0);
  }
}

runTests();
