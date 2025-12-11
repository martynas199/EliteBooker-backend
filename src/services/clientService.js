import Client from "../models/Client.js";
import TenantClient from "../models/TenantClient.js";
import Appointment from "../models/Appointment.js";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import mongoose from "mongoose";

/**
 * Client Service - Handles global client operations
 */
class ClientService {
  /**
   * Find or create a global client (soft signup)
   * Used when a client makes a booking
   */
  static async findOrCreateClient({ email, name, phone }) {
    email = email.toLowerCase().trim();

    let client = await Client.findOne({ email });

    if (!client) {
      client = await Client.create({
        email,
        name,
        phone,
        authProvider: "email",
        isEmailVerified: false,
        totalBookings: 0,
        memberSince: new Date(),
        lastActivity: new Date(),
        isActive: true,
        dataProcessingConsent: true,
        marketingConsent: false,
      });

      console.log(`[ClientService] Created new global client: ${email}`);
    } else {
      // Update last activity
      client.lastActivity = new Date();
      client.totalBookings += 1;
      await client.save();

      console.log(`[ClientService] Found existing client: ${email}`);
    }

    return client;
  }

  /**
   * Find or create tenant-client relationship
   * Links a global client to a specific business
   */
  static async findOrCreateTenantClient(tenantId, clientId, { name }) {
    let tenantClient = await TenantClient.findOne({
      tenantId,
      clientId,
    });

    if (!tenantClient) {
      tenantClient = await TenantClient.create({
        tenantId,
        clientId,
        displayName: name,
        totalSpend: 0,
        totalVisits: 0,
        firstVisit: new Date(),
        status: "active",
        smsReminders: true,
        emailReminders: true,
        marketingEmails: false,
        loyaltyPoints: 0,
        source: "booking",
      });

      console.log(
        `[ClientService] Created tenant-client relationship: tenant=${tenantId}, client=${clientId}`
      );
    }

    return tenantClient;
  }

  /**
   * Update tenant-client metrics after booking
   */
  static async updateTenantClientMetrics(tenantId, clientId) {
    const bookings = await Appointment.find({
      tenantId,
      clientId,
      status: { $in: ["confirmed", "completed"] },
    });

    const totalSpend = bookings.reduce((sum, b) => sum + (b.price || 0), 0);
    const totalVisits = bookings.length;
    const lastVisit =
      bookings.length > 0
        ? bookings.sort((a, b) => b.start - a.start)[0].start
        : null;

    await TenantClient.findOneAndUpdate(
      { tenantId, clientId },
      {
        $set: {
          totalSpend,
          totalVisits,
          lastVisit,
          lastBookingDate: new Date(),
          averageSpend: totalVisits > 0 ? totalSpend / totalVisits : 0,
          lifetimeValue: totalSpend,
          updatedAt: new Date(),
        },
      }
    );

    console.log(
      `[ClientService] Updated metrics: tenant=${tenantId}, client=${clientId}, visits=${totalVisits}, spend=${totalSpend}`
    );
  }

  /**
   * Create booking with client system
   * Handles both new and existing clients
   */
  static async createBookingWithClient(tenantId, bookingData) {
    const { email, name, phone, serviceId, specialistId, start, end, price } =
      bookingData;

    // Step 1: Find or create global client
    const client = await this.findOrCreateClient({ email, name, phone });

    // Step 2: Find or create tenant-client relationship
    const tenantClient = await this.findOrCreateTenantClient(
      tenantId,
      client._id,
      { name }
    );

    // Step 3: Create appointment
    const appointment = await Appointment.create({
      tenantId,
      clientId: client._id,
      client: {
        name,
        email,
        phone,
      },
      serviceId,
      specialistId,
      start,
      end,
      price,
      status: "confirmed",
    });

    // Step 4: Update metrics
    await this.updateTenantClientMetrics(tenantId, client._id);

    return {
      appointment,
      client,
      tenantClient,
      isNewClient: tenantClient.totalVisits === 0,
    };
  }

  /**
   * Get all clients for a specific tenant (business)
   */
  static async getClientsForTenant(tenantId, options = {}) {
    const {
      status,
      search,
      sortBy = "lastVisit",
      order = "desc",
      limit = 100,
      skip = 0,
    } = options;

    const filter = { tenantId };
    if (status) filter.status = status;

    let query = TenantClient.find(filter)
      .populate("clientId", "name email phone memberSince isActive")
      .sort({ [sortBy]: order === "desc" ? -1 : 1 })
      .limit(limit)
      .skip(skip);

    // Handle search
    if (search) {
      const clients = await Client.find({
        $or: [
          { name: new RegExp(search, "i") },
          { email: new RegExp(search, "i") },
          { phone: new RegExp(search, "i") },
        ],
      });
      const clientIds = clients.map((c) => c._id);
      query = query.where("clientId").in(clientIds);
    }

    const tenantClients = await query;
    const total = await TenantClient.countDocuments(filter);

    return {
      clients: tenantClients,
      total,
      hasMore: skip + tenantClients.length < total,
    };
  }

  /**
   * Get client details for a specific tenant
   */
  static async getClientDetailsForTenant(tenantId, clientId) {
    // Get tenant-client relationship
    const tenantClient = await TenantClient.findOne({
      tenantId,
      clientId,
    }).populate("clientId");

    if (!tenantClient) {
      return null;
    }

    // Get booking history for THIS tenant only
    const appointments = await Appointment.find({ tenantId, clientId })
      .populate("serviceId")
      .populate("specialistId")
      .sort({ start: -1 });

    return {
      client: tenantClient.clientId,
      relationship: tenantClient,
      bookings: appointments,
    };
  }

  /**
   * Update tenant-client relationship data
   */
  static async updateTenantClient(tenantId, clientId, updates) {
    const allowedFields = [
      "displayName",
      "internalNotes",
      "tags",
      "status",
      "smsReminders",
      "emailReminders",
      "marketingEmails",
      "preferredSpecialist",
      "preferredServices",
    ];

    const filteredUpdates = Object.keys(updates)
      .filter((key) => allowedFields.includes(key))
      .reduce((obj, key) => {
        obj[key] = updates[key];
        return obj;
      }, {});

    const tenantClient = await TenantClient.findOneAndUpdate(
      { tenantId, clientId },
      { $set: { ...filteredUpdates, updatedAt: new Date() } },
      { new: true }
    ).populate("clientId");

    return tenantClient;
  }

  /**
   * Block a client for a specific tenant
   */
  static async blockClient(tenantId, clientId, reason, blockedByAdminId) {
    const tenantClient = await TenantClient.findOneAndUpdate(
      { tenantId, clientId },
      {
        $set: {
          status: "blocked",
          isBlocked: true,
          blockReason: reason,
          blockedAt: new Date(),
          blockedBy: blockedByAdminId,
        },
      },
      { new: true }
    );

    return tenantClient;
  }

  /**
   * Unblock a client for a specific tenant
   */
  static async unblockClient(tenantId, clientId) {
    const tenantClient = await TenantClient.findOneAndUpdate(
      { tenantId, clientId },
      {
        $set: {
          status: "active",
          isBlocked: false,
          blockReason: null,
          blockedAt: null,
          blockedBy: null,
        },
      },
      { new: true }
    );

    return tenantClient;
  }

  /**
   * Register a client with password (upgrade from soft signup)
   */
  static async registerClient({ email, password, name, phone }) {
    email = email.toLowerCase().trim();

    // Check if client exists
    let client = await Client.findOne({ email }).select("+password");

    if (client && client.password) {
      throw new Error("Email already registered");
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    if (client) {
      // Upgrade existing client to full account
      client.password = hashedPassword;
      client.name = name || client.name;
      client.phone = phone || client.phone;
      client.isEmailVerified = false;
      await client.save();
    } else {
      // Create new client
      client = await Client.create({
        email,
        password: hashedPassword,
        name,
        phone,
        authProvider: "email",
        memberSince: new Date(),
        isActive: true,
        dataProcessingConsent: true,
      });
    }

    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString("hex");
    client.verificationToken = crypto
      .createHash("sha256")
      .update(verificationToken)
      .digest("hex");
    client.verificationTokenExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
    await client.save();

    return {
      client,
      verificationToken,
    };
  }

  /**
   * Login client
   */
  static async loginClient(email, password) {
    email = email.toLowerCase().trim();

    const client = await Client.findOne({ email }).select("+password");

    if (!client || !client.password) {
      throw new Error("Invalid credentials");
    }

    const isValidPassword = await bcrypt.compare(password, client.password);

    if (!isValidPassword) {
      throw new Error("Invalid credentials");
    }

    if (!client.isActive) {
      throw new Error("Account is suspended");
    }

    // Update last activity
    client.lastActivity = new Date();
    await client.save();

    return client;
  }

  /**
   * Get client's global profile (all businesses)
   */
  static async getClientGlobalProfile(clientId) {
    const client = await Client.findById(clientId);

    if (!client) {
      throw new Error("Client not found");
    }

    // Get all business relationships
    const tenantRelationships = await TenantClient.find({ clientId }).populate(
      "tenantId",
      "name slug branding"
    );

    // Get all bookings across all businesses - use collection.find to bypass tenant filtering
    // Convert clientId to ObjectId for MongoDB query
    console.log(
      `[ClientService] Fetching appointments for clientId: ${clientId}`
    );
    const appointmentDocs = await Appointment.collection
      .find({ clientId: new mongoose.Types.ObjectId(clientId) })
      .sort({ start: -1 })
      .toArray();

    console.log(
      `[ClientService] Found ${appointmentDocs.length} appointment documents`
    );

    // Manually populate the appointments
    const allAppointments = await Promise.all(
      appointmentDocs.map(async (doc) => {
        const appt = await Appointment.hydrate(doc);
        await appt.populate("tenantId", "name slug");
        await appt.populate("serviceId");
        await appt.populate("specialistId");
        return appt;
      })
    );

    console.log(
      `[ClientService] Populated ${allAppointments.length} appointments`
    );

    return {
      profile: {
        name: client.name,
        email: client.email,
        phone: client.phone,
        memberSince: client.memberSince,
        totalBookings: client.totalBookings,
        preferredLanguage: client.preferredLanguage,
        preferredCurrency: client.preferredCurrency,
      },
      businesses: tenantRelationships.map((tr) => ({
        tenant: {
          _id: tr.tenantId._id,
          name: tr.tenantId.name,
          slug: tr.tenantId.slug,
          logo: tr.tenantId.branding?.logo,
        },
        stats: {
          totalSpent: tr.totalSpend,
          totalVisits: tr.totalVisits,
          lastVisit: tr.lastVisit,
          loyaltyPoints: tr.loyaltyPoints,
          status: tr.status,
          membershipTier: tr.membershipTier,
        },
      })),
      bookings: allAppointments,
    };
  }

  /**
   * GDPR: Export all client data
   */
  static async exportClientData(clientId) {
    const client = await Client.findById(clientId);
    const tenantRelationships = await TenantClient.find({ clientId }).populate(
      "tenantId"
    );
    const appointments = await Appointment.find({ clientId }).populate([
      "serviceId",
      "specialistId",
      "tenantId",
    ]);

    return {
      personalData: client.toJSON(),
      businessRelationships: tenantRelationships,
      bookingHistory: appointments,
      exportedAt: new Date(),
    };
  }

  /**
   * GDPR: Delete all client data
   */
  static async deleteClientData(clientId) {
    // Delete all tenant relationships
    await TenantClient.deleteMany({ clientId });

    // Anonymize appointments (keep for business records)
    await Appointment.updateMany(
      { clientId },
      {
        $set: {
          "client.name": "[Deleted User]",
          "client.email": "[deleted]",
          "client.phone": "[deleted]",
          clientId: null,
        },
      }
    );

    // Delete global client
    await Client.deleteOne({ _id: clientId });

    console.log(`[ClientService] Deleted all data for client: ${clientId}`);
  }

  /**
   * Client segmentation for a tenant
   */
  static async segmentClients(tenantId) {
    const now = new Date();
    const ninetyDaysAgo = new Date(now - 90 * 24 * 60 * 60 * 1000);

    const [vipClients, atRiskClients, newClients, activeClients] =
      await Promise.all([
        // VIP: High spend and frequent visits
        TenantClient.find({
          tenantId,
          totalSpend: { $gte: 500 },
          totalVisits: { $gte: 10 },
        }).populate("clientId"),

        // At Risk: Haven't visited in 90+ days but have history
        TenantClient.find({
          tenantId,
          lastVisit: { $lte: ninetyDaysAgo },
          totalVisits: { $gte: 3 },
        }).populate("clientId"),

        // New: 1 visit or less
        TenantClient.find({
          tenantId,
          totalVisits: { $lte: 1 },
        }).populate("clientId"),

        // Active: Visited in last 90 days
        TenantClient.find({
          tenantId,
          lastVisit: { $gte: ninetyDaysAgo },
        }).populate("clientId"),
      ]);

    return {
      vip: vipClients,
      atRisk: atRiskClients,
      new: newClients,
      active: activeClients,
    };
  }
}

export default ClientService;
