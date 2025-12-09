# Redis-Based Slot Locking System

## 🎯 Overview

Complete Redis-based slot-locking mechanism for a multi-tenant booking system that prevents double-booking in high concurrency scenarios.

### Key Features

- ✅ **Atomic Operations**: Lock acquire/release using Redis SET NX and Lua scripts
- ✅ **Auto-Expiration**: Locks automatically expire after TTL (default: 120 seconds)
- ✅ **Multi-Tenant Isolation**: Complete tenant separation using namespaced keys
- ✅ **Ownership Verification**: Only lock owner can release or refresh
- ✅ **High Performance**: Sub-millisecond lock operations
- ✅ **Production Ready**: Error handling, metrics, health checks

---

## 🏗️ Architecture

### Components

```
┌─────────────────────────────────────────────────────────┐
│                      Frontend                            │
│  ┌────────────────┐         ┌────────────────┐         │
│  │ useLockManager │────────▶│   Lock API     │         │
│  │   React Hook   │         │    Client      │         │
│  └────────────────┘         └────────────────┘         │
└────────────────────────────────┬────────────────────────┘
                                 │ HTTP/REST
┌────────────────────────────────┴────────────────────────┐
│                      Backend                             │
│  ┌────────────────┐         ┌────────────────┐         │
│  │  Lock Routes   │────────▶│  Lock Service  │         │
│  │   /api/locks   │         │  (Singleton)   │         │
│  └────────────────┘         └────────┬───────┘         │
│                                       │                  │
│  ┌────────────────┐                  │                  │
│  │Booking Routes  │──────────────────┘                  │
│  │ /api/bookings  │                                     │
│  └────────────────┘                                     │
└────────────────────────────────┬────────────────────────┘
                                 │ ioredis
┌────────────────────────────────┴────────────────────────┐
│                     Redis                                │
│  Keys: booking_lock:{tenantId|resourceId}:date:time     │
│  TTL: 120 seconds (configurable)                        │
└─────────────────────────────────────────────────────────┘
```

---

## 🔑 Redis Key Structure

### Pattern

```
booking_lock:{tenantId|resourceId}:{date}:{startTime}
```

### Examples

```
booking_lock:{tenant123|beautician42}:2025-03-10:14:00
booking_lock:{acme-inc|therapist7}:2025-04-15:09:30
```

### Why Hash Tags `{}`?

Hash tags ensure that all locks for the same tenant stay on the same Redis shard in cluster mode, improving performance and atomicity.

### Key Properties

- **Value**: UUID (lock identifier)
- **TTL**: 120,000ms (2 minutes) by default
- **Namespace**: `booking_lock` prefix for separation

---

## 🚀 Backend Implementation

### 1. Lock Service (`lockService.js`)

Core singleton service managing all lock operations.

#### Key Methods

```javascript
const { getLockService } = require("./services/lockService");
const lockService = getLockService();

// Acquire lock
const result = await lockService.acquireLock({
  tenantId: "tenant123",
  resourceId: "beautician42",
  date: "2025-03-10",
  startTime: "14:00",
  duration: 60, // minutes
});

// Verify lock
const verification = await lockService.verifyLock({
  tenantId: "tenant123",
  resourceId: "beautician42",
  date: "2025-03-10",
  startTime: "14:00",
  lockId: result.lockId,
});

// Refresh lock (extend TTL)
await lockService.refreshLock({
  tenantId: "tenant123",
  resourceId: "beautician42",
  date: "2025-03-10",
  startTime: "14:00",
  lockId: result.lockId,
});

// Release lock
await lockService.releaseLock({
  tenantId: "tenant123",
  resourceId: "beautician42",
  date: "2025-03-10",
  startTime: "14:00",
  lockId: result.lockId,
});
```

#### Redis Operations

**Acquire (Atomic SET NX PX)**:

```redis
SET booking_lock:{tenant|resource}:date:time {uuid} NX PX 120000
```

**Release (Lua Script)**:

```lua
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
else
  return 0
end
```

**Refresh (Lua Script)**:

```lua
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("PEXPIRE", KEYS[1], ARGV[2])
else
  return 0
end
```

### 2. Lock Routes (`/api/locks`)

RESTful API endpoints for lock management.

#### Endpoints

| Method | Endpoint                         | Description          | Access |
| ------ | -------------------------------- | -------------------- | ------ |
| POST   | `/api/locks/acquire`             | Acquire a slot lock  | Public |
| POST   | `/api/locks/verify`              | Verify lock validity | Public |
| POST   | `/api/locks/release`             | Release a lock       | Public |
| POST   | `/api/locks/refresh`             | Extend lock TTL      | Public |
| GET    | `/api/locks/admin/active`        | List active locks    | Admin  |
| POST   | `/api/locks/admin/force-release` | Force release lock   | Admin  |
| GET    | `/api/locks/metrics`             | Get metrics          | Admin  |
| GET    | `/api/locks/health`              | Health check         | Public |

#### Example: Acquire Lock

**Request**:

```http
POST /api/locks/acquire
Content-Type: application/json

{
  "tenantId": "tenant123",
  "resourceId": "beautician42",
  "date": "2025-03-10",
  "startTime": "14:00",
  "duration": 60
}
```

**Response (Success)**:

```json
{
  "success": true,
  "locked": true,
  "lockId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "expiresIn": 120000,
  "expiresAt": 1710082800000,
  "metadata": {
    "tenantId": "tenant123",
    "resourceId": "beautician42",
    "date": "2025-03-10",
    "startTime": "14:00",
    "duration": 60
  }
}
```

**Response (Already Locked)**:

```json
{
  "success": false,
  "locked": false,
  "reason": "slot_locked",
  "message": "Slot is currently locked by another user",
  "remainingTTL": 85000
}
```

### 3. Booking Routes (`/api/bookings`)

Enhanced booking creation with lock verification.

#### Create Booking Flow

```javascript
POST /api/bookings/create

// Request
{
  "lockId": "uuid-from-lock-acquire",
  "tenantId": "tenant123",
  "specialistId": "beautician42",
  "serviceId": "service789",
  "date": "2025-03-10",
  "startTime": "14:00",
  "endTime": "15:00",
  "customerName": "John Doe",
  "customerEmail": "john@example.com",
  "customerPhone": "+1234567890",
  "price": 50,
  "duration": 60
}

// Backend Flow:
// 1. Verify lock exists and matches lockId
// 2. Validate booking data (specialist, service exist)
// 3. Double-check for existing booking (DB safety)
// 4. Create booking in database
// 5. Release lock
// 6. Send confirmation
```

**Response (Success)**:

```json
{
  "success": true,
  "status": "success",
  "bookingId": "booking123",
  "appointment": {
    "id": "booking123",
    "date": "2025-03-10",
    "startTime": "14:00",
    "endTime": "15:00",
    "status": "confirmed",
    "customerName": "John Doe"
  }
}
```

**Response (Lock Expired)**:

```json
{
  "success": false,
  "error": "Lock verification failed",
  "reason": "lock_not_found",
  "message": "Lock has expired or does not exist"
}
```

---

## 💻 Frontend Implementation

### 1. Lock API Client (`lockAPI.js`)

```javascript
import { LockAPI } from "@/shared/api/lockAPI";

// Acquire lock
const result = await LockAPI.acquireLock({
  tenantId: "tenant123",
  resourceId: "beautician42",
  date: "2025-03-10",
  startTime: "14:00",
  duration: 60,
});

if (result.locked) {
  // Store lockId for later use
  const lockId = result.lockId;
}

// Release lock
await LockAPI.releaseLock({
  tenantId: "tenant123",
  resourceId: "beautician42",
  date: "2025-03-10",
  startTime: "14:00",
  lockId: lockId,
});
```

### 2. React Hook (`useLockManager`)

Automatic lock management with cleanup.

```javascript
import { useLockManager } from "@/shared/hooks/useLockManager";

function BookingComponent() {
  const {
    lockData,
    isLocked,
    isAcquiring,
    error,
    remainingTime,
    acquireLock,
    releaseLock,
    refreshLock,
    formatRemainingTime,
  } = useLockManager({
    refreshInterval: 30000, // Refresh every 30 seconds
    autoRefresh: true,
  });

  const handleSlotSelect = async (slot) => {
    const result = await acquireLock({
      tenantId: tenant.id,
      resourceId: slot.specialistId,
      date: slot.date,
      startTime: slot.time,
      duration: slot.duration,
    });

    if (result.success) {
      console.log("Slot locked!", lockData.lockId);
      // Proceed with booking flow
    } else {
      alert("Slot is already taken. Please choose another.");
    }
  };

  return (
    <div>
      {isLocked && <div>⏰ Time remaining: {formatRemainingTime()}</div>}

      {error && <div className="error">{error.message}</div>}

      {/* Lock is automatically released on unmount */}
    </div>
  );
}
```

### 3. Complete Booking Flow Example

```javascript
import { useState } from "react";
import { useLockManager } from "@/shared/hooks/useLockManager";
import { api } from "@/shared/lib/apiClient";

function BookingFlow() {
  const [step, setStep] = useState(1);
  const [selectedSlot, setSelectedSlot] = useState(null);

  const { acquireLock, releaseLock, lockData, isLocked, error } =
    useLockManager();

  // Step 1: User selects time slot
  const handleSlotSelect = async (slot) => {
    const result = await acquireLock({
      tenantId: tenant.id,
      resourceId: slot.specialistId,
      date: slot.date,
      startTime: slot.time,
      duration: slot.duration,
    });

    if (result.success) {
      setSelectedSlot(slot);
      setStep(2); // Go to customer info form
    } else {
      alert("This slot is no longer available. Please choose another.");
    }
  };

  // Step 2: User cancels
  const handleCancel = async () => {
    await releaseLock();
    setStep(1);
    setSelectedSlot(null);
  };

  // Step 3: Create booking
  const handleConfirmBooking = async (customerData) => {
    try {
      const response = await api.post("/bookings/create", {
        lockId: lockData.lockId, // Include lockId from lock manager
        tenantId: tenant.id,
        specialistId: selectedSlot.specialistId,
        serviceId: selectedSlot.serviceId,
        date: selectedSlot.date,
        startTime: selectedSlot.time,
        endTime: selectedSlot.endTime,
        ...customerData,
      });

      // Booking created! Lock is automatically released by backend
      alert("Booking confirmed!");
      setStep(3); // Go to confirmation page
    } catch (err) {
      if (err.response?.status === 409) {
        alert("Your reservation expired. Please select a time slot again.");
        setStep(1);
      }
    }
  };

  return (
    <div>
      {step === 1 && <TimeSlotSelector onSelect={handleSlotSelect} />}
      {step === 2 && (
        <CustomerInfoForm
          onSubmit={handleConfirmBooking}
          onCancel={handleCancel}
          lockTimeRemaining={formatRemainingTime()}
        />
      )}
      {step === 3 && <ConfirmationPage />}
    </div>
  );
}
```

---

## 🔒 Multi-Tenant Safety

### Tenant Isolation

Each tenant's locks are completely isolated:

```javascript
// Tenant A's lock
booking_lock:{tenantA|resource1}:2025-03-10:14:00

// Tenant B's lock (different namespace)
booking_lock:{tenantB|resource1}:2025-03-10:14:00

// These DO NOT conflict - completely separate
```

### Redis Cluster Compatibility

Hash tags `{tenantId|resourceId}` ensure:

- All locks for same tenant stay on same shard
- Atomic operations work correctly
- No cross-shard transaction issues

---

## ⚙️ Configuration

### Environment Variables

```bash
# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_password_here
REDIS_DB=0

# Lock Configuration
LOCK_TTL=120000  # Lock expiration in milliseconds (2 minutes)
```

### Customization

```javascript
// Custom TTL per lock
await lockService.acquireLock({
  tenantId: "tenant123",
  resourceId: "beautician42",
  date: "2025-03-10",
  startTime: "14:00",
  ttl: 180000, // 3 minutes instead of default 2
});

// Custom refresh interval in hook
const { acquireLock } = useLockManager({
  refreshInterval: 45000, // Refresh every 45 seconds
  autoRefresh: true,
});
```

---

## 📊 Monitoring & Metrics

### Metrics Endpoint

```http
GET /api/locks/metrics
Authorization: Bearer {admin_token}
```

**Response**:

```json
{
  "success": true,
  "metrics": {
    "locksAcquired": 1523,
    "locksFailed": 47,
    "locksReleased": 1490,
    "locksExpired": 33,
    "successRate": "97.02%",
    "totalAttempts": 1570
  }
}
```

### Active Locks Monitoring

```http
GET /api/locks/admin/active?tenantId=tenant123&limit=100
Authorization: Bearer {admin_token}
```

**Response**:

```json
{
  "success": true,
  "count": 3,
  "locks": [
    {
      "lockKey": "booking_lock:{tenant123|beautician42}:2025-03-10:14:00",
      "lockId": "uuid-1",
      "tenantId": "tenant123",
      "resourceId": "beautician42",
      "date": "2025-03-10",
      "startTime": "14:00",
      "remainingTTL": 89000,
      "expiresAt": 1710082889000
    }
  ]
}
```

### Health Check

```http
GET /api/locks/health
```

**Response**:

```json
{
  "success": true,
  "healthy": true,
  "message": "Lock service is operational"
}
```

---

## 🚨 Error Handling

### Lock Acquisition Errors

```javascript
const result = await lockService.acquireLock({ ... });

if (!result.locked) {
  switch (result.reason) {
    case 'slot_locked':
      // Another user has this slot
      showMessage('This time is being booked. Choose another slot.');
      break;
  }
}
```

### Lock Verification Errors

```javascript
const verification = await lockService.verifyLock({ ... });

if (!verification.valid) {
  switch (verification.reason) {
    case 'lock_not_found':
      showMessage('Your reservation expired. Please start over.');
      break;

    case 'lock_mismatch':
      showMessage('Invalid lock ID. Please refresh and try again.');
      break;
  }
}
```

### Booking Creation Errors

```javascript
try {
  await api.post('/bookings/create', { ... });
} catch (error) {
  if (error.response?.status === 409) {
    // Lock verification failed or slot double-booked
    showMessage('Your reservation expired. Please select a slot again.');
  }
}
```

---

## 🧪 Testing

### Unit Tests

```javascript
const { getLockService } = require('./services/lockService');
const lockService = getLockService();

describe('LockService', () => {
  test('should acquire lock successfully', async () => {
    const result = await lockService.acquireLock({
      tenantId: 'test-tenant',
      resourceId: 'test-resource',
      date: '2025-03-10',
      startTime: '14:00',
    });

    expect(result.locked).toBe(true);
    expect(result.lockId).toBeDefined();
  });

  test('should fail to acquire already locked slot', async () => {
    // Acquire first lock
    const first = await lockService.acquireLock({ ... });

    // Try to acquire same slot
    const second = await lockService.acquireLock({ ... });

    expect(second.locked).toBe(false);
    expect(second.reason).toBe('slot_locked');
  });

  test('should release lock successfully', async () => {
    const { lockId } = await lockService.acquireLock({ ... });

    const result = await lockService.releaseLock({ ..., lockId });

    expect(result.released).toBe(true);
  });
});
```

### Integration Tests

```javascript
describe("Booking with Locks", () => {
  test("should create booking with valid lock", async () => {
    // 1. Acquire lock
    const lockResult = await request(app)
      .post("/api/locks/acquire")
      .send({ tenantId, resourceId, date, startTime });

    expect(lockResult.body.locked).toBe(true);
    const lockId = lockResult.body.lockId;

    // 2. Create booking
    const bookingResult = await request(app)
      .post("/api/bookings/create")
      .send({ lockId, ...bookingData });

    expect(bookingResult.status).toBe(201);
    expect(bookingResult.body.bookingId).toBeDefined();
  });

  test("should reject booking with expired lock", async () => {
    const lockId = "expired-lock-id";

    const result = await request(app)
      .post("/api/bookings/create")
      .send({ lockId, ...bookingData });

    expect(result.status).toBe(409);
    expect(result.body.reason).toBe("lock_not_found");
  });
});
```

---

## 🔧 Troubleshooting

### Issue: Locks Not Expiring

**Symptoms**: Old locks remain in Redis indefinitely

**Solution**:

```bash
# Check Redis TTL
redis-cli
> TTL booking_lock:{tenant|resource}:date:time

# If returns -1 (no TTL), manually delete
> DEL booking_lock:{tenant|resource}:date:time
```

### Issue: High Lock Failure Rate

**Symptoms**: Many `locksFailed` in metrics

**Possible Causes**:

- High concurrency (good - system is working!)
- TTL too short (users can't complete checkout)
- Refresh not working

**Solutions**:

- Increase TTL: `LOCK_TTL=180000` (3 minutes)
- Enable auto-refresh in frontend
- Monitor metrics to tune settings

### Issue: Redis Connection Errors

**Symptoms**: `Redis connection error` in logs

**Solutions**:

```bash
# Check Redis is running
redis-cli ping
# Should return PONG

# Check connection settings
echo $REDIS_HOST
echo $REDIS_PORT

# Test connection from Node.js
node -e "const Redis = require('ioredis'); const r = new Redis(); r.ping().then(console.log);"
```

---

## 🚀 Deployment

### Docker Compose

```yaml
version: "3.8"

services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 3

  backend:
    build: ./booking-backend
    environment:
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - LOCK_TTL=120000
    depends_on:
      - redis

volumes:
  redis-data:
```

### Production Checklist

- [ ] Redis persistence enabled (`appendonly yes`)
- [ ] Redis password set (`requirepass your_strong_password`)
- [ ] Redis maxmemory policy configured (`maxmemory-policy allkeys-lru`)
- [ ] Lock service health check endpoint monitored
- [ ] Metrics dashboard set up
- [ ] Alert on high lock failure rate
- [ ] Backup Redis data regularly
- [ ] Test lock expiration works correctly
- [ ] Load test with concurrent users

---

## 📚 Additional Resources

### Redis Documentation

- [Redis SET](https://redis.io/commands/set/)
- [Redis Lua Scripting](https://redis.io/docs/manual/programmability/eval-intro/)
- [Redis Cluster](https://redis.io/docs/manual/scaling/)

### Best Practices

- Always verify lock before database write
- Release locks in finally blocks
- Use Lua scripts for atomicity
- Monitor lock metrics regularly
- Test high-concurrency scenarios

---

## 📝 License

MIT

---

## 👥 Support

For issues or questions:

- GitHub Issues: [your-repo/issues]
- Email: support@yourplatform.com
- Documentation: [docs.yourplatform.com/locks]
