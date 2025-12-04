import dotenv from "dotenv";
dotenv.config();

console.log("\n🔍 Checking Environment Variables:\n");

const requiredVars = [
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
];

let allPresent = true;

requiredVars.forEach((varName) => {
  const value = process.env[varName];
  if (value) {
    console.log(`✅ ${varName}: ${value.substring(0, 10)}...`);
  } else {
    console.log(`❌ ${varName}: NOT FOUND`);
    allPresent = false;
  }
});

console.log("\n");

if (allPresent) {
  console.log("✅ All Cloudinary environment variables are present!");
  console.log("\nNow test the Cloudinary connection with:");
  console.log("node scripts/test-cloudinary.js");
} else {
  console.log("❌ Some environment variables are missing!");
  console.log("\nPlease check your .env file and ensure it contains:");
  console.log("CLOUDINARY_CLOUD_NAME=your_cloud_name");
  console.log("CLOUDINARY_API_KEY=your_api_key");
  console.log("CLOUDINARY_API_SECRET=your_api_secret");
}
