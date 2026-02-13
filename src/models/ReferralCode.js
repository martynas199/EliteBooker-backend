/**
 * ReferralCode Model
 * Handles database operations for referral codes
 */

import mongoose from "mongoose";
import { generateUniqueCode } from "../utils/referralCodeGenerator.js";

const referralCodeSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    length: 6,
    match: /^[A-Z]{3}[2-9]{3}$/,
  },
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: "ownerType",
  },
  ownerType: {
    type: String,
    required: true,
    enum: ["Client", "Tenant"],
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Add indexes
referralCodeSchema.index({ code: 1 });
referralCodeSchema.index({ ownerId: 1, ownerType: 1 });
referralCodeSchema.index({ isActive: 1 });

// Statics

/**
 * Create a new referral code for a user
 */
referralCodeSchema.statics.createForOwner = async function (
  ownerId,
  ownerType,
) {
  // Check if user already has a code
  const existing = await this.findOne({
    ownerId,
    ownerType,
    isActive: true,
  });

  if (existing) {
    return existing;
  }

  // Generate unique code
  const code = await generateUniqueCode();

  const referralCode = new this({
    code,
    ownerId,
    ownerType,
  });

  await referralCode.save();
  return referralCode;
};

/**
 * Find by code
 */
referralCodeSchema.statics.findByCode = async function (code) {
  return this.findOne({ code, isActive: true });
};

/**
 * Find by owner
 */
referralCodeSchema.statics.findByOwner = async function (ownerId, ownerType) {
  return this.findOne({ ownerId, ownerType, isActive: true });
};

/**
 * Get stats for a referral code
 */
referralCodeSchema.methods.getStats = async function () {
  const Referral = mongoose.model("Referral");

  const referrals = await Referral.find({ referralCodeId: this._id });

  const stats = {
    totalReferrals: referrals.length,
    activeReferrals: referrals.filter((r) => r.status === "active").length,
    pendingReferrals: referrals.filter((r) => r.status === "pending").length,
    churnedReferrals: referrals.filter((r) => r.status === "churned").length,
    totalRewards: referrals.reduce((sum, r) => sum + (r.rewardAmount || 0), 0),
    paidRewards: referrals
      .filter((r) => r.rewardStatus === "paid")
      .reduce((sum, r) => sum + (r.rewardAmount || 0), 0),
    pendingRewards: referrals
      .filter((r) => r.rewardStatus === "pending")
      .reduce((sum, r) => sum + (r.rewardAmount || 0), 0),
  };

  return stats;
};

const ReferralCode = mongoose.model("ReferralCode", referralCodeSchema);

export default ReferralCode;
