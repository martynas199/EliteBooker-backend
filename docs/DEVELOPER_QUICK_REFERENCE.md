# Multi-Tenant Platform - Developer Quick Reference

**Last Updated:** January 2025  
**Platform Version:** 2.0

> Quick reference for developers working with the multi-tenant beauty booking platform

---

## 🚀 Quick Start (5 Minutes)

### 1. Clone & Install

```bash
# Clone repo
git clone https://github.com/yourusername/booking-app.git
cd booking-app

# Install backend
cd booking-backend
npm install

# Install frontend
cd ../booking-frontend
npm install
```

### 2. Environment Setup

**Backend (.env):**

```env
MONGODB_URI=mongodb://localhost:27017/beauty-booking-multitenant
JWT_SECRET=your-secret-key
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_CONNECT_CLIENT_ID=ca_...
FRONTEND_URL=http://localhost:5173
```

**Frontend (.env):**

```env
VITE_API_URL=http://localhost:4000/api
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

### 3. Run

```bash
# Terminal 1: Backend
cd booking-backend
npm run dev

# Terminal 2: Frontend
cd booking-frontend
npm run dev
```

**Access:**

- Frontend: http://localhost:5173
- Backend API: http://localhost:4000
- Signup: http://localhost:5173/signup

---

## 📁 Project Structure (Key Files)

```
booking-app/
├── booking-backend/
│   ├── src/
│   │   ├── models/
│   │   │   └── Tenant.js           ⭐ Core tenant model
│   │   ├── middleware/
│   │   │   ├── multiTenantPlugin.js  ⭐ Auto-filtering
│   │   │   ├── resolveTenant.js      ⭐ Tenant detection
│   │   │   └── auth.js                JWT + roles
│   │   ├── routes/
│   │   │   ├── tenants.js            ⭐ Tenant CRUD
│   │   │   ├── checkout.js           Stripe payments
│   │   │   ├── specialists.js        Stripe Connect
│   │   │   └── webhooks.js           Stripe webhooks
│   │   └── server.js
│   ├── scripts/
│   │   └── migrate-to-multitenant.js ⭐ Migration tool
│   └── docs/
│       ├── STRIPE_CONNECT_SETUP.md   📚 Payment guide
│       ├── DEPLOYMENT_GUIDE.md       📚 Deploy instructions
│       └── API_REFERENCE.md          📚 API docs
│
└── booking-frontend/
    ├── src/
    │   ├── contexts/
    │   │   └── TenantContext.jsx     ⭐ Tenant state
    │   ├── pages/
    │   │   └── TenantSignup.jsx      ⭐ Registration
    │   ├── admin/
    │   │   └── pages/
    │   │       ├── TenantSettings.jsx  Admin settings
    │   │       ├── BrandingSettings.jsx Branding
    │   │       └── Tenants.jsx         Super admin
    │   └── lib/
    │       └── api.js                  ⭐ API client
    └── ...

⭐ = Critical multi-tenant files
📚 = Essential documentation
```

---

## 🔑 Core Concepts

### 1. Tenant Resolution (5 Methods)

```javascript
// Priority order:
1. HTTP Header:     X-Tenant-ID: 507f1f77...
2. Custom Domain:   elegantbeauty.com
3. Subdomain:       elegant-beauty.platform.com
4. Path Parameter:  /salon/elegant-beauty-salon
5. JWT Token:       { tenantId: "507f1f77..." }
```

### 2. Automatic Data Filtering

```javascript
// ✅ All models auto-filter by tenant
const appointments = await Appointment.find();
// Automatically returns only current tenant's data

// ✅ No manual filtering needed
const service = await Service.findById(serviceId);
// Returns null if service belongs to different tenant

// ✅ Cross-tenant access prevented
const otherTenantService = await Service.findById(otherServiceId);
// Returns null even with valid ID
```

### 3. JWT Token Structure

```json
{
  "id": "user-id-here",
  "tenantId": "tenant-id-here",
  "role": "salon-admin",
  "iat": 1234567890,
  "exp": 1234654290
}
```

**4 Roles:**

- `super-admin` - Platform-wide access
- `salon-admin` - Full tenant management
- `specialist` - Own schedule only
- `customer` - Booking only

---

## 💻 Common Code Patterns

### Create Tenant (Self-Service)

```javascript
// POST /api/tenants/create
const response = await fetch("http://localhost:4000/api/tenants/create", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    businessInfo: {
      name: "Elegant Beauty Salon",
      email: "contact@elegant-beauty.com",
      phone: "+441234567890",
    },
    adminAccount: {
      name: "Sarah Johnson",
      email: "sarah@elegant-beauty.com",
      password: "SecurePass123!",
    },
  }),
});

const { tenant, admin, token } = await response.json();
// Save token to localStorage
localStorage.setItem("token", token);
localStorage.setItem("tenantId", tenant._id);
```

### Tenant-Scoped API Call

```javascript
// Frontend: Automatically includes tenant header
import api from "@/lib/api";

// ✅ X-Tenant-ID header added automatically
const appointments = await api.get("/appointments");

// Backend: Automatically filtered
router.get("/", requireTenant, async (req, res) => {
  // req.tenant = { _id: "...", slug: "...", ... }
  const appointments = await Appointment.find(); // Auto-filtered
  res.json(appointments);
});
```

### Create Model with Tenant

```javascript
// Backend route
router.post("/", requireTenant, requireAuth, async (req, res) => {
  const { name, duration, price } = req.body;

  const service = await Service.create({
    name,
    duration,
    price,
    // tenantId automatically added by multiTenantPlugin
  });

  res.status(201).json(service);
});
```

### Stripe Connect Onboarding

```javascript
// Backend: Create Connect account
router.post(
  "/:id/stripe/onboard",
  requireTenant,
  requireAdmin,
  async (req, res) => {
    const specialist = await Beautician.findById(req.params.id);

    // Create Connect account
    const account = await stripe.accounts.create({
      type: "express",
      email: specialist.email,
      metadata: {
        beauticianId: specialist._id.toString(),
        tenantId: req.tenant._id.toString(),
      },
    });

    // Create onboarding link
    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: `${process.env.FRONTEND_URL}/admin/staff`,
      return_url: `${process.env.FRONTEND_URL}/admin/staff?stripe=success`,
      type: "account_onboarding",
    });

    // Save account ID
    specialist.stripeAccountId = account.id;
    specialist.stripeStatus = "pending";
    await specialist.save();

    res.json({ url: accountLink.url });
  }
);

// Frontend: Redirect to Stripe
const handleStripeConnect = async (beauticianId) => {
  const { url } = await api.post(`/specialists/${beauticianId}/stripe/onboard`);
  window.location.href = url; // Redirects to Stripe onboarding
};
```

### Payment with Platform Fee

```javascript
// Backend: Create checkout session
router.post("/", requireTenant, async (req, res) => {
  const { appointmentId } = req.body;
  const appointment = await Appointment.findById(appointmentId);
  const specialist = await Beautician.findById(appointment.specialist);

  // Calculate platform fee
  const platformFee = req.tenant.paymentSettings.platformFeePerBooking || 50; // £0.50

  // Create Stripe session (platform collects)
  const session = await getStripe().checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "gbp",
          unit_amount: appointment.totalPrice,
          product_data: { name: `Appointment - ${appointment.service.name}` },
        },
        quantity: 1,
      },
    ],
    payment_intent_data: {
      application_fee_amount: platformFee, // Platform fee
      transfer_data: {
        destination: specialist.stripeAccountId, // Transfer to specialist
      },
      metadata: {
        appointmentId: appointment._id.toString(),
        tenantId: req.tenant._id.toString(),
        platformFee: platformFee.toString(),
      },
    },
    mode: "payment",
    success_url: `${process.env.FRONTEND_URL}/booking/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.FRONTEND_URL}/booking/cancel`,
  });

  res.json({ url: session.url });
});
```

---

## 🧪 Testing Commands

```bash
# All tests (29 total)
npm test

# Unit tests only (8 tests)
npm run test:unit

# Integration tests only (8 tests)
npm run test:integration

# E2E tests only (13 tests)
npm run test:e2e

# With coverage
npm run test:coverage

# Watch mode
npm test -- --watch
```

**Expected Output:**

```
Test Suites: 3 passed, 3 total
Tests:       29 passed, 29 total
Time:        8.432 s
```

---

## 🔍 Debugging

### Check Tenant Context

```javascript
// Backend: Log tenant in route
router.get("/debug", requireTenant, (req, res) => {
  console.log("Current Tenant:", req.tenant);
  res.json({ tenant: req.tenant });
});

// Frontend: Check TenantContext
import { useTenant } from "@/contexts/TenantContext";

function MyComponent() {
  const { tenant, loading } = useTenant();
  console.log("Current Tenant:", tenant);
  return <div>{tenant?.businessInfo?.name}</div>;
}
```

### Verify Query Filtering

```javascript
// Check if multiTenantPlugin is applied
const schema = mongoose.model("Appointment").schema;
console.log("Has multiTenant:", schema.statics.setTenantContext !== undefined);

// Log queries (development only)
mongoose.set("debug", true); // Shows all queries with filters
```

### Test Stripe Webhooks Locally

```bash
# Install Stripe CLI
# https://stripe.com/docs/stripe-cli

# Login
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:4000/api/webhooks/stripe

# Trigger test events
stripe trigger payment_intent.succeeded
stripe trigger checkout.session.completed
```

### Check Platform Fees

```javascript
// Query total platform fees collected
const totalFees = await Appointment.aggregate([
  {
    $match: {
      "payment.status": "succeeded",
      createdAt: { $gte: new Date("2025-01-01") },
    },
  },
  {
    $group: {
      _id: null,
      total: { $sum: "$payment.stripe.platformFee" },
    },
  },
]);

console.log(`Total Platform Revenue: £${totalFees[0].total / 100}`);
```

---

## 🐛 Common Issues & Fixes

### Issue: Tenant not resolving

**Symptoms:** 401 Unauthorized or "Tenant context required"

**Solutions:**

```javascript
// ✅ Check header is sent
fetch("/api/appointments", {
  headers: { "X-Tenant-ID": tenantId },
});

// ✅ Or use path parameter
fetch(`/salon/${slug}/appointments`);

// ✅ Or ensure JWT token includes tenantId
const decoded = jwt.verify(token, process.env.JWT_SECRET);
console.log(decoded.tenantId); // Should exist
```

### Issue: Cross-tenant data visible

**Critical Security Issue!**

**Debug:**

```javascript
// Check if plugin is applied
const Appointment = require("./models/Appointment");
console.log(
  "Has setTenantContext:",
  typeof Appointment.setTenantContext === "function"
);

// Verify tenantId field exists
const appointment = await Appointment.findOne();
console.log("Has tenantId:", appointment.tenantId !== undefined);

// Check pre-hooks exist
const schema = Appointment.schema;
console.log("Pre-hooks:", schema.s.hooks._pres.keys());
// Should include: find, findOne, updateOne, etc.
```

### Issue: Stripe Connect onboarding fails

**Symptoms:** Error creating account or account link

**Solutions:**

```bash
# ✅ Check environment variables
echo $STRIPE_CONNECT_CLIENT_ID
# Should be: ca_...

# ✅ Verify Stripe API version
curl https://api.stripe.com/v1/account \
  -u sk_test_...: \
  -H "Stripe-Version: 2023-10-16"

# ✅ Check account creation
const account = await stripe.accounts.retrieve('acct_...');
console.log('Charges enabled:', account.charges_enabled);
console.log('Payouts enabled:', account.payouts_enabled);
```

### Issue: Platform fee not collected

**Symptoms:** Full amount transferred to specialist

**Debug:**

```javascript
// Check payment intent
const intent = await stripe.paymentIntents.retrieve("pi_...");
console.log("Application Fee:", intent.application_fee_amount); // Should be 50 (£0.50)
console.log("Transfer Data:", intent.transfer_data); // Should have destination

// Verify in database
const appointment = await Appointment.findById(appointmentId);
console.log("Platform Fee:", appointment.payment.stripe.platformFee); // Should be 50
```

---

## 📊 Useful Database Queries

### Count Tenants by Status

```javascript
db.tenants.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]);

// Result:
// [
//   { _id: "active", count: 45 },
//   { _id: "trial", count: 12 },
//   { _id: "suspended", count: 3 }
// ]
```

### Find Orphaned Data (Missing tenantId)

```javascript
// Critical: Should return 0
db.appointments.find({ tenantId: { $exists: false } }).count();
db.services.find({ tenantId: { $exists: false } }).count();
db.specialists.find({ tenantId: { $exists: false } }).count();

// If any found, run migration:
node scripts/migrate-to-multitenant.js
```

### Platform Revenue Report

```javascript
db.appointments.aggregate([
  {
    $match: {
      "payment.status": "succeeded",
      createdAt: {
        $gte: ISODate("2025-01-01"),
        $lte: ISODate("2025-01-31"),
      },
    },
  },
  {
    $group: {
      _id: null,
      totalRevenue: { $sum: "$payment.amount" },
      platformFees: { $sum: "$payment.stripe.platformFee" },
      count: { $sum: 1 },
    },
  },
  {
    $project: {
      totalRevenue: { $divide: ["$totalRevenue", 100] },
      platformFees: { $divide: ["$platformFees", 100] },
      count: 1,
    },
  },
]);
```

### Top Earning Tenants

```javascript
db.appointments.aggregate([
  {
    $match: { "payment.status": "succeeded" },
  },
  {
    $group: {
      _id: "$tenantId",
      totalRevenue: { $sum: "$payment.amount" },
      bookings: { $sum: 1 },
    },
  },
  {
    $lookup: {
      from: "tenants",
      localField: "_id",
      foreignField: "_id",
      as: "tenant",
    },
  },
  {
    $unwind: "$tenant",
  },
  {
    $sort: { totalRevenue: -1 },
  },
  {
    $limit: 10,
  },
  {
    $project: {
      name: "$tenant.businessInfo.name",
      totalRevenue: { $divide: ["$totalRevenue", 100] },
      bookings: 1,
    },
  },
]);
```

---

## 🔗 Essential Links

| Resource                 | URL                                                         |
| ------------------------ | ----------------------------------------------------------- |
| **Frontend Dev**         | http://localhost:5173                                       |
| **Backend API**          | http://localhost:4000                                       |
| **API Docs**             | [docs/API_REFERENCE.md](./API_REFERENCE.md)                 |
| **Stripe Connect Guide** | [docs/STRIPE_CONNECT_SETUP.md](./STRIPE_CONNECT_SETUP.md)   |
| **Deployment Guide**     | [docs/DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)           |
| **Testing Checklist**    | [docs/E2E_TESTING_CHECKLIST.md](./E2E_TESTING_CHECKLIST.md) |
| **Stripe Dashboard**     | https://dashboard.stripe.com/test/dashboard                 |
| **Stripe CLI Docs**      | https://stripe.com/docs/stripe-cli                          |

---

## 💡 Pro Tips

### 1. Use TenantContext Hook

```javascript
// ✅ Good: Use hook
import { useTenant } from "@/contexts/TenantContext";

function MyComponent() {
  const { tenant, loading } = useTenant();
  if (loading) return <LoadingSpinner />;
  return <div style={{ color: tenant.branding.colors.primary }}>...</div>;
}

// ❌ Bad: Manual fetch
function MyComponent() {
  const [tenant, setTenant] = useState(null);
  useEffect(() => {
    fetch("/api/tenants/...")
      .then((r) => r.json())
      .then(setTenant);
  }, []);
  // Duplicates context logic
}
```

### 2. Always Use api.js Client

```javascript
// ✅ Good: Uses centralized client (auto-adds headers)
import api from "@/lib/api";
const data = await api.get("/appointments");

// ❌ Bad: Direct fetch (missing tenant header)
const data = await fetch("http://localhost:4000/api/appointments").then((r) =>
  r.json()
);
```

### 3. Test Tenant Isolation

```javascript
// Every new feature should verify isolation
describe("New Feature", () => {
  it("prevents cross-tenant access", async () => {
    const tenant1 = await createTenant({ name: "Tenant 1" });
    const tenant2 = await createTenant({ name: "Tenant 2" });

    const resource1 = await createResource({ tenantId: tenant1._id });

    // Try to access with tenant2 context
    const response = await request(app)
      .get(`/api/resources/${resource1._id}`)
      .set("X-Tenant-ID", tenant2._id);

    expect(response.status).toBe(404); // Should not find
  });
});
```

### 4. Monitor Platform Fees

```javascript
// Add to admin dashboard
const getPlatformMetrics = async () => {
  const metrics = await Appointment.aggregate([
    { $match: { "payment.status": "succeeded" } },
    {
      $group: {
        _id: null,
        totalFees: { $sum: "$payment.stripe.platformFee" },
        totalRevenue: { $sum: "$payment.amount" },
        bookings: { $sum: 1 },
      },
    },
  ]);

  return {
    totalFeesGBP: metrics[0].totalFees / 100,
    totalRevenueGBP: metrics[0].totalRevenue / 100,
    bookings: metrics[0].bookings,
    avgFeePerBooking: metrics[0].totalFees / metrics[0].bookings / 100,
  };
};
```

---

## 🚨 Security Checklist

Before deploying:

- [ ] All models have `multiTenantPlugin` applied
- [ ] All routes use `requireTenant` middleware
- [ ] JWT tokens include `tenantId` field
- [ ] Rate limiting configured (100/15min public, 1000/15min auth)
- [ ] CORS configured for production domains
- [ ] Stripe webhook signature verification enabled
- [ ] Environment variables not committed to git
- [ ] Database backups scheduled
- [ ] Monitoring enabled (Sentry, logs)
- [ ] Cross-tenant isolation tested (29 tests passing)

---

## 📞 Need Help?

1. **Check Documentation:**

   - [API Reference](./API_REFERENCE.md)
   - [Stripe Connect Setup](./STRIPE_CONNECT_SETUP.md)
   - [Deployment Guide](./DEPLOYMENT_GUIDE.md)

2. **Search Issues:**

   - GitHub Issues: https://github.com/yourusername/booking-app/issues

3. **Ask for Help:**
   - Create new issue with: error message, steps to reproduce, environment details

---

_Quick Reference v1.0 - Last Updated: January 2025_
