import Stripe from "stripe";
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

// Initialize Stripe
const stripe = new Stripe(
  process.env.STRIPE_SECRET || process.env.STRIPE_SECRET_KEY,
  {
    apiVersion: "2024-06-20",
  }
);

// Define Subscription schema inline
const SubscriptionSchema = new mongoose.Schema(
  {
    salonId: { type: String, required: true, unique: true },
    stripeSubscriptionId: { type: String, required: true },
    stripeCustomerId: { type: String, required: true },
    stripePriceId: { type: String, required: true },
    status: { type: String, required: true },
    currentPeriodEnd: Date,
    cancelAtPeriodEnd: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const Subscription = mongoose.model("Subscription", SubscriptionSchema);

async function syncSubscription() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✓ Connected to MongoDB");

    console.log("\nFetching active subscriptions from Stripe...");
    const subscriptions = await stripe.subscriptions.list({
      status: "active",
      limit: 10,
    });

    console.log(
      `\n✓ Found ${subscriptions.data.length} active subscription(s) in Stripe:\n`
    );

    if (subscriptions.data.length === 0) {
      console.log("No active subscriptions found in Stripe.");
      process.exit(0);
    }

    // Display all subscriptions
    subscriptions.data.forEach((sub, index) => {
      console.log(`${index + 1}. Subscription ID: ${sub.id}`);
      console.log(`   Customer ID: ${sub.customer}`);
      console.log(`   Status: ${sub.status}`);
      console.log(
        `   Created: ${new Date(sub.created * 1000).toLocaleDateString()}`
      );
      console.log(
        `   Current Period End: ${new Date(
          sub.current_period_end * 1000
        ).toLocaleDateString()}`
      );
      console.log("");
    });

    // Use the first active subscription
    const subscription = subscriptions.data[0];
    console.log(`\nUsing subscription: ${subscription.id}`);

    // Get the price ID from the subscription
    const priceId = subscription.items.data[0]?.price?.id;
    console.log(`Price ID: ${priceId}`);

    // Check if subscription already exists in database
    const existing = await Subscription.findOne({ salonId: "default" });

    if (existing) {
      console.log(`\n⚠ Subscription already exists in database:`);
      console.log(`   Salon ID: ${existing.salonId}`);
      console.log(
        `   Stripe Subscription ID: ${existing.stripeSubscriptionId}`
      );
      console.log(`   Status: ${existing.status}`);
      console.log(`\nUpdating with new data...`);

      existing.stripeSubscriptionId = subscription.id;
      existing.stripeCustomerId = subscription.customer;
      existing.stripePriceId = priceId;
      existing.status = subscription.status;
      existing.currentPeriodEnd = new Date(
        subscription.current_period_end * 1000
      );
      existing.cancelAtPeriodEnd = subscription.cancel_at_period_end;
      await existing.save();
      console.log("✓ Subscription updated successfully!");
    } else {
      console.log("\nCreating new subscription record in database...");

      const newSubscription = new Subscription({
        salonId: "default",
        stripeSubscriptionId: subscription.id,
        stripeCustomerId: subscription.customer,
        stripePriceId: priceId,
        status: subscription.status,
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
      });

      await newSubscription.save();
      console.log("✓ Subscription saved to database successfully!");
    }

    console.log("\n✓ Sync complete!");
    console.log("\nSubscription details:");
    console.log(`   Salon ID: default`);
    console.log(`   Stripe Subscription ID: ${subscription.id}`);
    console.log(`   Stripe Customer ID: ${subscription.customer}`);
    console.log(`   Stripe Price ID: ${priceId}`);
    console.log(`   Status: ${subscription.status}`);
    console.log(
      `   Current Period End: ${new Date(
        subscription.current_period_end * 1000
      ).toLocaleString()}`
    );

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    console.error(error);
    process.exit(1);
  }
}

syncSubscription();
