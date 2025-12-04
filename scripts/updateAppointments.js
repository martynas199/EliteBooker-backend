import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import Appointment from "../src/models/Appointment.js";

const MONGO_URI = process.env.MONGO_URI;

async function updateAppointments() {
  try {
    await mongoose.connect(MONGO_URI);

    // Update all confirmed appointments to completed
    const result = await Appointment.updateMany(
      { status: "confirmed" },
      { $set: { status: "completed" } }
    );

    console.log(
      `✅ Updated ${result.modifiedCount} appointments to "completed" status`
    );

    const completed = await Appointment.countDocuments({ status: "completed" });
    console.log(`📊 Total completed appointments: ${completed}`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

updateAppointments();
