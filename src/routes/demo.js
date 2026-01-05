import express from "express";
import nodemailer from "nodemailer";

const router = express.Router();

// POST /api/demo-request - Handle demo request submission
router.post("/", async (req, res) => {
  try {
    const { name, phone } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ error: "Name and phone are required" });
    }

    // Create transporter (reuse existing email configuration from your app)
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: process.env.SMTP_PORT || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    // Email content
    const mailOptions = {
      from: process.env.SMTP_USER,
      to: "martynas.20@hotmail.com",
      subject: "New Demo Request - Elite Booker",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4F46E5;">New Demo Request</h2>
          <p>Someone has requested a demo of Elite Booker:</p>
          
          <div style="background-color: #F3F4F6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 10px 0;"><strong>Name:</strong> ${name}</p>
            <p style="margin: 10px 0;"><strong>Phone:</strong> ${phone}</p>
          </div>
          
          <p style="color: #6B7280; font-size: 14px;">
            Received on ${new Date().toLocaleString("en-GB", {
              dateStyle: "full",
              timeStyle: "short",
            })}
          </p>
        </div>
      `,
    };

    // Send email
    await transporter.sendMail(mailOptions);

    res.json({ message: "Demo request sent successfully" });
  } catch (error) {
    console.error("Error sending demo request email:", error);
    res.status(500).json({ error: "Failed to send demo request" });
  }
});

export default router;
