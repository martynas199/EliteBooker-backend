import mongoose from "mongoose";
import { startReminderCron } from "../services/reminderService.js";

const mongoOptions = {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  family: 4,
};

function normalizeMongoUri(mongoUri) {
  if (!mongoUri) return null;
  return mongoUri.replace(/^["']|["']$/g, "").trim();
}

export async function connectToDatabase({
  mongoUri = process.env.MONGO_URI,
  logger = console,
  startCron = process.env.NODE_ENV !== "test",
} = {}) {
  const normalizedMongoUri = normalizeMongoUri(mongoUri);

  if (!normalizedMongoUri) {
    throw new Error("MONGO_URI missing");
  }

  logger.log("Connecting to MongoDB...");
  await mongoose.connect(normalizedMongoUri, mongoOptions);
  logger.log("✓ MongoDB connected successfully");

  if (startCron) {
    logger.log("Starting appointment reminder cron job...");
    startReminderCron();
  }

  return mongoose.connection;
}

