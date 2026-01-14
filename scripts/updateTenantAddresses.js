import dotenv from "dotenv";
import mongoose from "mongoose";
import Tenant from "../src/models/Tenant.js";
import Settings from "../src/models/Settings.js";

// Pull tenants in Peterborough and assign unique addresses.
// Addresses are intentionally varied for testing/demo data.
const uniquePeterboroughAddresses = [
  { street: "17 Cathedral Square", postalCode: "PE1 1XB" },
  { street: "92 Rivergate", postalCode: "PE1 1EL" },
  { street: "5 Cowgate", postalCode: "PE1 1LZ" },
  { street: "45 Broadway", postalCode: "PE1 1SQ" },
  { street: "8 Bridge Street", postalCode: "PE1 1DW" },
  { street: "12 Lincoln Road", postalCode: "PE1 2RL" },
  { street: "24 Eastfield Road", postalCode: "PE1 4AN" },
  { street: "39 London Road", postalCode: "PE2 8AN" },
  { street: "61 Park Road", postalCode: "PE1 2TH" },
  { street: "74 Mayor's Walk", postalCode: "PE3 6HA" },
  { street: "2 North Street", postalCode: "PE1 2RA" },
  { street: "31 Westgate", postalCode: "PE1 1PZ" },
  { street: "19 Wentworth Street", postalCode: "PE1 1DH" },
  { street: "56 Burghley Road", postalCode: "PE1 2QA" },
  { street: "6 Priestgate", postalCode: "PE1 1LF" },
  { street: "28 Queensgate", postalCode: "PE1 1NT" },
  { street: "14 Oundle Road", postalCode: "PE2 9PJ" },
  { street: "63 Thorpe Road", postalCode: "PE3 6JQ" },
  { street: "85 Garton End Road", postalCode: "PE1 4EZ" },
  { street: "9 Bishop's Road", postalCode: "PE1 5BW" },
];

dotenv.config();

const MONGO_URI = process.env.MONGO_URI?.replace(/^['"]|['"]$/g, "").trim();

if (!MONGO_URI) {
  console.error("❌ MONGO_URI is missing");
  process.exit(1);
}

async function main() {
  await mongoose.connect(MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    family: 4,
  });
  console.log("✓ Connected to MongoDB");

  const tenants = await Tenant.find({ "address.city": /peterborough/i }).sort(
    "slug"
  );

  if (!tenants.length) {
    console.log("No Peterborough tenants found. Nothing to do.");
    process.exit(0);
  }

  if (tenants.length > uniquePeterboroughAddresses.length) {
    console.warn(
      `⚠️ Not enough unique addresses (${uniquePeterboroughAddresses.length}) for ${tenants.length} tenants.`
    );
  }

  let updated = 0;
  for (let i = 0; i < tenants.length; i += 1) {
    const tenant = tenants[i];
    const addr =
      uniquePeterboroughAddresses[i % uniquePeterboroughAddresses.length];

    // Skip if address already matches the assigned one.
    const alreadySet =
      tenant.address?.street === addr.street &&
      tenant.address?.postalCode === addr.postalCode &&
      /peterborough/i.test(tenant.address?.city || "");
    if (alreadySet) continue;

    tenant.address = {
      ...(tenant.address || {}),
      street: addr.street,
      city: "Peterborough",
      postalCode: addr.postalCode,
      country: tenant.address?.country || "United Kingdom",
    };
    await tenant.save();
    updated += 1;

    await Settings.updateOne(
      { tenantId: tenant._id },
      {
        $set: {
          salonAddress: `${addr.street}, Peterborough, ${addr.postalCode}, United Kingdom`,
        },
      }
    );

    console.log(
      `✓ ${tenant.slug} -> ${addr.street}, Peterborough, ${addr.postalCode}`
    );
  }

  console.log(`\nUpdated ${updated} tenant(s).`);
  await mongoose.disconnect();
  console.log("Disconnected. Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Failed:", err);
  process.exit(1);
});
