import dotenv from "dotenv";

// Load env first
dotenv.config();

// Then import services that depend on env vars
import smsService from "./src/services/smsService.js";

// Test SMS
async function testSMS() {
  console.log("Testing SMS service...");
  console.log("SMS API URL:", process.env.SMS_API_URL);

  const result = await smsService.sendSMS(
    "+447450361893",
    "Test from booking backend!"
  );

  console.log("Result:", result);
}

testSMS();
