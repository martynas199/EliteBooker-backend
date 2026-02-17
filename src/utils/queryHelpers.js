/**
 * Query optimization utilities for API performance
 * Provides pagination, field selection, and query optimization helpers
 */

// Global configuration
const MAX_LIMIT = 100; // Maximum documents per request
const DEFAULT_LIMIT = 50;
const DEFAULT_SORT = "-createdAt";

// In-memory cache for count queries (short TTL)
const countCache = new Map();
const COUNT_CACHE_TTL = 60 * 1000; // 60 seconds

function normalizeCacheValue(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalizeCacheValue);
  if (typeof value === "object") {
    if (typeof value.toHexString === "function") {
      return value.toHexString();
    }
    const normalized = {};
    for (const key of Object.keys(value).sort()) {
      normalized[key] = normalizeCacheValue(value[key]);
    }
    return normalized;
  }
  return value;
}

function buildCountCacheKey({ model, filter, cacheKey, tenantId }) {
  const scopedTenantId = tenantId ? String(tenantId) : "global";
  if (cacheKey) {
    return `count:${scopedTenantId}:${cacheKey}`;
  }

  const modelName = model?.modelName || "model";
  const filterSignature = JSON.stringify(normalizeCacheValue(filter || {}));
  return `count:${scopedTenantId}:${modelName}:${filterSignature}`;
}

/**
 * Get or set cached count with TTL
 * @param {String} key - Cache key
 * @param {Function} fetcher - Function to fetch count if not cached
 * @returns {Promise<Number>} Document count
 */
async function getCachedCount(key, fetcher) {
  const cached = countCache.get(key);
  if (cached && Date.now() - cached.timestamp < COUNT_CACHE_TTL) {
    return cached.value;
  }

  const value = await fetcher();
  countCache.set(key, { value, timestamp: Date.now() });

  // Cleanup old cache entries periodically
  if (countCache.size > 1000) {
    const now = Date.now();
    for (const [k, v] of countCache.entries()) {
      if (now - v.timestamp > COUNT_CACHE_TTL) {
        countCache.delete(k);
      }
    }
  }

  return value;
}

/**
 * Parse and validate pagination parameters
 * @param {Object} query - Express request query object
 * @param {Object} options - Default options
 * @returns {Object} Pagination parameters
 */
export function parsePagination(query, options = {}) {
  const {
    defaultLimit = DEFAULT_LIMIT,
    maxLimit = MAX_LIMIT,
    defaultPage = 1,
  } = options;

  let limit = parseInt(query.limit) || defaultLimit;
  let page = parseInt(query.page) || defaultPage;

  // Validate and constrain values - ENFORCE GLOBAL MAX LIMIT
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
export function parseSort(query, defaultSort = DEFAULT_SORT) {
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
    defaultSort = DEFAULT_SORT,
    defaultLimit = DEFAULT_LIMIT,
    maxLimit = MAX_LIMIT,
    lean = true,
  } = options;

  // Apply pagination with enforced limits
  const { limit, skip } = parsePagination(params, {
    defaultLimit,
    maxLimit: MAX_LIMIT,
  });
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
  options = {},
) {
  const { limit, page } = parsePagination(params, { maxLimit: MAX_LIMIT });
  const { useCache = true, cacheKey = null, tenantId = null } = options;

  // Execute query and count in parallel
  const dataPromise = query;

  let totalPromise;
  if (useCache && cacheKey) {
    // Use cached count if available
    const effectiveCacheKey = buildCountCacheKey({
      model,
      filter,
      cacheKey,
      tenantId,
    });
    totalPromise = getCachedCount(effectiveCacheKey, () =>
      model.countDocuments(filter),
    );
  } else if (useCache) {
    const effectiveCacheKey = buildCountCacheKey({
      model,
      filter,
      tenantId,
    });
    totalPromise = getCachedCount(effectiveCacheKey, () =>
      model.countDocuments(filter),
    );
  } else {
    totalPromise = model.countDocuments(filter);
  }

  const [data, total] = await Promise.all([dataPromise, totalPromise]);

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

/**
 * Common populate projections to minimize over-fetching
 */
export const populateProjections = {
  specialist:
    "_id name email phone bio image specialty active stripeStatus subscription",
  service:
    "_id name description category image variants price duration active primaryBeauticianId specialistId",
  user: "_id name email phone",
  client: "name email phone",
  tenant: "_id name slug domain",
  location: "_id name address city postcode phone",
};

/**
 * Helper to apply strictPopulate and projections to populate calls
 * @param {Query} query - Mongoose query
 * @param {Array|Object} populateConfig - Populate configuration
 * @returns {Query} Query with optimized populate
 */
export function applyOptimizedPopulate(query, populateConfig) {
  if (Array.isArray(populateConfig)) {
    populateConfig.forEach((config) => {
      query = query.populate(config);
    });
  } else {
    query = query.populate(populateConfig);
  }
  return query;
}

// Export constants
export { MAX_LIMIT, DEFAULT_LIMIT, DEFAULT_SORT };
