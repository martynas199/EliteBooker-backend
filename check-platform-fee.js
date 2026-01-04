import dotenv from "dotenv";

dotenv.config();

console.log("Platform Fee Configuration Check:");
console.log("==================================");
console.log("STRIPE_PLATFORM_FEE env var:", process.env.STRIPE_PLATFORM_FEE);
console.log("Default value (if not set): 99");
console.log("Calculated fee:", Number(process.env.STRIPE_PLATFORM_FEE || 99));
console.log(
  "Fee in pounds:",
  Number(process.env.STRIPE_PLATFORM_FEE || 99) / 100
);
