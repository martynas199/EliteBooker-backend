import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import Appointment from "../src/models/Appointment.js";

const MONGO_URI = process.env.MONGO_URI;

async function checkDates() {
  try {
    await mongoose.connect(MONGO_URI);

    const appointments = await Appointment.find({ status: "completed" })
      .select("date status price customerName")
      .lean();

    console.log(`\n📅 Found ${appointments.length} completed appointments:\n`);
    appointments.forEach((apt, i) => {
      const dateStr = apt.date
        ? new Date(apt.date).toISOString().split("T")[0]
        : "No date";
      console.log(
        `${i + 1}. Date: ${dateStr} | Price: £${apt.price} | Customer: ${
          apt.customerName
        }`
      );
    });

    if (appointments.length > 0) {
      const dates = appointments.map((a) => new Date(a.date));
      const minDate = new Date(Math.min(...dates));
      const maxDate = new Date(Math.max(...dates));
      console.log(
        `\n📊 Date range: ${minDate.toISOString().split("T")[0]} to ${
          maxDate.toISOString().split("T")[0]
        }`
      );
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

checkDates();
