# Redis Lock System - Quick Start Guide

## 🚀 Quick Setup (5 minutes)

### 1. Install Redis

**macOS (Homebrew)**:

```bash
brew install redis
brew services start redis
```

**Ubuntu/Debian**:

```bash
sudo apt-get update
sudo apt-get install redis-server
sudo systemctl start redis
```

**Windows**:
Download from: https://github.com/microsoftarchive/redis/releases

**Docker**:

```bash
docker run -d -p 6379:6379 --name redis redis:7-alpine
```

### 2. Install Node.js Dependencies

```bash
cd booking-backend
npm install ioredis uuid
```

### 3. Configure Environment

Create `.env` file:

```bash
# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# Lock TTL (milliseconds)
LOCK_TTL=120000
```

### 4. Register Routes

In your `server.js` or `app.js`:

```javascript
// Import routes
const lockRoutes = require("./src/routes/locks");
const appointmentsRouter = require("./src/routes/appointments");

// Register routes
app.use("/api/locks", lockRoutes);
// Booking creation currently uses the existing appointments route
app.use("/api/appointments", appointmentsRouter);
```

### 5. Test the System

```bash
# Start backend
npm run dev

# Test health check
curl http://localhost:4000/api/locks/health

# Expected response:
# {"success":true,"healthy":true,"message":"Lock service is operational"}
```

---

## 🎯 Basic Usage

### Frontend Implementation

#### 1. Add Lock Hook to Time Slot Page

```jsx
import { useLockManager } from "@/shared/hooks/useLockManager";
import { useTenant } from "@/shared/contexts/TenantContext";

function TimeSlotPage() {
  const { tenant } = useTenant();
  const {
    acquireLock,
    releaseLock,
    lockData,
    isLocked,
    formatRemainingTime,
    error,
  } = useLockManager();

  const handleSlotClick = async (slot) => {
    const result = await acquireLock({
      tenantId: tenant.id,
      resourceId: slot.specialistId,
      date: slot.date,
      startTime: slot.time,
      duration: slot.duration,
    });

    if (result.success) {
      // Success! Proceed to checkout
      navigate("/checkout");
    } else {
      // Slot taken
      alert(
        "This slot is being booked by someone else. Please choose another."
      );
    }
  };

  return (
    <div>
      {isLocked && (
        <div className="lock-timer">
          ⏰ Your slot is reserved for: {formatRemainingTime()}
        </div>
      )}

      {error && <div className="error-message">{error.message}</div>}

      {/* Time slots */}
      <div>
        {slots.map((slot) => (
          <button key={slot.id} onClick={() => handleSlotClick(slot)}>
            {slot.time}
          </button>
        ))}
      </div>
    </div>
  );
}
```

#### 2. Update Checkout/Booking Creation

```jsx
import { api } from "@/shared/lib/apiClient";

async function createBooking(bookingData, lockId) {
  try {
    const response = await api.post("/appointments", {
      lockId, // ← Include lock ID from useLockManager
      ...bookingData,
    });

    return response.data;
  } catch (error) {
    if (error.response?.status === 409) {
      // Lock expired or invalid
      alert("Your reservation expired. Please select a time slot again.");
      navigate("/times");
    }
    throw error;
  }
}
```

---

## 🧪 Testing

### Test Lock Acquisition

```bash
curl -X POST http://localhost:4000/api/locks/acquire \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "test-tenant",
    "resourceId": "specialist-1",
    "date": "2025-03-10",
    "startTime": "14:00",
    "duration": 60
  }'
```

**Expected Response**:

```json
{
  "success": true,
  "locked": true,
  "lockId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "expiresIn": 120000,
  "expiresAt": 1710082800000
}
```

### Test Lock Conflict

Run the same command again immediately:

**Expected Response**:

```json
{
  "success": false,
  "locked": false,
  "reason": "slot_locked",
  "message": "Slot is currently locked by another user",
  "remainingTTL": 118000
}
```

### Test Booking Creation

```bash
curl -X POST http://localhost:4000/api/appointments \
  -H "Content-Type: application/json" \
  -d '{
    "lockId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "tenantId": "test-tenant",
    "specialistId": "specialist-1",
    "serviceId": "service-1",
    "date": "2025-03-10",
    "startTime": "14:00",
    "endTime": "15:00",
    "customerName": "John Doe",
    "customerEmail": "john@example.com",
    "customerPhone": "+1234567890",
    "price": 50,
    "duration": 60
  }'
```

---

## 🔍 Monitoring

### View Active Locks (Admin)

```bash
curl http://localhost:4000/api/locks/admin/active?tenantId=test-tenant \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### View Metrics (Admin)

```bash
curl http://localhost:4000/api/locks/metrics \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### Redis CLI

```bash
# Connect to Redis
redis-cli

# View all booking locks
KEYS booking_lock:*

# View specific lock
GET booking_lock:{tenant123|beautician42}:2025-03-10:14:00

# Check TTL (time to live)
TTL booking_lock:{tenant123|beautician42}:2025-03-10:14:00

# Delete specific lock (admin only)
DEL booking_lock:{tenant123|beautician42}:2025-03-10:14:00

# Delete all locks (development only!)
KEYS booking_lock:* | xargs redis-cli DEL
```

---

## 🚨 Common Issues

### Issue: Lock acquisition fails with "Connection refused"

**Solution**: Check if Redis is running

```bash
redis-cli ping
# Should return: PONG
```

### Issue: Locks never expire

**Solution**: Check Redis is configured for TTL

```bash
redis-cli
> CONFIG GET maxmemory-policy
# Should return: "allkeys-lru" or similar
```

### Issue: Frontend shows "Lock expired" immediately

**Solution**: Check system time synchronization

```bash
# Check backend time
date

# Check frontend time
# Open browser console:
new Date()

# Times should match (within a few seconds)
```

---

## 📊 Performance Tuning

### Recommended Settings

```bash
# .env
LOCK_TTL=120000           # 2 minutes (default)
LOCK_REFRESH_INTERVAL=30000  # Refresh every 30 seconds
```

### High-Traffic Scenarios

For 1000+ concurrent users:

```bash
# Increase Redis connections
REDIS_MAX_RETRY_PER_REQUEST=3
REDIS_CONNECT_TIMEOUT=10000

# Shorter TTL for faster turnover
LOCK_TTL=90000  # 90 seconds

# More frequent refresh
LOCK_REFRESH_INTERVAL=20000  # 20 seconds
```

---

## ✅ Deployment Checklist

- [ ] Redis is installed and running
- [ ] Environment variables configured
- [ ] Lock routes registered in app
- [ ] Frontend hook integrated
- [ ] Booking creation updated with lockId
- [ ] Lock cleanup on page navigation working
- [ ] Health check endpoint accessible
- [ ] Metrics endpoint secured (admin only)
- [ ] Redis persistence enabled (production)
- [ ] Monitoring dashboard set up

---

## 🎓 Next Steps

1. **Read Full Documentation**: See `REDIS_LOCK_SYSTEM.md`
2. **Implement Lock Timer UI**: Show countdown to users
3. **Add Lock Refresh UI**: Button to extend reservation
4. **Set Up Monitoring**: Dashboard for lock metrics
5. **Load Testing**: Test with 100+ concurrent users
6. **Production Deploy**: Redis cluster for high availability

---

## 🆘 Need Help?

- 📖 Full Documentation: `REDIS_LOCK_SYSTEM.md`
- 🔍 Check Redis logs: `redis-cli MONITOR`
- 📊 View metrics: `GET /api/locks/metrics`
- 🏥 Health check: `GET /api/locks/health`

---

**System is ready! 🎉** Start your backend and test lock acquisition.
