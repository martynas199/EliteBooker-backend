import dotenv from "dotenv";
import {
  sendConfirmationEmail,
  sendOrderConfirmationEmail,
} from "../src/emails/mailer.js";
import {
  sendGiftCardPurchaseConfirmation,
  sendGiftCardToRecipient,
  sendGiftCardSaleNotification,
} from "../src/emails/giftCardMailer.js";

dotenv.config();

const args = process.argv.slice(2);
const getArgValue = (name) => {
  const prefix = `${name}=`;
  const match = args.find((arg) => arg.startsWith(prefix));
  if (match) {
    return match.slice(prefix.length);
  }

  const index = args.indexOf(name);
  if (index !== -1 && args[index + 1] && !args[index + 1].startsWith("--")) {
    return args[index + 1];
  }

  return null;
};

const recipient =
  getArgValue("--to") ||
  process.env.TEST_EMAIL_TO ||
  process.env.SMTP_USER ||
  process.env.EMAIL_USER;

const includeCore = args.includes("--all") || args.includes("--include-core");

if (!recipient) {
  console.error("❌ Missing recipient email.");
  console.error(
    "Use --to=you@example.com or set TEST_EMAIL_TO in booking-backend/.env",
  );
  process.exit(1);
}

const now = new Date();
const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

const mockTenant = {
  _id: "67a000000000000000000001",
  name: "Elite Test Studio",
  businessName: "Elite Test Studio",
  slug: "elite-test-studio",
  email: recipient,
};

const mockSpecialist = {
  _id: "67a000000000000000000002",
  name: "Test Specialist",
  email: recipient,
};

const mockGiftCard = {
  _id: "67a000000000000000000003",
  code: "GIFT-TEST-2026",
  amount: 75,
  currency: "GBP",
  purchaserName: "Jordan Test",
  purchaserEmail: recipient,
  recipientName: "Alex Recipient",
  recipientEmail: recipient,
  message: "Enjoy this gift and treat yourself!",
  purchaseDate: now,
  expiryDate: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
};

const mockAppointment = {
  _id: "67a000000000000000000004",
  start: tomorrow,
  status: "confirmed",
  currency: "GBP",
  price: 55,
  variantName: "Signature Brow Lamination",
  client: {
    name: "Jordan Test",
    email: recipient,
    phone: "+447700900000",
  },
  payment: {
    mode: "pay_now",
    status: "succeeded",
  },
};

const mockService = {
  name: "Signature Brow Lamination",
};

const mockOrder = {
  _id: "67a000000000000000000005",
  orderNumber: "TEST-ORDER-1001",
  createdAt: now,
  currency: "GBP",
  subtotal: 29,
  shipping: 3.99,
  total: 32.99,
  items: [
    {
      title: "Hydrating Serum",
      size: "30ml",
      quantity: 1,
      price: 29,
      image: "https://via.placeholder.com/100x100.png?text=Product",
    },
  ],
  shippingAddress: {
    firstName: "Jordan",
    lastName: "Test",
    email: recipient,
    address: "123 Demo Street",
    city: "London",
    postalCode: "E1 6AN",
    country: "United Kingdom",
    phone: "+447700900000",
  },
};

async function run() {
  console.log("\n📨 Sending test emails to:", recipient);
  console.log("========================================");

  await sendGiftCardPurchaseConfirmation({
    giftCard: mockGiftCard,
    tenant: mockTenant,
    specialist: mockSpecialist,
  });
  console.log("✅ Gift Card Purchase Confirmation");

  await sendGiftCardToRecipient({
    giftCard: mockGiftCard,
    tenant: mockTenant,
    specialist: mockSpecialist,
  });
  console.log("✅ Gift Card Recipient Email");

  await sendGiftCardSaleNotification({
    giftCard: mockGiftCard,
    tenant: mockTenant,
    specialist: mockSpecialist,
  });
  console.log("✅ Gift Card Sale Notification");

  if (includeCore) {
    await sendConfirmationEmail({
      appointment: mockAppointment,
      service: mockService,
      specialist: mockSpecialist,
    });
    console.log("✅ Booking Confirmation Email");

    await sendOrderConfirmationEmail({
      order: mockOrder,
    });
    console.log("✅ Order Confirmation Email");
  }

  console.log("========================================");
  console.log("✅ Done. Check your inbox (and spam folder).");
}

run().catch((error) => {
  console.error("❌ Failed to send test emails:", error?.message || error);
  process.exit(1);
});
