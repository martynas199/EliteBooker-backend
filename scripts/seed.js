import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import Service from "../src/models/Service.js";
import Specialist from "../src/models/Specialist.js";
const MONGO_URI = process.env.MONGO_URI;
await mongoose.connect(MONGO_URI);
await Service.deleteMany({});
await Specialist.deleteMany({});
const b1 = await Specialist.create({
  name: "Anna Brow",
  specialties: ["Brows", "Lashes"],
  active: true,
  workingHours: {
    mon: {
      start: "09:00",
      end: "17:00",
      breaks: [{ start: "12:00", end: "12:30" }],
    },
    tue: {
      start: "09:00",
      end: "17:00",
      breaks: [{ start: "12:00", end: "12:30" }],
    },
    wed: {
      start: "09:00",
      end: "17:00",
      breaks: [{ start: "12:00", end: "12:30" }],
    },
    thu: {
      start: "09:00",
      end: "17:00",
      breaks: [{ start: "12:00", end: "12:30" }],
    },
    fri: {
      start: "09:00",
      end: "17:00",
      breaks: [{ start: "12:00", end: "12:30" }],
    },
    sat: { start: "10:00", end: "15:00", breaks: [] },
    sun: {},
  },
});
const b2 = await Specialist.create({
  name: "Mia Lashes",
  specialties: ["Lashes"],
  active: true,
  workingHours: {
    mon: {
      start: "10:00",
      end: "18:00",
      breaks: [{ start: "13:00", end: "13:30" }],
    },
    tue: {
      start: "10:00",
      end: "18:00",
      breaks: [{ start: "13:00", end: "13:30" }],
    },
    wed: {
      start: "10:00",
      end: "18:00",
      breaks: [{ start: "13:00", end: "13:30" }],
    },
    thu: {
      start: "10:00",
      end: "18:00",
      breaks: [{ start: "13:00", end: "13:30" }],
    },
    fri: {
      start: "10:00",
      end: "18:00",
      breaks: [{ start: "13:00", end: "13:30" }],
    },
    sat: { start: "10:00", end: "14:00", breaks: [] },
    sun: {},
  },
});
const s1 = await Service.create({
  name: "Brow Shaping",
  category: "Brows",
  imageUrl:
    "https://plus.unsplash.com/premium_photo-1718626727207-854154e67324?ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&q=80&w=687",
  variants: [
    {
      name: "Standard",
      durationMin: 30,
      price: 25,
      bufferBeforeMin: 5,
      bufferAfterMin: 10,
    },
  ],
  specialistId: b1._id,
});
const s2 = await Service.create({
  name: "Classic Lashes",
  category: "Lashes",
  imageUrl:
    "https://images.unsplash.com/photo-1589710751893-f9a6770ad71b?ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&q=80&w=687",
  variants: [
    {
      name: "Classic Full Set",
      durationMin: 90,
      price: 65,
      bufferBeforeMin: 10,
      bufferAfterMin: 15,
    },
  ],
  specialistId: b1._id,
});
console.log("Seeded specialists:", b1.name, b2.name);
console.log("Seeded services:", s1.name, s2.name);
await mongoose.disconnect();
process.exit(0);
