/**
 * Projection Validation Script
 *
 * This script helps validate that all fields used in the frontend
 * are included in the backend populate projections.
 *
 * Run: node scripts/validate-projections.js
 */

// Fields accessed in frontend based on grep search
const frontendUsage = {
  specialist: [
    "_id",
    "name",
    "email",
    "phone",
    "bio",
    "image",
    "specialty",
    "stripeStatus",
    "subscription", // Deep: subscription.noFeeBookings.enabled, subscription.noFeeBookings.status
  ],
  service: [
    "_id",
    "name",
    "description",
    "category",
    "image",
    "variants", // Array with name, price, duration
    "price",
    "duration",
    "active",
    "primaryBeauticianId", // Populated specialist
    "specialistId", // Populated specialist (legacy)
  ],
  user: ["_id", "name", "email", "phone"],
  client: ["name", "email", "phone"],
};

// Current backend projections (from src/utils/queryHelpers.js)
const backendProjections = {
  specialist:
    "_id name email phone bio image specialty active stripeStatus subscription",
  service:
    "_id name description category image variants price duration active primaryBeauticianId specialistId",
  user: "_id name email phone",
  client: "name email phone",
};

/**
 * Validate projections
 */
function validateProjections() {
  console.log("🔍 Validating Backend Projections...\n");

  let hasIssues = false;

  for (const [model, fields] of Object.entries(frontendUsage)) {
    const projection = backendProjections[model];
    if (!projection) {
      console.log(`❌ ${model}: No projection defined!`);
      hasIssues = true;
      continue;
    }

    const projectedFields = projection.split(" ");
    const missingFields = fields.filter((f) => !projectedFields.includes(f));

    if (missingFields.length > 0) {
      console.log(`⚠️  ${model}: Missing fields in projection:`);
      missingFields.forEach((f) => console.log(`   - ${f}`));
      hasIssues = true;
    } else {
      console.log(`✅ ${model}: All frontend fields are projected`);
    }

    console.log(`   Frontend uses: ${fields.join(", ")}`);
    console.log(`   Backend projects: ${projection}`);
    console.log("");
  }

  if (!hasIssues) {
    console.log(
      "\n✨ All projections are valid! No missing fields detected.\n"
    );
  } else {
    console.log(
      "\n⚠️  Some projections may need updates. Review the output above.\n"
    );
  }

  return !hasIssues;
}

/**
 * Generate recommended projections
 */
function generateRecommendations() {
  console.log("📝 Recommended Projections:\n");
  console.log("export const populateProjections = {");

  for (const [model, fields] of Object.entries(frontendUsage)) {
    const projection = fields.join(" ");
    console.log(`  ${model}: "${projection}",`);
  }

  console.log("};\n");
}

// Run validation
const isValid = validateProjections();

if (!isValid) {
  console.log("\n" + "=".repeat(60) + "\n");
  generateRecommendations();
}

process.exit(isValid ? 0 : 1);
