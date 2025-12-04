/**
 * Redis-based Slot Locking Service
 * Prevents double-booking in high concurrency scenarios
 *
 * Features:
 * - Atomic lock acquire/release operations
 * - Automatic TTL expiration
 * - Lock ownership verification
 * - Lua scripts for atomicity
 */

import { v4 as uuidv4 } from "uuid";
import Redis from "ioredis";

class LockService {
  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || "localhost",
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      db: process.env.REDIS_DB || 0,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      connectTimeout: 10000,
    });

    // Default lock TTL in milliseconds (2 minutes)
    this.DEFAULT_TTL = parseInt(process.env.LOCK_TTL || "120000", 10);

    // Lock key prefix for namespacing
    this.KEY_PREFIX = "booking_lock";

    // Lua script for atomic lock release (verify ownership before delete)
    this.RELEASE_SCRIPT = `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("DEL", KEYS[1])
      else
        return 0
      end
    `;

    // Lua script for atomic lock refresh (verify ownership before extending TTL)
    this.REFRESH_SCRIPT = `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("PEXPIRE", KEYS[1], ARGV[2])
      else
        return 0
      end
    `;

    // Connection event handlers
    this.redis.on("connect", () => {
      console.log("✅ Redis connected for lock service");
    });

    this.redis.on("error", (err) => {
      console.error("❌ Redis connection error:", err);
    });

    this.redis.on("ready", () => {
      console.log("🚀 Redis ready for lock operations");
    });

    // Metrics tracking
    this.metrics = {
      locksAcquired: 0,
      locksFailed: 0,
      locksReleased: 0,
      locksExpired: 0,
      averageLockDuration: 0,
    };
  }

  /**
   * Generate Redis key for a booking slot
   * Pattern: booking_lock:{resourceId}:{date}:{startTime}
   *
   * Uses hash tags for Redis Cluster to ensure same resource locks stay on same shard
   *
   * @param {Object} params - Lock parameters
   * @param {string} params.resourceId - Resource (beautician/room) identifier
   * @param {string} params.date - Date in YYYY-MM-DD format
   * @param {string} params.startTime - Start time in HH:mm format
   * @returns {string} Redis key
   */
  generateLockKey({ resourceId, date, startTime }) {
    // Use hash tags {} to ensure same resource locks stay on same Redis shard in cluster mode
    return `${this.KEY_PREFIX}:{${resourceId}}:${date}:${startTime}`;
  }

  /**
   * Acquire a temporary lock on a booking slot
   * Uses Redis SET with NX (only set if not exists) and PX (TTL in milliseconds)
   *
   * @param {Object} params - Lock parameters
   * @param {string} params.resourceId - Resource identifier (beautician ID)
   * @param {string} params.date - Date in YYYY-MM-DD format
   * @param {string} params.startTime - Start time in HH:mm format
   * @param {number} [params.duration] - Booking duration in minutes (for validation)
   * @param {number} [params.ttl] - Custom TTL in milliseconds (default: 120000)
   * @returns {Promise<Object>} Lock result
   */
  async acquireLock({ resourceId, date, startTime, duration, ttl }) {
    try {
      const lockKey = this.generateLockKey({ resourceId, date, startTime });
      const lockId = uuidv4();
      const lockTTL = ttl || this.DEFAULT_TTL;

      console.log(`[LockService] Attempting to acquire lock: ${lockKey}`);

      // Redis SET with NX (only if not exists) and PX (TTL in milliseconds)
      // Returns "OK" if lock acquired, null if already exists
      const result = await this.redis.set(lockKey, lockId, "NX", "PX", lockTTL);

      if (!result) {
        console.log(
          `[LockService] Lock acquisition failed - slot already locked: ${lockKey}`
        );
        this.metrics.locksFailed++;

        // Check remaining TTL for the existing lock
        const remainingTTL = await this.redis.pttl(lockKey);

        return {
          locked: false,
          reason: "slot_locked",
          lockKey,
          remainingTTL: remainingTTL > 0 ? remainingTTL : 0,
        };
      }

      console.log(
        `[LockService] Lock acquired successfully: ${lockKey} with lockId: ${lockId}`
      );
      this.metrics.locksAcquired++;

      return {
        locked: true,
        lockId,
        lockKey,
        expiresIn: lockTTL,
        expiresAt: Date.now() + lockTTL,
        metadata: {
          resourceId,
          date,
          startTime,
          duration,
        },
      };
    } catch (error) {
      console.error("[LockService] Error acquiring lock:", error);
      throw new Error(`Failed to acquire lock: ${error.message}`);
    }
  }

  /**
   * Verify that a lock exists and matches the provided lockId
   * Used during booking creation to ensure lock ownership
   *
   * @param {Object} params - Verification parameters
   * @param {string} params.resourceId - Resource identifier (beautician ID)
   * @param {string} params.date - Date in YYYY-MM-DD format
   * @param {string} params.startTime - Start time in HH:mm format
   * @param {string} params.lockId - Lock identifier to verify
   * @returns {Promise<Object>} Verification result
   */
  async verifyLock({ resourceId, date, startTime, lockId }) {
    try {
      const lockKey = this.generateLockKey({ resourceId, date, startTime });

      console.log(`[LockService] Verifying lock: ${lockKey}`);

      const storedLockId = await this.redis.get(lockKey);

      if (!storedLockId) {
        console.log(
          `[LockService] Lock verification failed - lock not found or expired: ${lockKey}`
        );
        return {
          valid: false,
          reason: "lock_not_found",
          message: "Lock has expired or does not exist",
        };
      }

      if (storedLockId !== lockId) {
        console.log(
          `[LockService] Lock verification failed - lockId mismatch: ${lockKey}`
        );
        return {
          valid: false,
          reason: "lock_mismatch",
          message: "Lock ID does not match",
        };
      }

      const remainingTTL = await this.redis.pttl(lockKey);

      console.log(`[LockService] Lock verified successfully: ${lockKey}`);

      return {
        valid: true,
        lockKey,
        remainingTTL: remainingTTL > 0 ? remainingTTL : 0,
      };
    } catch (error) {
      console.error("[LockService] Error verifying lock:", error);
      throw new Error(`Failed to verify lock: ${error.message}`);
    }
  }

  /**
   * Release a lock manually
   * Uses Lua script to ensure atomicity (verify ownership before deletion)
   * Only the owner of the lock can release it
   *
   * @param {Object} params - Release parameters
   * @param {string} params.resourceId - Resource identifier (beautician ID)
   * @param {string} params.date - Date in YYYY-MM-DD format
   * @param {string} params.startTime - Start time in HH:mm format
   * @param {string} params.lockId - Lock identifier for ownership verification
   * @returns {Promise<Object>} Release result
   */
  async releaseLock({ resourceId, date, startTime, lockId }) {
    try {
      const lockKey = this.generateLockKey({ resourceId, date, startTime });

      console.log(`[LockService] Attempting to release lock: ${lockKey}`);

      // Use Lua script to atomically verify ownership and delete
      // Returns 1 if deleted, 0 if not found or lockId mismatch
      const result = await this.redis.eval(
        this.RELEASE_SCRIPT,
        1,
        lockKey,
        lockId
      );

      if (result === 0) {
        console.log(
          `[LockService] Lock release failed - not found or lockId mismatch: ${lockKey}`
        );
        return {
          released: false,
          reason: "lock_not_found_or_mismatch",
          lockKey,
        };
      }

      console.log(`[LockService] Lock released successfully: ${lockKey}`);
      this.metrics.locksReleased++;

      return {
        released: true,
        lockKey,
      };
    } catch (error) {
      console.error("[LockService] Error releasing lock:", error);
      throw new Error(`Failed to release lock: ${error.message}`);
    }
  }

  /**
   * Refresh/extend the TTL of an existing lock
   * Useful for long-running checkout processes (Stripe, Klarna, etc.)
   * Uses Lua script to ensure atomicity (verify ownership before extending)
   *
   * @param {Object} params - Refresh parameters
   * @param {string} params.resourceId - Resource identifier (beautician ID)
   * @param {string} params.date - Date in YYYY-MM-DD format
   * @param {string} params.startTime - Start time in HH:mm format
   * @param {string} params.lockId - Lock identifier for ownership verification
   * @param {number} [params.ttl] - New TTL in milliseconds (default: DEFAULT_TTL)
   * @returns {Promise<Object>} Refresh result
   */
  async refreshLock({ resourceId, date, startTime, lockId, ttl }) {
    try {
      const lockKey = this.generateLockKey({ resourceId, date, startTime });
      const lockTTL = ttl || this.DEFAULT_TTL;

      console.log(`[LockService] Attempting to refresh lock: ${lockKey}`);

      // Use Lua script to atomically verify ownership and extend TTL
      // Returns 1 if refreshed, 0 if not found or lockId mismatch
      const result = await this.redis.eval(
        this.REFRESH_SCRIPT,
        1,
        lockKey,
        lockId,
        lockTTL
      );

      if (result === 0) {
        console.log(
          `[LockService] Lock refresh failed - not found or lockId mismatch: ${lockKey}`
        );
        return {
          refreshed: false,
          reason: "lock_not_found_or_mismatch",
          lockKey,
        };
      }

      console.log(`[LockService] Lock refreshed successfully: ${lockKey}`);

      return {
        refreshed: true,
        lockKey,
        expiresIn: lockTTL,
        expiresAt: Date.now() + lockTTL,
      };
    } catch (error) {
      console.error("[LockService] Error refreshing lock:", error);
      throw new Error(`Failed to refresh lock: ${error.message}`);
    }
  }

  /**
   * Get all active locks (Admin monitoring)
   *
   * @param {string} [resourceId] - Optional: filter by specific resource (beautician ID)
   * @param {number} [limit=100] - Maximum number of locks to return
   * @returns {Promise<Array>} List of active locks
   */
  async getActiveLocks(resourceId = null, limit = 100) {
    try {
      const pattern = resourceId
        ? `${this.KEY_PREFIX}:{${resourceId}}:*:*`
        : `${this.KEY_PREFIX}:*:*:*`;

      console.log(
        `[LockService] Fetching active locks${
          resourceId ? ` for resource: ${resourceId}` : ""
        }`
      );

      const keys = [];
      let cursor = "0";

      // Use SCAN to iterate through keys (safer than KEYS for production)
      do {
        const [nextCursor, foundKeys] = await this.redis.scan(
          cursor,
          "MATCH",
          pattern,
          "COUNT",
          100
        );
        cursor = nextCursor;
        keys.push(...foundKeys);

        if (keys.length >= limit) {
          break;
        }
      } while (cursor !== "0");

      // Get lock details
      const locks = await Promise.all(
        keys.slice(0, limit).map(async (key) => {
          const [lockId, ttl] = await Promise.all([
            this.redis.get(key),
            this.redis.pttl(key),
          ]);

          // Parse key to extract metadata
          const parts = key.split(":");
          const [, hashTag, date, startTime] = parts;
          const resourceIdParsed = hashTag.replace(/[{}]/g, "");

          return {
            lockKey: key,
            lockId,
            resourceId: resourceIdParsed,
            date,
            startTime,
            remainingTTL: ttl > 0 ? ttl : 0,
            expiresAt: ttl > 0 ? Date.now() + ttl : null,
          };
        })
      );

      return locks;
    } catch (error) {
      console.error("[LockService] Error fetching active locks:", error);
      throw new Error(`Failed to fetch active locks: ${error.message}`);
    }
  }

  /**
   * Force release a lock (Admin only)
   * Bypasses ownership verification
   *
   * @param {Object} params - Force release parameters
   * @param {string} params.resourceId - Resource identifier (beautician ID)
   * @param {string} params.date - Date in YYYY-MM-DD format
   * @param {string} params.startTime - Start time in HH:mm format
   * @returns {Promise<Object>} Release result
   */
  async forceReleaseLock({ resourceId, date, startTime }) {
    try {
      const lockKey = this.generateLockKey({ resourceId, date, startTime });

      console.log(`[LockService] Force releasing lock: ${lockKey}`);

      const result = await this.redis.del(lockKey);

      if (result === 0) {
        return {
          released: false,
          reason: "lock_not_found",
          lockKey,
        };
      }

      console.log(`[LockService] Lock force released: ${lockKey}`);

      return {
        released: true,
        lockKey,
      };
    } catch (error) {
      console.error("[LockService] Error force releasing lock:", error);
      throw new Error(`Failed to force release lock: ${error.message}`);
    }
  }

  /**
   * Get lock service metrics
   *
   * @returns {Object} Metrics data
   */
  getMetrics() {
    return {
      ...this.metrics,
      successRate:
        this.metrics.locksAcquired > 0
          ? (
              (this.metrics.locksAcquired /
                (this.metrics.locksAcquired + this.metrics.locksFailed)) *
              100
            ).toFixed(2) + "%"
          : "0%",
      totalAttempts: this.metrics.locksAcquired + this.metrics.locksFailed,
    };
  }

  /**
   * Reset metrics (for testing or periodic resets)
   */
  resetMetrics() {
    this.metrics = {
      locksAcquired: 0,
      locksFailed: 0,
      locksReleased: 0,
      locksExpired: 0,
      averageLockDuration: 0,
    };
  }

  /**
   * Close Redis connection (cleanup)
   */
  async close() {
    await this.redis.quit();
    console.log("✅ Redis connection closed");
  }

  /**
   * Health check
   *
   * @returns {Promise<boolean>} Redis connection status
   */
  async healthCheck() {
    try {
      const result = await this.redis.ping();
      return result === "PONG";
    } catch (error) {
      console.error("[LockService] Health check failed:", error);
      return false;
    }
  }
}

// Singleton instance
let lockServiceInstance = null;

/**
 * Get singleton instance of LockService
 *
 * @returns {LockService} Lock service instance
 */
function getLockService() {
  if (!lockServiceInstance) {
    lockServiceInstance = new LockService();
  }
  return lockServiceInstance;
}

export { LockService, getLockService };
