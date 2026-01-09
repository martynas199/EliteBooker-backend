import mongoose from "mongoose";
import dotenv from "dotenv";
import ConsentTemplate from "./src/models/ConsentTemplate.js";
import Service from "./src/models/Service.js";
import Tenant from "./src/models/Tenant.js";
import User from "./src/models/User.js";

dotenv.config();

async function addPrenatalConsent() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✓ Connected to MongoDB");

    // Find Serenity LOVES tenant
    const tenant = await Tenant.findOne({ slug: "serenity-loves-1" });
    if (!tenant) {
      console.error("❌ Serenity LOVES tenant not found");
      process.exit(1);
    }
    console.log(`✓ Found tenant: ${tenant.name}`);

    // Find Prenatal Massage service
    const prenatalService = await Service.findOne({
      name: "Prenatal Massage",
      tenantId: tenant._id,
    });
    if (!prenatalService) {
      console.error("❌ Prenatal Massage service not found");
      process.exit(1);
    }
    console.log(`✓ Found service: ${prenatalService.name}`);

    // Find an admin user for the tenant
    const admin = await User.findOne({
      tenantId: tenant._id,
      role: "tenant-admin",
    });
    if (!admin) {
      console.error("❌ Admin user not found");
      process.exit(1);
    }
    console.log(`✓ Found admin: ${admin.email}`);

    // Check if consent template already exists
    const existingTemplate = await ConsentTemplate.findOne({
      businessId: tenant._id,
      name: "Prenatal Massage Consent",
    });

    if (existingTemplate) {
      console.log("⚠️  Prenatal consent template already exists");

      // Check if service is already in requiredFor
      const hasService = existingTemplate.requiredFor.services.some(
        (s) => s.toString() === prenatalService._id.toString()
      );

      if (!hasService) {
        existingTemplate.requiredFor.services.push(prenatalService._id);
        await existingTemplate.save();
        console.log("✓ Added Prenatal Massage to existing template");
      } else {
        console.log("✓ Service already linked to template");
      }

      console.log("\nTemplate Status:", existingTemplate.status);
      console.log(
        "Required for services:",
        existingTemplate.requiredFor.services.length
      );

      process.exit(0);
    }

    // Create new consent template
    const consentTemplate = new ConsentTemplate({
      businessId: tenant._id,
      name: "Prenatal Massage Consent",
      description: "Consent form for prenatal massage services",
      version: 1,
      status: "published",
      sections: [
        {
          title: "Health Information",
          type: "checkboxes",
          required: true,
          fields: [
            {
              label: "I am past my first trimester of pregnancy (13+ weeks)",
              type: "checkbox",
              required: true,
            },
            {
              label:
                "I have consulted with my healthcare provider and have been cleared for massage therapy",
              type: "checkbox",
              required: true,
            },
          ],
        },
        {
          title: "Medical History",
          type: "text",
          required: true,
          fields: [
            {
              label:
                "Please list any pregnancy complications or conditions we should be aware of:",
              type: "textarea",
              required: false,
            },
          ],
        },
        {
          title: "Acknowledgment",
          type: "checkboxes",
          required: true,
          fields: [
            {
              label:
                "I understand that prenatal massage is not a substitute for medical care",
              type: "checkbox",
              required: true,
            },
            {
              label:
                "I will immediately inform the therapist if I experience any discomfort during the session",
              type: "checkbox",
              required: true,
            },
          ],
        },
      ],
      disclaimers: [
        "Prenatal massage is generally safe after the first trimester, but certain conditions may require additional precautions or contraindicate massage therapy.",
        "This service is not a medical treatment and should not replace regular prenatal care.",
      ],
      risks: [
        "Temporary soreness or fatigue",
        "Emotional release",
        "Allergic reaction to oils or lotions (please inform us of any allergies)",
      ],
      requiredFor: {
        services: [prenatalService._id],
        frequency: "once", // Only need to sign once
      },
      createdBy: admin._id,
      updatedBy: admin._id,
    });

    // Save the template
    await consentTemplate.save();
    console.log("✓ Created Prenatal Massage consent template");

    // Publish the template
    await consentTemplate.publish(admin._id);
    console.log("✓ Published consent template");

    console.log("\n✅ Successfully added prenatal massage consent template");
    console.log(`Template ID: ${consentTemplate._id}`);
    console.log(`Status: ${consentTemplate.status}`);
    console.log(`Required for service: ${prenatalService.name}`);

    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

addPrenatalConsent();
