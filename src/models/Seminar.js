import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    unique: true,
  },
  date: {
    type: Date,
    required: true,
  },
  startTime: {
    type: String,
    required: true,
  },
  endTime: {
    type: String,
    required: true,
  },
  maxAttendees: {
    type: Number,
    required: true,
    min: 1,
  },
  currentAttendees: {
    type: Number,
    default: 0,
    min: 0,
  },
  status: {
    type: String,
    enum: ["scheduled", "full", "cancelled", "completed"],
    default: "scheduled",
  },
});

const seminarSchema = new mongoose.Schema(
  {
    specialistId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Specialist",
      required: true,
      index: true,
    },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    shortDescription: {
      type: String,
      required: true,
      maxlength: 150,
    },
    images: {
      main: {
        url: String,
        publicId: String,
      },
      gallery: [
        {
          url: String,
          publicId: String,
        },
      ],
    },
    category: {
      type: String,
      enum: [
        "Makeup",
        "Hair Styling",
        "Nails",
        "Skin Care",
        "Business",
        "Marketing",
        "Other",
      ],
      default: "Other",
    },
    level: {
      type: String,
      enum: ["Beginner", "Intermediate", "Advanced", "All Levels"],
      default: "All Levels",
    },
    pricing: {
      price: {
        type: Number,
        required: true,
        min: 0,
      },
      currency: {
        type: String,
        default: "GBP",
      },
      earlyBirdPrice: {
        type: Number,
        min: 0,
      },
      earlyBirdDeadline: {
        type: Date,
      },
    },
    location: {
      type: {
        type: String,
        enum: ["physical", "virtual"],
        required: true,
      },
      address: String,
      city: String,
      postcode: String,
      meetingLink: String,
      instructions: String,
    },
    sessions: [sessionSchema],
    requirements: [String],
    whatYouWillLearn: [String],
    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "draft",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for performance
seminarSchema.index({ specialistId: 1, status: 1 });
seminarSchema.index({ tenantId: 1, status: 1 });
seminarSchema.index({ slug: 1 });
seminarSchema.index({ "sessions.date": 1 });

// Generate slug from title before saving
seminarSchema.pre("save", function (next) {
  if (this.isModified("title") && !this.slug) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }
  next();
});

// Update session status based on attendees
seminarSchema.methods.updateSessionStatus = function (sessionId) {
  const session = this.sessions.id(sessionId);
  if (!session) return;

  if (session.currentAttendees >= session.maxAttendees) {
    session.status = "full";
  } else if (session.status === "full") {
    session.status = "scheduled";
  }
};

// Get active price (early bird if applicable)
seminarSchema.methods.getActivePrice = function () {
  if (
    this.pricing.earlyBirdPrice &&
    this.pricing.earlyBirdDeadline &&
    new Date() < this.pricing.earlyBirdDeadline
  ) {
    return this.pricing.earlyBirdPrice;
  }
  return this.pricing.price;
};

// Check if session is bookable
seminarSchema.methods.isSessionBookable = function (sessionId) {
  // Find by either _id or sessionId field
  const session =
    this.sessions.id(sessionId) ||
    this.sessions.find((s) => s.sessionId === sessionId);
  if (!session) return false;

  return (
    this.status === "published" &&
    session.status === "scheduled" &&
    session.currentAttendees < session.maxAttendees &&
    new Date(session.date) > new Date()
  );
};

const Seminar = mongoose.model("Seminar", seminarSchema);

export default Seminar;
