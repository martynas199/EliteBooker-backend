/**
 * Referral Controller
 * Handles business logic for referral system
 */

import ReferralCode from "../models/ReferralCode.js";
import Referral from "../models/Referral.js";
import {
  isValidFormat,
  normalizeCode,
} from "../utils/referralCodeGenerator.js";

/**
 * Generate or get existing referral code for authenticated user
 * POST /api/referrals/generate
 * Works for both Clients and Tenants
 */
async function generateReferralCode(req, res) {
  try {
    // Determine owner based on userType (set by universalAuth middleware)
    const ownerId = req.client ? req.client._id : req.admin?.tenantId;
    const ownerType = req.userType; // "Client" or "Tenant"

    if (!ownerId || !ownerType) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
      });
    }

    // Create or get existing code for this owner
    const referralCode = await ReferralCode.createForOwner(ownerId, ownerType);

    const referralLink = `${process.env.FRONTEND_URL || "https://www.elitebooker.co.uk"}/signup?ref=${referralCode.code}`;

    return res.status(201).json({
      success: true,
      data: {
        code: referralCode.code,
        referralLink,
        createdAt: referralCode.createdAt,
      },
    });
  } catch (error) {
    console.error("Generate referral code error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to generate referral code",
    });
  }
}

/**
 * Get authenticated user's referral code
 * GET /api/referrals/my-code
 * Works for both Clients and Tenants
 */
async function getMyCode(req, res) {
  try {
    const ownerId = req.client ? req.client._id : req.admin?.tenantId;
    const ownerType = req.userType;

    if (!ownerId || !ownerType) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
      });
    }

    // Find existing code
    let referralCode = await ReferralCode.findByOwner(ownerId, ownerType);

    // Create if doesn't exist
    if (!referralCode) {
      referralCode = await ReferralCode.createForOwner(ownerId, ownerType);
    }

    const referralLink = `${process.env.FRONTEND_URL || "https://www.elitebooker.co.uk"}/signup?ref=${referralCode.code}`;

    return res.json({
      success: true,
      data: {
        code: referralCode.code,
        referralLink,
        createdAt: referralCode.createdAt,
      },
    });
  } catch (error) {
    console.error("Get my code error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve referral code",
    });
  }
}

/**
 * Get referral dashboard data for authenticated user
 * GET /api/referrals/dashboard
 * Works for both Clients and Tenants
 */
async function getDashboard(req, res) {
  try {
    const ownerId = req.client ? req.client._id : req.admin?.tenantId;
    const ownerType = req.userType;
    const { page = 1, limit = 50 } = req.query;

    if (!ownerId || !ownerType) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
      });
    }

    // Get user's referral code
    const referralCode = await ReferralCode.findByOwner(ownerId, ownerType);

    if (!referralCode) {
      return res.json({
        success: true,
        data: {
          hasCode: false,
          message: "No referral code yet. Generate one to start referring!",
        },
      });
    }

    // Get stats
    const stats = await referralCode.getStats();

    // Get referrals with pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const { referrals, total } = await Referral.getDashboardData(
      referralCode._id,
      parseInt(limit),
      offset,
    );

    const referralLink = `${process.env.FRONTEND_URL || "https://www.elitebooker.co.uk"}/signup?ref=${referralCode.code}`;

    return res.json({
      success: true,
      data: {
        hasCode: true,
        code: referralCode.code,
        referralLink,
        stats: {
          totalReferrals: stats.totalReferrals || 0,
          activeReferrals: stats.activeReferrals || 0,
          pendingReferrals: stats.pendingReferrals || 0,
          churnedReferrals: stats.churnedReferrals || 0,
          totalRewards: stats.totalRewards || 0,
          paidRewards: stats.paidRewards || 0,
          pendingRewards: stats.pendingRewards || 0,
        },
        referrals: referrals.map((ref) => ({
          id: ref._id,
          businessName:
            ref.referredBusinessId?.name || ref.referredBusinessName,
          businessEmail:
            ref.referredBusinessId?.email || ref.referredBusinessEmail,
          businessSlug: ref.referredBusinessId?.slug,
          signupDate: ref.createdAt,
          firstBookingDate: ref.firstBookingAt,
          status: ref.status,
          rewardStatus: ref.rewardStatus,
          rewardAmount: ref.rewardAmount || 0,
        })),
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    console.error("Get dashboard error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to load dashboard data",
    });
  }
}

/**
 * Validate a referral code
 * POST /api/referrals/validate/:code
 */
async function validateCode(req, res) {
  try {
    const { code } = req.params;

    if (!code) {
      return res.status(400).json({
        success: false,
        error: "Referral code is required",
      });
    }

    const normalizedCode = normalizeCode(code);

    // Check format
    if (!isValidFormat(normalizedCode)) {
      return res.status(400).json({
        success: false,
        valid: false,
        error: "Invalid code format",
      });
    }

    // Find code in database with dynamic population based on ownerType
    const referralCode = await ReferralCode.findOne({
      code: normalizedCode,
      isActive: true,
    }).populate("ownerId", "name email");

    if (!referralCode) {
      return res.status(404).json({
        success: false,
        valid: false,
        error: "Referral code not found",
      });
    }

    // Prevent self-referral (if user is authenticated)
    if (req.admin && req.admin.tenantId) {
      if (
        referralCode.ownerType === "Tenant" &&
        req.admin.tenantId.toString() === referralCode.ownerId._id.toString()
      ) {
        return res.status(400).json({
          success: false,
          valid: false,
          error: "Cannot use your own referral code",
        });
      }
    }

    return res.json({
      success: true,
      valid: true,
      data: {
        code: referralCode.code,
        ownerName: referralCode.ownerId?.name,
        ownerType: referralCode.ownerType,
      },
    });
  } catch (error) {
    console.error("Validate code error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to validate referral code",
    });
  }
}

/**
 * Get detailed referral stats (for admin or advanced users)
 * GET /api/referrals/stats
 * Works for both Clients and Tenants
 */
async function getStats(req, res) {
  try {
    const ownerId = req.client ? req.client._id : req.admin?.tenantId;
    const ownerType = req.userType;

    if (!ownerId || !ownerType) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
      });
    }

    const referralCode = await ReferralCode.findByOwner(ownerId, ownerType);

    if (!referralCode) {
      return res.json({
        success: true,
        data: {
          hasCode: false,
        },
      });
    }

    const stats = await referralCode.getStats();
    const referrals = await Referral.findByReferralCode(referralCode._id);

    // Calculate additional metrics
    const signupsByMonth = {};
    const statusBreakdown = {
      pending: 0,
      active: 0,
      churned: 0,
    };

    referrals.forEach((ref) => {
      // Monthly signups
      const month = new Date(ref.createdAt).toISOString().substring(0, 7);
      signupsByMonth[month] = (signupsByMonth[month] || 0) + 1;

      // Status breakdown
      statusBreakdown[ref.status] = (statusBreakdown[ref.status] || 0) + 1;
    });

    return res.json({
      success: true,
      data: {
        hasCode: true,
        code: referralCode.code,
        totalStats: {
          totalReferrals: stats.totalReferrals || 0,
          activeReferrals: stats.activeReferrals || 0,
          pendingReferrals: stats.pendingReferrals || 0,
          churnedReferrals: stats.churnedReferrals || 0,
          totalRewards: stats.totalRewards || 0,
          paidRewards: stats.paidRewards || 0,
          pendingRewards: stats.pendingRewards || 0,
        },
        signupsByMonth,
        statusBreakdown,
        conversionRate:
          stats.totalReferrals > 0
            ? ((stats.activeReferrals / stats.totalReferrals) * 100).toFixed(2)
            : 0,
      },
    });
  } catch (error) {
    console.error("Get stats error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to load statistics",
    });
  }
}

/**
 * Get top referrers leaderboard (admin only)
 * GET /api/referrals/leaderboard
 */
async function getLeaderboard(req, res) {
  try {
    const { limit = 10 } = req.query;

    const topReferrers = await Referral.getTopReferrers(parseInt(limit));

    return res.json({
      success: true,
      data: {
        leaderboard: topReferrers.map((ref, index) => ({
          rank: index + 1,
          code: ref.code,
          ownerName: ref.ownerName,
          ownerType: ref.ownerType,
          totalReferrals: ref.totalReferrals || 0,
          activeReferrals: ref.activeReferrals || 0,
          totalRewards: ref.totalRewards || 0,
        })),
      },
    });
  } catch (error) {
    console.error("Get leaderboard error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to load leaderboard",
    });
  }
}

export {
  generateReferralCode,
  getMyCode,
  getDashboard,
  validateCode,
  getStats,
  getLeaderboard,
};
