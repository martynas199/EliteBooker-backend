import mongoose from "mongoose";
import { multiTenantPlugin } from "../middleware/multiTenantPlugin.js";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    password: {
      type: String,
      required: function () {
        // Password only required if not using OAuth
        return !this.googleId && !this.appleId;
      },
      minlength: 6,
    },
    // OAuth provider IDs
    googleId: {
      type: String,
      sparse: true,
      unique: true,
    },
    appleId: {
      type: String,
      sparse: true,
      unique: true,
    },
    // OAuth provider metadata
    authProvider: {
      type: String,
      enum: ["local", "google", "apple"],
      default: "local",
    },
    // Virtual references to bookings and orders
    // We'll populate these via userId field in Appointment/Order models
    role: {
      type: String,
      enum: ["customer", "salon-admin", "specialist", "super-admin"],
      default: "customer",
    },
    // Track user statistics
    totalBookings: {
      type: Number,
      default: 0,
    },
    totalOrders: {
      type: Number,
      default: 0,
    },
    totalSpent: {
      type: Number,
      default: 0,
    },
    // Account status
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLogin: {
      type: Date,
    },
    // Wishlist - array of product IDs
    wishlist: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Performance indexes for common queries
userSchema.index({ email: 1 }); // Already unique
userSchema.index({ googleId: 1 }); // Already sparse unique
userSchema.index({ appleId: 1 }); // Already sparse unique
userSchema.index({ authProvider: 1, email: 1 }); // OAuth lookups
userSchema.index({ isActive: 1, createdAt: -1 }); // Active users
userSchema.index({ lastLogin: -1 }); // Recent activity

// Method to exclude password when converting to JSON
userSchema.methods.toJSON = function () {
  const user = this.toObject();
  delete user.password;
  return user;
};

// Apply multi-tenant plugin
userSchema.plugin(multiTenantPlugin, { required: false }); // Not required for super-admin

const User = mongoose.model("User", userSchema);

export default User;
