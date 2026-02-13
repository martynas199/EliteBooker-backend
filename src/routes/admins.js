import express from "express";
import Admin from "../models/Admin.js";
import AuditLog from "../models/AuditLog.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { getDefaultFromEmail, sendEmail } from "../emails/transport.js";

const router = express.Router();

// Email helper function
async function sendAccountUnlockedEmail(admin) {
  try {
    const from = getDefaultFromEmail();

    const result = await sendEmail({
      from,
      to: admin.email,
      subject: "Your Account Has Been Unlocked",
      text: `Hello ${admin.name},

Your administrator account has been unlocked by a super administrator.

You can now log in to your account.

If you did not request this unlock or have concerns about your account security, please contact support immediately.

Best regards,
Elite Booker

---
This is an automated message. Please do not reply to this email.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #10b981; border-bottom: 2px solid #10b981; padding-bottom: 10px;">🔓 Account Unlocked</h2>
          <p>Hello <strong>${admin.name}</strong>,</p>
          <p>Your administrator account has been unlocked by a super administrator.</p>
          
          <div style="background-color: #ecfdf5; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
            <p style="margin: 0; color: #065f46; font-weight: 600;">✓ You can now log in to your account</p>
          </div>
          
          <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
            If you did not request this unlock or have concerns about your account security, 
            please contact support immediately.
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          <div style="margin-top: 40px; text-align: center;">
            <p style="margin: 0; color: #9333ea; font-weight: bold;">Elite Booker</p>
            <p style="color: #999; font-size: 12px; margin-top: 10px;">
              This is an automated message. Please do not reply to this email.
            </p>
          </div>
        </div>
      `,
      loggerPrefix: "[MAILER]",
    });

    if (result?.skipped) {
      console.warn(
        "[MAILER] SMTP not configured - skipping unlock notification email"
      );
      return;
    }

    console.log(
      "[MAILER] ✓ Account unlocked email sent successfully to:",
      admin.email
    );
  } catch (error) {
    console.error(
      "[MAILER] ✗ Failed to send unlock notification email:",
      error
    );
    // Don't throw - email failure shouldn't fail the unlock
  }
}

// Get all admins (requires authentication)
router.get("/", requireAdmin, async (req, res) => {
  try {
    // Don't use .lean() so toJSON() is called and isLocked is computed
    const admins = await Admin.find().select("-password");
    res.json(admins);
  } catch (error) {
    console.error("Error fetching admins:", error);
    res.status(500).json({ error: "Failed to fetch admins" });
  }
});

// Create new admin (requires authentication)
router.post("/", requireAdmin, async (req, res) => {
  try {
    const { email, password, name, role, specialistId } = req.body;

    // Validate required fields
    if (!email || !password || !name) {
      return res.status(400).json({
        error: "Email, password, and name are required",
      });
    }

    // Validate password length
    if (password.length < 8) {
      return res.status(400).json({
        error: "Password must be at least 8 characters long",
      });
    }

    // Check if admin with this email already exists
    const existingAdmin = await Admin.findOne({ email: email.toLowerCase() });
    if (existingAdmin) {
      return res.status(409).json({
        error: "An admin with this email already exists",
      });
    }

    // Create new admin
    const newAdmin = new Admin({
      email: email.toLowerCase(),
      password, // Will be hashed by the pre-save hook
      name,
      role: role || "admin",
      specialistId: specialistId || null,
      active: true,
    });

    await newAdmin.save();

    // Return new admin without password
    const adminResponse = await Admin.findById(newAdmin._id)
      .select("-password")
      .lean();

    res.status(201).json({
      message: "Admin created successfully",
      admin: adminResponse,
    });
  } catch (error) {
    console.error("Error creating admin:", error);

    // Handle validation errors
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({ error: messages.join(", ") });
    }

    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(409).json({
        error: "An admin with this email already exists",
      });
    }

    res.status(500).json({ error: "Failed to create admin" });
  }
});

// Link or unlink admin to specialist (requires authentication)
router.patch("/:adminId/link-specialist", requireAdmin, async (req, res) => {
  try {
    const { adminId } = req.params;
    const { specialistId } = req.body;

    // Find the admin
    const admin = await Admin.findById(adminId);
    if (!admin) {
      return res.status(404).json({ error: "Admin not found" });
    }

    // Update the specialist link
    admin.specialistId = specialistId || null;
    await admin.save();

    // Return updated admin without password
    const updatedAdmin = await Admin.findById(adminId)
      .select("-password")
      .lean();

    res.json({
      message: specialistId
        ? "Admin successfully linked to specialist"
        : "Admin successfully unlinked from specialist",
      admin: updatedAdmin,
    });
  } catch (error) {
    console.error("Error linking admin to specialist:", error);
    res.status(500).json({ error: "Failed to link admin to specialist" });
  }
});

// Get specific admin by ID (requires authentication)
router.get("/:adminId", requireAdmin, async (req, res) => {
  try {
    const { adminId } = req.params;
    const admin = await Admin.findById(adminId).select("-password").lean();

    if (!admin) {
      return res.status(404).json({ error: "Admin not found" });
    }

    res.json(admin);
  } catch (error) {
    console.error("Error fetching admin:", error);
    res.status(500).json({ error: "Failed to fetch admin" });
  }
});

// Delete admin (requires super_admin role)
router.delete("/:adminId", requireAdmin, async (req, res) => {
  try {
    const { adminId } = req.params;

    // Only super_admin can delete admins
    if (req.admin.role !== "super_admin") {
      return res.status(403).json({
        error: "Only super admins can delete admin accounts",
      });
    }

    // Prevent deleting yourself
    if (req.admin._id.toString() === adminId) {
      return res.status(400).json({
        error: "You cannot delete your own account",
      });
    }

    // Find the admin
    const admin = await Admin.findById(adminId);
    if (!admin) {
      return res.status(404).json({ error: "Admin not found" });
    }

    // Delete the admin
    await Admin.findByIdAndDelete(adminId);

    res.json({
      message: "Admin deleted successfully",
      deletedAdmin: {
        _id: admin._id,
        name: admin.name,
        email: admin.email,
      },
    });
  } catch (error) {
    console.error("Error deleting admin:", error);
    res.status(500).json({ error: "Failed to delete admin" });
  }
});

// Unlock admin account (requires super_admin role)
router.post("/:adminId/unlock", requireAdmin, async (req, res) => {
  try {
    const { adminId } = req.params;

    // Only super_admin can unlock accounts
    if (req.admin.role !== "super_admin") {
      return res.status(403).json({
        error: "Only super admins can unlock accounts",
      });
    }

    // Find the admin
    const admin = await Admin.findById(adminId);
    if (!admin) {
      return res.status(404).json({ error: "Admin not found" });
    }

    // Check if account is actually locked
    if (!admin.isLocked()) {
      return res.status(400).json({
        error: "Account is not locked",
      });
    }

    // Unlock the account
    admin.loginAttempts = 0;
    admin.lockUntil = undefined;
    await admin.save();

    // Log the unlock action
    try {
      await AuditLog.create({
        action: "account_unlocked",
        performedBy: req.admin._id,
        targetUser: admin._id,
        details: {
          adminName: admin.name,
          adminEmail: admin.email,
          unlockedBy: req.admin.name,
        },
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      });
    } catch (logError) {
      console.error("Error creating audit log:", logError);
      // Don't fail the unlock if logging fails
    }

    // Send email notification to the unlocked admin
    try {
      await sendAccountUnlockedEmail(admin);
    } catch (emailError) {
      console.error("Error sending unlock notification email:", emailError);
      // Don't fail the unlock if email fails
    }

    res.json({
      success: true,
      message: "Account unlocked successfully",
      admin: {
        _id: admin._id,
        name: admin.name,
        email: admin.email,
        isLocked: false,
      },
    });
  } catch (error) {
    console.error("Error unlocking admin:", error);
    res.status(500).json({ error: "Failed to unlock account" });
  }
});

export default router;
