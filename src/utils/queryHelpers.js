/**
 * Query optimization utilities for API performance
 * Provides pagination, field selection, and query optimization helpers
 */

/**
 * Parse and validate pagination parameters
 * @param {Object} query - Express request query object
 * @param {Object} options - Default options
 * @returns {Object} Pagination parameters
 */
export function parsePagination(query, options = {}) {
  const { defaultLimit = 50, maxLimit = 100, defaultPage = 1 } = options;

  let limit = parseInt(query.limit) || defaultLimit;
  let page = parseInt(query.page) || defaultPage;

  // Validate and constrain values
  limit = Math.min(Math.max(1, limit), maxLimit);
  page = Math.max(1, page);

  const skip = (page - 1) * limit;

  return {
    limit,
    page,
    skip,
  };
}

/**
 * Parse field selection from query
 * @param {Object} query - Express request query object
 * @param {String} defaultFields - Default fields to select
 * @returns {String} Fields for .select()
 */
export function parseFields(query, defaultFields = "") {
  if (query.fields) {
    // Convert comma-separated to space-separated
    return query.fields.split(",").join(" ");
  }
  return defaultFields;
}

/**
 * Parse sort parameters
 * @param {Object} query - Express request query object
 * @param {String} defaultSort - Default sort (e.g., '-createdAt')
 * @returns {String} Sort string for Mongoose
 */
export function parseSort(query, defaultSort = "-createdAt") {
  if (query.sort) {
    // Convert comma-separated to space-separated
    return query.sort.split(",").join(" ");
  }
  return defaultSort;
}

/**
 * Apply pagination and optimization to a Mongoose query
 * @param {Query} query - Mongoose query
 * @param {Object} params - Request query parameters
 * @param {Object} options - Configuration options
 * @returns {Query} Optimized query
 */
export function applyQueryOptimizations(query, params, options = {}) {
  const {
    defaultFields = "",
    defaultSort = "-createdAt",
    defaultLimit = 50,
    maxLimit = 100,
    lean = true,
  } = options;

  // Apply pagination
  const { limit, skip } = parsePagination(params, { defaultLimit, maxLimit });
  query = query.limit(limit).skip(skip);

  // Apply field selection
  const fields = parseFields(params, defaultFields);
  if (fields) {
    query = query.select(fields);
  }

  // Apply sorting
  const sort = parseSort(params, defaultSort);
  query = query.sort(sort);

  // Use .lean() for read-only queries (better performance)
  if (lean) {
    query = query.lean();
  }

  return query;
}

/**
 * Create paginated response metadata
 * @param {Number} total - Total count of documents
 * @param {Number} page - Current page
 * @param {Number} limit - Items per page
 * @returns {Object} Pagination metadata
 */
export function createPaginationMeta(total, page, limit) {
  const totalPages = Math.ceil(total / limit);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  return {
    total,
    page,
    limit,
    totalPages,
    hasNextPage,
    hasPrevPage,
  };
}

/**
 * Execute a paginated query and return results with metadata
 * @param {Query} query - Mongoose query
 * @param {Model} model - Mongoose model for counting
 * @param {Object} filter - Query filter for counting
 * @param {Object} params - Request query parameters
 * @param {Object} options - Configuration options
 * @returns {Object} { data, pagination }
 */
export async function executePaginatedQuery(
  query,
  model,
  filter,
  params,
  options = {}
) {
  const { limit, page } = parsePagination(params, options);

  // Execute query and count in parallel
  const [data, total] = await Promise.all([
    query,
    model.countDocuments(filter),
  ]);

  const pagination = createPaginationMeta(total, page, limit);

  return {
    data,
    pagination,
  };
}

/**
 * Common field selections for different models
 */
export const commonFields = {
  appointment:
    "_id userId client specialistId serviceId variantName start end price status createdAt",
  service:
    "_id name description category image variants active primaryBeauticianId",
  specialist: "_id name email phone bio specialty image active",
  product:
    "_id title description price originalPrice image category featured active",
  order:
    "_id orderNumber userId items total orderStatus paymentStatus createdAt",
  user: "_id name email phone role isActive createdAt",
};
