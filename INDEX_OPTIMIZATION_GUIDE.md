# Database Index Optimization Guide

## Overview

This document provides index recommendations for optimal query performance based on common access patterns in the booking application.

## Existing Indexes (Already Implemented)

### Appointment Model

```javascript
AppointmentSchema.index({ specialistId: 1, start: 1 }); ✅
AppointmentSchema.index({ specialistId: 1, start: 1, status: 1 }); ✅
AppointmentSchema.index({ start: 1, end: 1 }); ✅
AppointmentSchema.index({ status: 1, start: 1 }); ✅
AppointmentSchema.index({ userId: 1, start: -1 }); ✅
AppointmentSchema.index({ "client.email": 1 }); ✅
AppointmentSchema.index({ createdAt: -1 }); ✅
AppointmentSchema.index({ tenantId: 1, start: -1 }); ✅ (Multi-tenant queries)
AppointmentSchema.index({ "reminder.sent": 1, status: 1, start: 1 }); ✅ (Reminder cron)
```

### Service Model

```javascript
ServiceSchema.index({ primaryBeauticianId: 1, active: 1 }); ✅
ServiceSchema.index({ additionalBeauticianIds: 1, active: 1 }); ✅
ServiceSchema.index({ category: 1, active: 1 }); ✅
ServiceSchema.index({ active: 1, createdAt: -1 }); ✅
ServiceSchema.index({ name: "text", description: "text" }); ✅
ServiceSchema.index({ tenantId: 1, active: 1 }); ✅ (Multi-tenant queries)
```

## Recommended New Indexes

### 1. Tenant Model

**Purpose:** Optimize public tenant listing and search queries

```javascript
// For public tenant searches (status + isPublic filtering)
TenantSchema.index({ status: 1, isPublic: 1, createdAt: -1 });

// For admin tenant management with search filters
TenantSchema.index({ status: 1, businessName: 1 });
TenantSchema.index({ email: 1 }); // Email lookups

// For location-based searches (if using geo queries)
TenantSchema.index({ location: "2dsphere" });
```

### 2. BlogPost Model

**Purpose:** Optimize public and admin blog post queries

```javascript
// Public blog listing (published only, sorted by publish date)
BlogPostSchema.index({ status: 1, publishedAt: -1 });

// Tag-based filtering for public posts
BlogPostSchema.index({ status: 1, tags: 1, publishedAt: -1 });

// Admin queries (all statuses, by creation date)
BlogPostSchema.index({ status: 1, createdAt: -1 });

// Multi-tenant blog posts
BlogPostSchema.index({ tenantId: 1, status: 1, publishedAt: -1 });
```

### 3. Order Model

**Purpose:** Optimize order listing and filtering

```javascript
// Order status queries
OrderSchema.index({ orderStatus: 1, createdAt: -1 });

// Payment status filtering
OrderSchema.index({ paymentStatus: 1, createdAt: -1 });

// Combined status filtering
OrderSchema.index({ orderStatus: 1, paymentStatus: 1, createdAt: -1 });

// User order history
OrderSchema.index({ userId: 1, createdAt: -1 });

// Multi-tenant orders
OrderSchema.index({ tenantId: 1, orderStatus: 1, createdAt: -1 });
```

### 4. Client Model

**Purpose:** Optimize global client lookups

```javascript
// Email uniqueness and lookups (should already exist as unique)
ClientSchema.index({ email: 1 }, { unique: true }); ✅ (Verify exists)

// Activity tracking
ClientSchema.index({ lastActivity: -1 });

// Active client queries
ClientSchema.index({ isActive: 1, lastActivity: -1 });
```

### 5. TenantClient Model

**Purpose:** Optimize tenant-specific client relationships

```javascript
// Tenant client lookups (likely exists)
TenantClientSchema.index({ tenantId: 1, clientId: 1 }); ✅ (Verify)

// Global client tenant relationships
TenantClientSchema.index({ clientId: 1 });
```

### 6. Location Model

**Purpose:** Optimize multi-location queries

```javascript
// Active locations per tenant
LocationSchema.index({ tenantId: 1, isActive: 1, displayOrder: 1 });

// Primary location lookup
LocationSchema.index({ tenantId: 1, isPrimary: 1 });

// Slug-based lookups
LocationSchema.index({ tenantId: 1, slug: 1 }, { unique: true });
```

### 7. Specialist Model

**Purpose:** Optimize specialist queries with locations

```javascript
// Tenant specialists
SpecialistSchema.index({ tenantId: 1, isActive: 1 });

// Location-based specialist queries
SpecialistSchema.index({ tenantId: 1, locationIds: 1, isActive: 1 });

// Admin specialist linking
SpecialistSchema.index({ adminId: 1 });
```

## Index Maintenance Commands

### Check Existing Indexes

```javascript
// In MongoDB shell or script
db.appointments.getIndexes();
db.services.getIndexes();
db.tenants.getIndexes();
db.blogposts.getIndexes();
db.orders.getIndexes();
```

### Create Missing Indexes (MongoDB Shell)

```javascript
// Example: Create tenant indexes
db.tenants.createIndex({ status: 1, isPublic: 1, createdAt: -1 });
db.tenants.createIndex({ status: 1, businessName: 1 });

// Example: Create blog post indexes
db.blogposts.createIndex({ status: 1, publishedAt: -1 });
db.blogposts.createIndex({ status: 1, tags: 1, publishedAt: -1 });

// Example: Create order indexes
db.orders.createIndex({ orderStatus: 1, createdAt: -1 });
db.orders.createIndex({ paymentStatus: 1, createdAt: -1 });
```

### Monitor Index Usage

```javascript
// Check index statistics
db.appointments.aggregate([{ $indexStats: {} }]);

// Analyze slow queries
db.setProfilingLevel(1, { slowms: 100 });
db.system.profile.find().limit(10).sort({ ts: -1 }).pretty();
```

## Performance Impact Estimates

### High Impact (Immediate Improvement)

- ✅ Appointment reminder queries: Already optimized
- 🔥 Tenant public listing: `{ status: 1, isPublic: 1, createdAt: -1 }`
- 🔥 Order filtering: `{ orderStatus: 1, paymentStatus: 1, createdAt: -1 }`

### Medium Impact (20-50% improvement)

- BlogPost public queries with tags
- Location-based specialist filtering
- Admin tenant search queries

### Low Impact (Marginal gains)

- Text search indexes (already exist)
- Single-field indexes on low-cardinality fields

## Query Pattern Analysis

### Most Frequent Queries (Based on Code Review)

1. **Appointments by specialist and date range**
   - Index: `{ specialistId: 1, start: 1, status: 1 }` ✅
   - Used in: Slot generation, specialist schedules

2. **Services by tenant and active status**
   - Index: `{ tenantId: 1, active: 1 }` ✅
   - Used in: Service listing, booking flows

3. **Orders by status and date**
   - Index: `{ orderStatus: 1, createdAt: -1 }` ⚠️ RECOMMENDED
   - Used in: Admin order management, reporting

4. **Public tenants**
   - Index: `{ status: 1, isPublic: 1, createdAt: -1 }` ⚠️ RECOMMENDED
   - Used in: Public search, landing pages

5. **Reminder cron queries**
   - Index: `{ "reminder.sent": 1, status: 1, start: 1 }` ✅
   - Used in: Hourly reminder processing

## Compound Index Design Guidelines

### Index Order Rules

1. **Equality first**: Fields with exact match queries come first
2. **Sort last**: Sort fields should be last in compound index
3. **Range middle**: Range queries ($gt, $lt, $gte, $lte) in the middle

### Example

```javascript
// Good: Equality (status) → Range (start) → Sort (createdAt)
{ status: 1, start: { $gte: Date }, createdAt: -1 }
// Index: { status: 1, start: 1, createdAt: -1 }

// Bad: Sort first makes range queries inefficient
{ createdAt: -1, status: 1, start: 1 }
```

## Cost vs Benefit Analysis

### Write Performance Impact

- Each index adds ~10-20% overhead to write operations
- Recommendation: Don't index low-cardinality fields alone (e.g., `active: 1`)
- Use compound indexes to cover multiple query patterns

### Storage Impact

- Each index consumes ~15-25% of collection size
- Monitor with: `db.stats()` and `db.collection.stats()`

### Read Performance Gains

- Simple index: 100-1000x faster for covered queries
- Compound index: 50-500x faster for multi-field queries
- Covered query (projection matches index): 1000-10000x faster

## Migration Script Template

```javascript
// scripts/add-recommended-indexes.js
import mongoose from "mongoose";
import Tenant from "../src/models/Tenant.js";
import BlogPost from "../src/models/BlogPost.js";
import Order from "../src/models/Order.js";

async function addIndexes() {
  try {
    console.log("Adding recommended indexes...");

    // Tenant indexes
    await Tenant.collection.createIndex({
      status: 1,
      isPublic: 1,
      createdAt: -1,
    });
    console.log("✅ Tenant indexes created");

    // BlogPost indexes
    await BlogPost.collection.createIndex({ status: 1, publishedAt: -1 });
    await BlogPost.collection.createIndex({
      status: 1,
      tags: 1,
      publishedAt: -1,
    });
    console.log("✅ BlogPost indexes created");

    // Order indexes
    await Order.collection.createIndex({ orderStatus: 1, createdAt: -1 });
    await Order.collection.createIndex({ paymentStatus: 1, createdAt: -1 });
    await Order.collection.createIndex({
      orderStatus: 1,
      paymentStatus: 1,
      createdAt: -1,
    });
    console.log("✅ Order indexes created");

    console.log("All indexes created successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Index creation failed:", error);
    process.exit(1);
  }
}

addIndexes();
```

## Environment Variables

```bash
# .env.example
# Enable verbose logging for debugging queries
LOG_VERBOSE=false

# MongoDB profiling (production: use with caution)
MONGO_PROFILE_SLOW_MS=750
```

## Monitoring Recommendations

1. **Enable slow query logging** (>750ms)
2. **Track index hit ratio** (should be >95%)
3. **Monitor collection scan ratio** (should be <5%)
4. **Set up alerts** for queries >1000ms

## Next Steps

1. ✅ Review existing indexes in each model
2. ⚠️ Add recommended indexes to model schemas
3. ⚠️ Run migration script in staging environment
4. ⚠️ Monitor query performance before/after
5. ⚠️ Deploy to production with monitoring

## Resources

- [MongoDB Index Strategies](https://docs.mongodb.com/manual/applications/indexes/)
- [Mongoose Index Documentation](https://mongoosejs.com/docs/guide.html#indexes)
- [Query Performance Analysis](https://docs.mongodb.com/manual/tutorial/analyze-query-plan/)
