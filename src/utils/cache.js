/**
 * Simple in-memory cache with TTL support
 * For production, consider using Redis for distributed caching
 */

class CacheManager {
  constructor() {
    this.cache = new Map();
    this.ttls = new Map();
  }

  /**
   * Set a cache entry with optional TTL
   * @param {String} key - Cache key
   * @param {*} value - Value to cache
   * @param {Number} ttl - Time to live in milliseconds (default: 5 minutes)
   */
  set(key, value, ttl = 5 * 60 * 1000) {
    this.cache.set(key, value);

    if (ttl > 0) {
      const expiresAt = Date.now() + ttl;
      this.ttls.set(key, expiresAt);

      // Schedule cleanup
      setTimeout(() => {
        this.delete(key);
      }, ttl);
    }
  }

  /**
   * Get a cache entry
   * @param {String} key - Cache key
   * @returns {*} Cached value or undefined
   */
  get(key) {
    // Check if expired
    if (this.ttls.has(key)) {
      const expiresAt = this.ttls.get(key);
      if (Date.now() > expiresAt) {
        this.delete(key);
        return undefined;
      }
    }

    return this.cache.get(key);
  }

  /**
   * Check if key exists and is not expired
   * @param {String} key - Cache key
   * @returns {Boolean}
   */
  has(key) {
    return this.get(key) !== undefined;
  }

  /**
   * Delete a cache entry
   * @param {String} key - Cache key
   */
  delete(key) {
    this.cache.delete(key);
    this.ttls.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear() {
    this.cache.clear();
    this.ttls.clear();
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  getStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }

  /**
   * Wrap a function with caching
   * @param {String} key - Cache key
   * @param {Function} fn - Async function to execute
   * @param {Number} ttl - Cache TTL in milliseconds
   * @returns {*} Cached or fresh result
   */
  async wrap(key, fn, ttl = 5 * 60 * 1000) {
    // Check cache first
    const cached = this.get(key);
    if (cached !== undefined) {
      return cached;
    }

    // Execute function and cache result
    const result = await fn();
    this.set(key, result, ttl);
    return result;
  }

  /**
   * Generate cache key from parameters
   * @param {String} prefix - Key prefix
   * @param {Object} params - Parameters to include in key
   * @returns {String} Cache key
   */
  static generateKey(prefix, params = {}) {
    const sortedParams = Object.keys(params)
      .sort()
      .map((key) => `${key}:${params[key]}`)
      .join("|");
    return `${prefix}:${sortedParams}`;
  }
}

// Singleton instance
const cache = new CacheManager();

// Cache TTL presets (in milliseconds)
export const CacheTTL = {
  SHORT: 1 * 60 * 1000, // 1 minute
  MEDIUM: 5 * 60 * 1000, // 5 minutes
  LONG: 15 * 60 * 1000, // 15 minutes
  HOUR: 60 * 60 * 1000, // 1 hour
  DAY: 24 * 60 * 60 * 1000, // 1 day
};

export default cache;
