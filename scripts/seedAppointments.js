import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import Appointment from "../src/models/Appointment.js";
import Service from "../src/models/Service.js";
import Beautician from "../src/models/Beautician.js";
import dayjs from "dayjs";

const MONGO_URI = process.env.MONGO_URI;

async function seedAppointments() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB");

    // Get existing specialists and services
    const specialists = await Beautician.find();
    const services = await Service.find();

    if (specialists.length === 0 || services.length === 0) {
      console.log(
        "No specialists or services found. Please run the main seed script first."
      );
      process.exit(1);
    }

    console.log(
      `Found ${specialists.length} specialists and ${services.length} services`
    );

    // Clear existing appointments
    await Appointment.deleteMany({});
    console.log("Cleared existing appointments");

    // Create sample completed appointments for the last 30 days
    const appointments = [];
    const today = dayjs();

    for (let i = 0; i < 30; i++) {
      const appointmentDate = today.subtract(i, "day");

      // Skip if it's a Sunday
      if (appointmentDate.day() === 0) continue;

      // Create 2-4 appointments per day
      const numAppointments = Math.floor(Math.random() * 3) + 2;

      for (let j = 0; j < numAppointments; j++) {
        const service = services[Math.floor(Math.random() * services.length)];
        const specialist =
          specialists[Math.floor(Math.random() * specialists.length)];
        const variant = service.variants[0];

        // Random time between 9am and 4pm
        const hour = 9 + Math.floor(Math.random() * 7);
        const minute = Math.random() > 0.5 ? 0 : 30;

        const appointment = {
          customerName: `Customer ${Math.floor(Math.random() * 100)}`,
          customerEmail: `customer${Math.floor(
            Math.random() * 100
          )}@example.com`,
          customerPhone: `07${
            Math.floor(Math.random() * 900000000) + 100000000
          }`,
          date: appointmentDate.hour(hour).minute(minute).second(0).toDate(),
          startTime: `${hour.toString().padStart(2, "0")}:${minute
            .toString()
            .padStart(2, "0")}`,
          endTime: dayjs()
            .hour(hour)
            .minute(minute)
            .add(variant.durationMin, "minute")
            .format("HH:mm"),
          serviceId: service._id,
          variantName: variant.name,
          beauticianId: specialist._id,
          price: variant.price,
          durationMin: variant.durationMin,
          status: "completed", // All appointments are completed
          paymentIntentId: `pi_test_${Date.now()}_${Math.random()
            .toString(36)
            .substring(7)}`,
          createdAt: appointmentDate
            .subtract(Math.floor(Math.random() * 7), "day")
            .toDate(),
        };

        appointments.push(appointment);
      }
    }

    // Insert all appointments
    const result = await Appointment.insertMany(appointments);
    console.log(
      `\n✅ Successfully created ${result.length} completed appointments`
    );

    // Calculate some stats
    const totalRevenue = appointments.reduce((sum, apt) => sum + apt.price, 0);
    const byBeautician = {};

    appointments.forEach((apt) => {
      const specialist = specialists.find((b) =>
        b._id.equals(apt.beauticianId)
      );
      const name = specialist?.name || "Unknown";
      if (!byBeautician[name]) {
        byBeautician[name] = { count: 0, revenue: 0 };
      }
      byBeautician[name].count++;
      byBeautician[name].revenue += apt.price;
    });

    console.log("\n📊 Revenue Summary:");
    console.log(`Total Revenue: £${totalRevenue.toFixed(2)}`);
    console.log(`Total Appointments: ${appointments.length}`);
    console.log(
      `Average per Appointment: £${(totalRevenue / appointments.length).toFixed(
        2
      )}`
    );
    console.log("\n👥 By Beautician:");
    Object.entries(byBeautician).forEach(([name, stats]) => {
      console.log(
        `  ${name}: ${stats.count} appointments, £${stats.revenue.toFixed(2)}`
      );
    });

    await mongoose.disconnect();
    console.log("\n✨ Done!");
    process.exit(0);
  } catch (error) {
    console.error("Error seeding appointments:", error);
    process.exit(1);
  }
}

seedAppointments();
