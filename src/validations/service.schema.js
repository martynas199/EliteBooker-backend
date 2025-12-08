import { z } from "zod";

// Image schema for service images
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

// Gallery image schema (simplified)
const galleryImageSchema = z.object({
  provider: z.string().optional(),
  id: z.string().min(1, "Image ID is required"),
  url: z.string().url("Invalid image URL"),
  alt: z.string().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
});

// Service variant schema
const variantSchema = z.object({
  name: z.string().min(1, "Variant name is required").max(100),
  durationMin: z.number().int().positive("Duration must be positive"),
  price: z.number().positive("Price must be positive"),
  promoPrice: z
    .number()
    .positive("Promo price must be positive")
    .nullable()
    .optional(),
  bufferBeforeMin: z.number().int().nonnegative().default(0),
  bufferAfterMin: z.number().int().nonnegative().default(0),
});

// Base service schema (common fields)
const baseServiceSchema = z.object({
  name: z.string().min(1, "Service name is required").max(200),
  category: z.string().min(1, "Category is required").max(100),
  description: z.string().max(2000).optional(),
  variants: z.array(variantSchema).min(1, "At least one variant is required"),
  primaryBeauticianId: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/, "Invalid specialist ID"),
  additionalBeauticianIds: z
    .array(z.string().regex(/^[0-9a-fA-F]{24}$/))
    .optional(),
  image: imageSchema,
  gallery: z.array(galleryImageSchema).optional(),
  active: z.boolean().default(true),
  priceVaries: z.boolean().default(false),
  promoPrice: z
    .number()
    .positive("Promo price must be positive")
    .nullable()
    .optional(),
});

// Create service schema (POST)
export const createServiceSchema = baseServiceSchema;

// Update service schema (PATCH) - all fields optional
export const updateServiceSchema = baseServiceSchema.partial();

// Query params schema for list endpoint
export const listServicesQuerySchema = z.object({
  active: z.enum(["true", "false", "all"]).optional(),
  category: z.string().optional(),
  beauticianId: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/)
    .optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).optional(),
  skip: z.string().regex(/^\d+$/).transform(Number).optional(),
});

// ID param schema (for :id routes)
export const serviceIdSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid service ID"),
});

/**
 * Validate service creation data
 * @param {unknown} data
 * @returns {{ success: true, data: object } | { success: false, errors: array }}
 */
export function validateCreateService(data) {
  try {
    const validated = createServiceSchema.parse(data);
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
 * Validate service update data
 * @param {unknown} data
 * @returns {{ success: true, data: object } | { success: false, errors: array }}
 */
export function validateUpdateService(data) {
  try {
    const validated = updateServiceSchema.parse(data);
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
  createServiceSchema,
  updateServiceSchema,
  listServicesQuerySchema,
  serviceIdSchema,
  validateCreateService,
  validateUpdateService,
};
