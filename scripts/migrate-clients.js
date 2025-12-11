/**
 * Migration Script: Convert Appointments to Global Client System
 *
 * This script migrates existing appointments to use the new global client system:
 * 1. For each appointment without clientId, find or create a Client record
 * 2. Find or create corresponding TenantClient relationship
 * 3. Update appointment with clientId
 * 4. Calculate metrics for TenantClient (totalSpend, totalVisits, etc.)
 *
 * Run with: node scripts/migrate-clients.js
 */

import "../src/config/env.js";
import mongoose from "mongoose";
import ClientService from "../src/services/clientService.js";

const MONGODB_URI = process.env.MONGODB_URI;

async function migrateClients() {
  try {
    console.log("🚀 Starting client migration...");
    console.log(
      `📊 Connecting to MongoDB: ${MONGODB_URI?.substring(0, 30)}...`
    );

    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log("✅ Connected to MongoDB");

    const Appointment = mongoose.model("Appointment");

    // Get all appointments without clientId
    const appointmentsToMigrate = await Appointment.find({
      clientId: { $exists: false },
      "client.email": { $exists: true }, // Must have email
    }).select(
      "_id client tenantId serviceId specialistId totalAmount status start"
    );

    console.log(
      `📦 Found ${appointmentsToMigrate.length} appointments to migrate`
    );

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    for (const appointment of appointmentsToMigrate) {
      try {
        console.log(`\n🔄 Processing appointment ${appointment._id}...`);

        // Find or create Client
        const client = await ClientService.findOrCreateClient({
          email: appointment.client.email,
          name: appointment.client.name,
          phone: appointment.client.phone,
        });

        console.log(
          `   ✅ Client found/created: ${client.email} (${client._id})`
        );

        // Find or create TenantClient
        const tenantClient = await ClientService.findOrCreateTenantClient(
          appointment.tenantId,
          client._id
        );

        console.log(`   ✅ TenantClient relationship created`);

        // Update appointment with clientId
        appointment.clientId = client._id;
        await appointment.save();

        console.log(`   ✅ Appointment updated with clientId`);

        successCount++;
      } catch (error) {
        errorCount++;
        const errorMsg = `Appointment ${appointment._id}: ${error.message}`;
        errors.push(errorMsg);
        console.error(`   ❌ ${errorMsg}`);
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("📊 MIGRATION SUMMARY");
    console.log("=".repeat(60));
    console.log(`✅ Successfully migrated: ${successCount} appointments`);
    console.log(`❌ Failed: ${errorCount} appointments`);
    console.log("=".repeat(60));

    if (errors.length > 0) {
      console.log("\n⚠️  ERRORS:");
      errors.forEach((err, idx) => {
        console.log(`${idx + 1}. ${err}`);
      });
    }

    // Now update metrics for all TenantClients
    console.log("\n🔄 Updating TenantClient metrics...");

    const TenantClient = mongoose.model("TenantClient");
    const allTenantClients = await TenantClient.find({});

    console.log(
      `📦 Found ${allTenantClients.length} TenantClient relationships to update`
    );

    let metricsSuccessCount = 0;
    let metricsErrorCount = 0;

    for (const tenantClient of allTenantClients) {
      try {
        await ClientService.updateTenantClientMetrics(
          tenantClient.tenantId,
          tenantClient.clientId
        );
        metricsSuccessCount++;
        console.log(
          `   ✅ Updated metrics for TenantClient ${tenantClient._id}`
        );
      } catch (error) {
        metricsErrorCount++;
        console.error(
          `   ❌ Failed to update metrics for ${tenantClient._id}: ${error.message}`
        );
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("📊 METRICS UPDATE SUMMARY");
    console.log("=".repeat(60));
    console.log(
      `✅ Successfully updated: ${metricsSuccessCount} TenantClients`
    );
    console.log(`❌ Failed: ${metricsErrorCount} TenantClients`);
    console.log("=".repeat(60));

    console.log("\n✅ Migration complete!");

    // Print some stats
    const Client = mongoose.model("Client");
    const totalClients = await Client.countDocuments();
    const totalTenantClients = await TenantClient.countDocuments();
    const totalAppointmentsWithClient = await Appointment.countDocuments({
      clientId: { $exists: true },
    });

    console.log("\n" + "=".repeat(60));
    console.log("📊 FINAL STATISTICS");
    console.log("=".repeat(60));
    console.log(`👥 Total unique clients: ${totalClients}`);
    console.log(
      `🔗 Total client-business relationships: ${totalTenantClients}`
    );
    console.log(
      `📅 Total appointments with clientId: ${totalAppointmentsWithClient}`
    );
    console.log("=".repeat(60));
  } catch (error) {
    console.error("\n❌ Migration failed:", error);
    throw error;
  } finally {
    await mongoose.connection.close();
    console.log("\n🔌 Disconnected from MongoDB");
  }
}

// Run migration
migrateClients()
  .then(() => {
    console.log("\n✅ Script completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Script failed:", error);
    process.exit(1);
  });
