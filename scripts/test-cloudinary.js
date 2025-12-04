#!/usr/bin/env node
/**
 * Test script to verify Cloudinary configuration
 * Run with: node scripts/test-cloudinary.js
 */

import dotenv from "dotenv";
dotenv.config();

import { v2 as cloudinary } from "cloudinary";

console.log("\n🧪 Testing Cloudinary Configuration...\n");

// Check environment variables
console.log("📋 Environment Variables:");
console.log(
  `  CLOUDINARY_CLOUD_NAME: ${
    process.env.CLOUDINARY_CLOUD_NAME ? "✅ Set" : "❌ Missing"
  }`
);
console.log(
  `  CLOUDINARY_API_KEY: ${
    process.env.CLOUDINARY_API_KEY ? "✅ Set" : "❌ Missing"
  }`
);
console.log(
  `  CLOUDINARY_API_SECRET: ${
    process.env.CLOUDINARY_API_SECRET ? "✅ Set" : "❌ Missing"
  }`
);
console.log("");

if (
  !process.env.CLOUDINARY_CLOUD_NAME ||
  !process.env.CLOUDINARY_API_KEY ||
  !process.env.CLOUDINARY_API_SECRET
) {
  console.error("❌ Cloudinary credentials are missing!");
  console.error("\nPlease add these to your .env file:");
  console.error("CLOUDINARY_CLOUD_NAME=your_cloud_name");
  console.error("CLOUDINARY_API_KEY=your_api_key");
  console.error("CLOUDINARY_API_SECRET=your_api_secret");
  console.error("\nGet your credentials from: https://cloudinary.com/console");
  process.exit(1);
}

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

console.log("⚙️  Cloudinary Configuration:");
console.log(`  Cloud Name: ${cloudinary.config().cloud_name}`);
console.log(`  API Key: ${cloudinary.config().api_key?.substring(0, 8)}...`);
console.log("");

// Test connection by pinging API
console.log("🔌 Testing Cloudinary API connection...");

try {
  const result = await cloudinary.api.ping();
  console.log("✅ Connection successful!");
  console.log(`   Response: ${JSON.stringify(result)}`);
  console.log("\n✨ Cloudinary is properly configured and working!\n");
  process.exit(0);
} catch (error) {
  console.error("❌ Connection failed!");
  console.error(`   Error: ${error.message}`);
  console.error("\n⚠️  Please check your credentials and try again.\n");
  process.exit(1);
}
