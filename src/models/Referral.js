/**
 * Referral Model
 * Tracks individual referrals made using referral codes
 */

import mongoose from "mongoose";

const referralSchema = new mongoose.Schema(
  {
    referralCodeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ReferralCode",
      required: true,
    },
    referredBusinessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
    referredBusinessName: {
      type: String,
      required: true,
    },
    referredBusinessEmail: {
      type: String,
      required: true,
      lowercase: true,
    },
    status: {
      type: String,
      enum: ["pending", "active", "churned"],
      default: "pending",
    },
    firstBookingAt: {
      type: Date,
    },
    rewardAmount: {
      type: Number,
      default: 0,
    },
    rewardStatus: {
      type: String,
      enum: ["pending", "paid", "cancelled"],
      default: "pending",
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  },
);

// Add indexes
referralSchema.index({ referralCodeId: 1 });
referralSchema.index({ referredBusinessId: 1 });
referralSchema.index({ referredBusinessEmail: 1 });
referralSchema.index({ status: 1 });
referralSchema.index({ createdAt: 1 });

// Statics

/**
 * Create a new referral record
 */
referralSchema.statics.createReferral = async function (data) {
  const {
    referralCodeId,
    referredBusinessId,
    referredBusinessName,
    referredBusinessEmail,
  } = data;

  const referral = new this({
    referralCodeId,
    referredBusinessId,
    referredBusinessName,
    referredBusinessEmail,
    status: "pending",
  });

  await referral.save();
  return referral;
};

/**
 * Find referrals by referral code ID
 */
referralSchema.statics.findByReferralCode = async function (referralCodeId) {
  return this.find({ referralCodeId })
    .populate("referredBusinessId", "name email slug")
    .sort({ createdAt: -1 });
};

/**
 * Find referral by referred business ID
 */
referralSchema.statics.findByBusinessId = async function (businessId) {
  return this.findOne({ referredBusinessId: businessId });
};

/**
 * Update referral status
 */
referralSchema.methods.updateStatus = async function (status) {
  this.status = status;
  await this.save();
  return this;
};

/**
 * Record first booking for a referral
 */
referralSchema.statics.recordFirstBooking = async function (businessId) {
  const referral = await this.findOne({
    referredBusinessId: businessId,
    firstBookingAt: null,
  });

  if (referral) {
    referral.firstBookingAt = new Date();
    referral.status = "active";
    await referral.save();
  }

  return referral;
};

/**
 * Update reward information
 */
referralSchema.methods.updateReward = async function (amount, status) {
  this.rewardAmount = amount;
  this.rewardStatus = status;
  await this.save();
  return this;
};

/**
 * Get referrals with detailed info for dashboard
 */
referralSchema.statics.getDashboardData = async function (
  referralCodeId,
  limit = 50,
  offset = 0,
) {
  const referrals = await this.find({ referralCodeId })
    .populate("referredBusinessId", "name email slug createdAt")
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(offset);

  const total = await this.countDocuments({ referralCodeId });

  return {
    referrals,
    total,
    limit,
    offset,
  };
};

/**
 * Get top referrers (for admin/leaderboard)
 */
referralSchema.statics.getTopReferrers = async function (limit = 10) {
  const ReferralCode = mongoose.model("ReferralCode");

  const leaderboard = await this.aggregate([
    {
      $group: {
        _id: "$referralCodeId",
        totalReferrals: { $sum: 1 },
        activeReferrals: {
          $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] },
        },
        totalRewards: { $sum: { $ifNull: ["$rewardAmount", 0] } },
      },
    },
    {
      $match: { totalReferrals: { $gt: 0 } },
    },
    {
      $sort: { totalReferrals: -1, activeReferrals: -1 },
    },
    {
      $limit: limit,
    },
  ]);

  // Populate referral code details
  for (let item of leaderboard) {
    const code = await ReferralCode.findById(item._id).populate(
      "ownerId",
      "name email",
    );
    if (code) {
      item.code = code.code;
      item.ownerId = code.ownerId;
      item.ownerType = code.ownerType;
      item.ownerName = code.ownerId?.name || "Unknown";
    }
  }

  return leaderboard;
};

const Referral = mongoose.model("Referral", referralSchema);

export default Referral;
