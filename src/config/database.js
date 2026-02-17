import mongoose from "mongoose";
import { startReminderCron } from "../services/reminderService.js";
import { startGiftCardDeliveryCron } from "../services/giftCardDeliveryService.js";
import { rootLogger } from "../utils/logger.js";

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
  logger = rootLogger.child({ scope: "database" }).toNodeLogger(),
  startCron = process.env.NODE_ENV !== "test" &&
    process.env.RUN_SCHEDULERS !== "false",
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
    logger.log("Starting scheduled gift card delivery cron job...");
    startGiftCardDeliveryCron();
  } else {
    logger.log("Skipping cron startup (RUN_SCHEDULERS=false or test mode)");
  }

  return mongoose.connection;
}
