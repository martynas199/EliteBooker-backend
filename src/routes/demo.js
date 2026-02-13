import express from "express";
import { escapeHtml, getDefaultFromEmail, sendEmail } from "../emails/transport.js";

const router = express.Router();

// POST /api/demo-request - Handle demo request submission
router.post("/", async (req, res) => {
  try {
    const { name, phone } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ error: "Name and phone are required" });
    }

    const safeName = escapeHtml(name);
    const safePhone = escapeHtml(phone);

    // Email content
    const result = await sendEmail({
      from: getDefaultFromEmail(),
      to: "martynas.20@hotmail.com",
      subject: "New Demo Request - Elite Booker",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4F46E5;">New Demo Request</h2>
          <p>Someone has requested a demo of Elite Booker:</p>
          
          <div style="background-color: #F3F4F6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 10px 0;"><strong>Name:</strong> ${safeName}</p>
            <p style="margin: 10px 0;"><strong>Phone:</strong> ${safePhone}</p>
          </div>
          
          <p style="color: #6B7280; font-size: 14px;">
            Received on ${new Date().toLocaleString("en-GB", {
              dateStyle: "full",
              timeStyle: "short",
            })}
          </p>
        </div>
      `,
      loggerPrefix: "[DEMO]",
    });

    if (result?.skipped) {
      return res.status(500).json({ error: "Email service not configured" });
    }

    res.json({ message: "Demo request sent successfully" });
  } catch (error) {
    console.error("Error sending demo request email:", error);
    res.status(500).json({ error: "Failed to send demo request" });
  }
});

export default router;
