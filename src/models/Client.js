import mongoose from "mongoose";

/**
 * Global Client Model (Platform-Wide)
 * Represents a client across the entire platform
 * Clients can book with multiple businesses
 */
const clientSchema = new mongoose.Schema(
  {
    // Core Identity
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    phone: {
      type: String,
      sparse: true,
      unique: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },

    // Authentication
    password: {
      type: String,
      select: false, // Don't include by default in queries
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    isPhoneVerified: {
      type: Boolean,
      default: false,
    },
    authProvider: {
      type: String,
      enum: ["email", "google", "facebook", "phone"],
      default: "email",
    },
    googleId: String,
    facebookId: String,
    avatar: String, // Profile picture URL

    // Global Preferences
    preferredLanguage: {
      type: String,
      default: "en",
    },
    preferredCurrency: {
      type: String,
      default: "GBP",
    },

    // Platform-Wide Statistics
    totalBookings: {
      type: Number,
      default: 0,
    },
    memberSince: {
      type: Date,
      default: Date.now,
    },
    lastActivity: {
      type: Date,
      default: Date.now,
    },

    // GDPR & Privacy
    marketingConsent: {
      type: Boolean,
      default: false,
    },
    dataProcessingConsent: {
      type: Boolean,
      default: true,
    },
    consentDate: {
      type: Date,
      default: Date.now,
    },

    // Account Status
    isActive: {
      type: Boolean,
      default: true,
    },
    isSuspended: {
      type: Boolean,
      default: false,
    },
    suspensionReason: String,
    suspendedAt: Date,

    // Password Reset
    resetPasswordToken: String,
    resetPasswordExpires: Date,

    // Email Verification
    verificationToken: String,
    verificationTokenExpires: Date,
  },
  {
    timestamps: true,
  }
);

// Indexes
clientSchema.index({ email: 1, authProvider: 1 });
clientSchema.index({ lastActivity: -1 });
clientSchema.index({ memberSince: -1 });

// Methods
clientSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.resetPasswordToken;
  delete obj.resetPasswordExpires;
  delete obj.verificationToken;
  delete obj.verificationTokenExpires;
  return obj;
};

// Update last activity on save
clientSchema.pre("save", function (next) {
  if (this.isModified()) {
    this.lastActivity = new Date();
  }
  next();
});

const Client = mongoose.model("Client", clientSchema);

export default Client;
