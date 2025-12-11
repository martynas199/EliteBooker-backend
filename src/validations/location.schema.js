import { z } from "zod";

// Address schema
const addressSchema = z.object({
  street: z.string().optional().default(""),
  city: z.string().optional().default(""),
  postalCode: z.string().optional().default(""),
  country: z.string().optional().default("United Kingdom"),
  coordinates: z
    .object({
      lat: z.number().min(-90).max(90).optional(),
      lng: z.number().min(-180).max(180).optional(),
    })
    .optional(),
});

// Working hours schema
const workingHoursSchema = z.object({
  dayOfWeek: z.number().min(0).max(6),
  start: z
    .string()
    .regex(
      /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/,
      "Invalid time format. Use HH:MM"
    ),
  end: z
    .string()
    .regex(
      /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/,
      "Invalid time format. Use HH:MM"
    ),
});

// Image schema
const imageSchema = z.object({
  url: z.string().url(),
  publicId: z.string().optional(),
  provider: z.enum(["cloudinary", "url"]).default("url"),
});

// Settings schema
const settingsSchema = z.object({
  images: z.array(imageSchema).optional().default([]),
  amenities: z.array(z.string()).optional().default([]),
  timezone: z.string().optional().default("Europe/London"),
});

// Create location schema
export const createLocationSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name must be less than 100 characters"),
  description: z.string().optional().default(""),
  address: addressSchema.optional(),
  phone: z.string().optional().default(""),
  email: z
    .string()
    .email("Invalid email")
    .optional()
    .or(z.literal(""))
    .default(""),
  workingHours: z.array(workingHoursSchema).optional().default([]),
  settings: settingsSchema.optional(),
  isActive: z.boolean().optional().default(true),
  isPrimary: z.boolean().optional().default(false),
  displayOrder: z.number().int().min(0).optional().default(0),
});

// Update location schema (all fields optional)
export const updateLocationSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  address: addressSchema.optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  workingHours: z.array(workingHoursSchema).optional(),
  settings: settingsSchema.optional(),
  isActive: z.boolean().optional(),
  isPrimary: z.boolean().optional(),
  displayOrder: z.number().int().min(0).optional(),
});

// List locations query schema
export const listLocationsQuerySchema = z.object({
  isActive: z
    .enum(["true", "false"])
    .optional()
    .transform((val) => val === "true"),
  isPrimary: z
    .enum(["true", "false"])
    .optional()
    .transform((val) => val === "true"),
});

// Location ID schema
export const locationIdSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid location ID"),
});

// Validation helper functions
export function validateCreateLocation(data) {
  const result = createLocationSchema.safeParse(data);
  return {
    success: result.success,
    data: result.success ? result.data : null,
    errors: result.success ? [] : result.error.errors,
  };
}

export function validateUpdateLocation(data) {
  const result = updateLocationSchema.safeParse(data);
  return {
    success: result.success,
    data: result.success ? result.data : null,
    errors: result.success ? [] : result.error.errors,
  };
}

export function validateListLocationsQuery(query) {
  const result = listLocationsQuerySchema.safeParse(query);
  return {
    success: result.success,
    data: result.success ? result.data : null,
    errors: result.success ? [] : result.error.errors,
  };
}

export function validateLocationId(params) {
  const result = locationIdSchema.safeParse(params);
  return {
    success: result.success,
    data: result.success ? result.data : null,
    errors: result.success ? [] : result.error.errors,
  };
}
