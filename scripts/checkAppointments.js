import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import Appointment from "../src/models/Appointment.js";

const MONGO_URI = process.env.MONGO_URI;

async function checkAppointments() {
  try {
    await mongoose.connect(MONGO_URI);

    const total = await Appointment.countDocuments();
    const completed = await Appointment.countDocuments({ status: "completed" });
    const pending = await Appointment.countDocuments({ status: "pending" });
    const confirmed = await Appointment.countDocuments({ status: "confirmed" });

    console.log("📊 Appointment Status Summary:");
    console.log(`Total appointments: ${total}`);
    console.log(`Completed: ${completed}`);
    console.log(`Confirmed: ${confirmed}`);
    console.log(`Pending: ${pending}`);

    console.log("\n📅 Sample appointments:");
    const samples = await Appointment.find()
      .populate("specialistId", "name")
      .populate("serviceId", "name")
      .limit(5)
      .lean();

    samples.forEach((apt, i) => {
      console.log(
        `${i + 1}. ${apt.customerName} - ${apt.serviceId?.name} - ${
          apt.status
        } - £${apt.price} - ${new Date(apt.date).toLocaleDateString()}`
      );
    });

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

checkAppointments();
