import { z } from "zod";

// Working hours schema for beautician schedule
const workingHoursSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6), // 0 = Sunday, 6 = Saturday
  start: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid time format (HH:mm)"),
  end: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid time format (HH:mm)"),
});

// Custom schedule time slot (no dayOfWeek since it's keyed by date)
const customScheduleSlotSchema = z.object({
  start: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid time format (HH:mm)"),
  end: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid time format (HH:mm)"),
});

// Custom schedule schema - object with date keys (YYYY-MM-DD) mapped to arrays of time slots
const customScheduleSchema = z
  .record(
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)"),
    z.array(customScheduleSlotSchema)
  )
  .optional();

// Time off period schema
const timeOffSchema = z.object({
  start: z.string().datetime("Invalid start datetime"),
  end: z.string().datetime("Invalid end datetime"),
  reason: z.string().max(500).optional(),
});

// Image schema for beautician profile
// Allow null or a valid complete image object
const imageSchema = z
  .union([
    z.null(),
    z.object({
      provider: z.string().min(1, "Provider is required"),
      id: z.string().min(1, "Image ID is required"),
      url: z.string().url("Invalid image URL"),
      alt: z.string().optional(),
      width: z.number().positive().optional(),
      height: z.number().positive().optional(),
    }),
  ])
  .optional();

// Base beautician schema (common fields)
const baseBeauticianSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  email: z.string().email("Invalid email").optional(),
  phone: z.string().max(50).optional(),
  bio: z.string().max(2000).optional(),
  specialties: z.array(z.string().max(100)).optional(),
  image: imageSchema,
  workingHours: z.array(workingHoursSchema).optional(),
  customSchedule: customScheduleSchema,
  timeOff: z.array(timeOffSchema).optional(),
  active: z.boolean().default(true),
  inSalonPayment: z.boolean().optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Invalid hex color")
    .optional(),
});

// Create beautician schema (POST)
export const createBeauticianSchema = baseBeauticianSchema;

// Update beautician schema (PATCH) - all fields optional
export const updateBeauticianSchema = baseBeauticianSchema.partial();

// Query params schema for list endpoint
export const listBeauticiansQuerySchema = z.object({
  active: z.enum(["true", "false", "all"]).optional(),
  serviceId: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/)
    .optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).optional(),
  skip: z.string().regex(/^\d+$/).transform(Number).optional(),
});

// ID param schema (for :id routes)
export const beauticianIdSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid beautician ID"),
});

/**
 * Validate beautician creation data
 * @param {unknown} data
 * @returns {{ success: true, data: object } | { success: false, errors: array }}
 */
export function validateCreateBeautician(data) {
  try {
    const validated = createBeauticianSchema.parse(data);
    return { success: true, data: validated };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return {
        success: false,
        errors: err.errors.map((e) => ({
          path: e.path.join("."),
          message: e.message,
        })),
      };
    }
    throw err;
  }
}

/**
 * Validate beautician update data
 * @param {unknown} data
 * @returns {{ success: true, data: object } | { success: false, errors: array }}
 */
export function validateUpdateBeautician(data) {
  try {
    const validated = updateBeauticianSchema.parse(data);
    return { success: true, data: validated };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return {
        success: false,
        errors: err.errors.map((e) => ({
          path: e.path.join("."),
          message: e.message,
        })),
      };
    }
    throw err;
  }
}

export default {
  createBeauticianSchema,
  updateBeauticianSchema,
  listBeauticiansQuerySchema,
  beauticianIdSchema,
  validateCreateBeautician,
  validateUpdateBeautician,
};
