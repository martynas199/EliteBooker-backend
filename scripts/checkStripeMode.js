import dotenv from "dotenv";
dotenv.config();

console.log("\n🔍 Stripe Configuration Check\n");
console.log("================================");

const stripeKey = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET;

if (!stripeKey) {
  console.log("❌ No Stripe key found!");
  console.log("   Set STRIPE_SECRET_KEY in your .env file");
} else {
  const isLiveMode = stripeKey.startsWith("sk_live_");
  const isTestMode = stripeKey.startsWith("sk_test_");

  console.log(`\n🔑 Stripe Key: ${stripeKey.substring(0, 15)}...`);
  console.log(`\n📍 Mode: ${isLiveMode ? "🔴 LIVE MODE" : "🟢 TEST MODE"}`);

  if (isLiveMode) {
    console.log("\n⚠️  WARNING: You're using LIVE mode keys!");
    console.log("   Live mode requires HTTPS URLs for all redirects.");
    console.log("\n💡 For local development:");
    console.log("   1. Switch to TEST mode keys (sk_test_...)");
    console.log(
      "   2. Get test keys from: https://dashboard.stripe.com/test/apikeys"
    );
    console.log("   3. Update .env file:");
    console.log("      STRIPE_SECRET_KEY=sk_test_...");
    console.log("      STRIPE_PUBLISHABLE_KEY=pk_test_...");
  } else if (isTestMode) {
    console.log("\n✅ Test mode is perfect for local development!");
  }

  console.log(`\n🌐 Frontend URL: ${process.env.FRONTEND_URL}`);
  const frontendIsHttps = process.env.FRONTEND_URL?.startsWith("https://");

  if (isLiveMode && !frontendIsHttps) {
    console.log("   ❌ ERROR: FRONTEND_URL must use HTTPS in live mode");
    console.log("   Current: " + process.env.FRONTEND_URL);
    console.log("   Required: https://...");
  } else {
    console.log("   ✅ URL is compatible with current mode");
  }
}

console.log("\n================================\n");
