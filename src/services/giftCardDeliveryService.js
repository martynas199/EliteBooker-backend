import cron from "node-cron";
import GiftCard from "../models/GiftCard.js";
import {
  sendGiftCardToRecipient,
  sendGiftCardSaleNotification,
  sendGiftCardPurchaseConfirmation,
} from "../emails/giftCardMailer.js";
import { createConsoleLogger } from "../utils/logger.js";

const LOG_GIFT_DELIVERY =
  process.env.LOG_GIFT_DELIVERY === "true" ||
  process.env.LOG_VERBOSE === "true";
const console = createConsoleLogger({
  scope: "gift-card-delivery",
  verbose: LOG_GIFT_DELIVERY,
});

async function processScheduledGiftCardDeliveries() {
  const now = new Date();

  try {
    const dueGiftCards = await GiftCard.find({
      status: { $in: ["sent", "redeemed"] },
      deliveryType: "scheduled",
      deliveryDate: { $lte: now },
      recipientEmailSentAt: { $exists: false },
    })
      .select(
        "_id code recipientEmail deliveryDate purchaseConfirmationSentAt saleNotificationSentAt recipientEmailSentAt",
      )
      .sort({ deliveryDate: 1 })
      .limit(100)
      .lean();

    if (dueGiftCards.length === 0) return;

    console.log(
      `[GiftCardDelivery] Processing ${dueGiftCards.length} scheduled gift card deliveries`,
    );

    for (const card of dueGiftCards) {
      try {
        const giftCard = await GiftCard.findById(card._id)
          .populate("tenantId")
          .populate("specialistId");

        if (!giftCard || giftCard.recipientEmailSentAt) continue;

        const tenant = giftCard.tenantId;
        const specialist = giftCard.specialistId;
        const updates = {};

        if (!giftCard.purchaseConfirmationSentAt) {
          await sendGiftCardPurchaseConfirmation({
            giftCard,
            tenant,
            specialist,
          });
          updates.purchaseConfirmationSentAt = new Date();
        }

        if (!giftCard.saleNotificationSentAt) {
          await sendGiftCardSaleNotification({
            giftCard,
            tenant,
            specialist,
          });
          updates.saleNotificationSentAt = new Date();
        }

        await sendGiftCardToRecipient({
          giftCard,
          tenant,
          specialist,
        });
        updates.recipientEmailSentAt = new Date();

        await GiftCard.updateOne({ _id: giftCard._id }, { $set: updates });

        console.log(
          `[GiftCardDelivery] Delivered scheduled gift card ${giftCard.code} to ${giftCard.recipientEmail}`,
        );
      } catch (error) {
        console.error(
          `[GiftCardDelivery] Failed scheduled delivery for gift card ${card._id}:`,
          error,
        );
      }
    }
  } catch (error) {
    console.error("[GiftCardDelivery] Cron processing error:", error);
  }
}

export function startGiftCardDeliveryCron() {
  console.log(
    "[GiftCardDelivery] Starting gift card delivery cron (every 5 minutes)...",
  );

  const cronJob = cron.schedule(
    "*/5 * * * *",
    processScheduledGiftCardDeliveries,
    {
      scheduled: true,
      timezone: "Europe/London",
    },
  );

  return cronJob;
}

export async function triggerGiftCardDeliveryManually() {
  await processScheduledGiftCardDeliveries();
}

export default {
  startGiftCardDeliveryCron,
  triggerGiftCardDeliveryManually,
};
