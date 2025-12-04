import mongoose from "mongoose";
import crypto from "crypto";

const refreshTokenSchema = new mongoose.Schema(
  {
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    createdByIp: {
      type: String,
    },
    revokedAt: {
      type: Date,
    },
    revokedByIp: {
      type: String,
    },
    replacedByToken: {
      type: String,
    },
    revokedReason: {
      type: String,
      enum: [
        "logout",
        "password_change",
        "token_reuse_detected",
        "manual_revoke",
      ],
    },
  },
  {
    timestamps: true,
  }
);

// Index for cleanup of expired tokens
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Virtual for checking if token is expired
refreshTokenSchema.virtual("isExpired").get(function () {
  return Date.now() >= this.expiresAt.getTime();
});

// Virtual for checking if token is active (not revoked and not expired)
refreshTokenSchema.virtual("isActive").get(function () {
  return !this.revokedAt && !this.isExpired;
});

// Instance method to revoke token
refreshTokenSchema.methods.revoke = function (ip, reason, replacedByToken) {
  this.revokedAt = Date.now();
  this.revokedByIp = ip;
  this.revokedReason = reason;
  if (replacedByToken) {
    this.replacedByToken = replacedByToken;
  }
  return this.save();
};

// Static method to generate a refresh token
refreshTokenSchema.statics.generateToken = function () {
  return crypto.randomBytes(40).toString("hex");
};

// Static method to create a new refresh token for an admin
refreshTokenSchema.statics.createForAdmin = async function (adminId, ip) {
  const token = this.generateToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  return this.create({
    token,
    adminId,
    expiresAt,
    createdByIp: ip,
  });
};

// Static method to revoke all tokens for an admin
refreshTokenSchema.statics.revokeAllForAdmin = async function (
  adminId,
  ip,
  reason
) {
  return this.updateMany(
    { adminId, revokedAt: null },
    {
      $set: {
        revokedAt: new Date(),
        revokedByIp: ip,
        revokedReason: reason,
      },
    }
  );
};

const RefreshToken = mongoose.model("RefreshToken", refreshTokenSchema);

export default RefreshToken;
