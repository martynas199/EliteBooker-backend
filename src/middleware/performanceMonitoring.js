import { rootLogger } from "../utils/logger.js";

const performanceLogger = rootLogger.child({ scope: "performance" });

/**
 * Request timing and performance monitoring middleware
 */

/**
 * Log slow requests for performance monitoring
 * @param {Number} threshold - Threshold in ms to log warning (default: 1000ms)
 */
export function requestTimer(threshold = 1000) {
  return (req, res, next) => {
    const startTime = Date.now();

    // Store original end function
    const originalEnd = res.end;

    // Override end function to log timing
    res.end = function (...args) {
      const duration = Date.now() - startTime;

      const logData = {
        method: req.method,
        url: req.originalUrl || req.url,
        status: res.statusCode,
        durationMs: duration,
      };

      if (duration > threshold) {
        performanceLogger.warn("Slow Request", logData);
      } else if (process.env.LOG_HTTP_VERBOSE === "true") {
        performanceLogger.debug("Request", logData);
      }

      originalEnd.apply(res, args);
    };

    next();
  };
}

/**
 * Track endpoint performance metrics
 */
class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
  }

  /**
   * Record a request duration
   * @param {String} endpoint - Endpoint path
   * @param {Number} duration - Duration in ms
   * @param {Boolean} success - Whether request was successful
   */
  record(endpoint, duration, success = true) {
    if (!this.metrics.has(endpoint)) {
      this.metrics.set(endpoint, {
        totalRequests: 0,
        totalDuration: 0,
        successCount: 0,
        errorCount: 0,
        minDuration: Infinity,
        maxDuration: 0,
      });
    }

    const stats = this.metrics.get(endpoint);
    stats.totalRequests++;
    stats.totalDuration += duration;
    stats.minDuration = Math.min(stats.minDuration, duration);
    stats.maxDuration = Math.max(stats.maxDuration, duration);

    if (success) {
      stats.successCount++;
    } else {
      stats.errorCount++;
    }
  }

  /**
   * Get performance statistics for an endpoint
   * @param {String} endpoint - Endpoint path
   * @returns {Object} Performance stats
   */
  getStats(endpoint) {
    const stats = this.metrics.get(endpoint);
    if (!stats) return null;

    return {
      ...stats,
      avgDuration: stats.totalDuration / stats.totalRequests,
      errorRate: (stats.errorCount / stats.totalRequests) * 100,
    };
  }

  /**
   * Get all performance statistics
   * @returns {Object} All stats by endpoint
   */
  getAllStats() {
    const allStats = {};
    for (const [endpoint, stats] of this.metrics.entries()) {
      allStats[endpoint] = {
        ...stats,
        avgDuration: stats.totalDuration / stats.totalRequests,
        errorRate: (stats.errorCount / stats.totalRequests) * 100,
      };
    }
    return allStats;
  }

  /**
   * Reset all metrics
   */
  reset() {
    this.metrics.clear();
  }

  /**
   * Middleware to track performance
   */
  middleware() {
    return (req, res, next) => {
      const startTime = Date.now();
      const endpoint = `${req.method} ${req.route?.path || req.path}`;

      const originalEnd = res.end;

      res.end = (...args) => {
        const duration = Date.now() - startTime;
        const success = res.statusCode < 400;
        this.record(endpoint, duration, success);
        originalEnd.apply(res, args);
      };

      next();
    };
  }
}

const performanceMonitor = new PerformanceMonitor();

/**
 * Measure async function execution time
 * @param {String} label - Label for the operation
 * @param {Function} fn - Async function to measure
 * @returns {*} Function result
 */
export async function measureTime(label, fn) {
  const startTime = Date.now();
  try {
    const result = await fn();
    const duration = Date.now() - startTime;
    performanceLogger.debug("Measured operation", {
      label,
      durationMs: duration,
      success: true,
    });
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    performanceLogger.error("Measured operation failed", {
      label,
      durationMs: duration,
      error,
    });
    throw error;
  }
}

export { performanceMonitor };

