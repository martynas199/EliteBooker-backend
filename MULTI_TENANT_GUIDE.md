# Multi-Tenant SaaS Platform - Documentation

## Overview

This Beauty Booking App has been upgraded to a **fully multi-tenant SaaS platform**, allowing multiple salons to use the system independently with complete data isolation.

## Architecture

### Multi-Tenant Strategy: Tenant ID per Document

We use the **"Tenant ID per Document"** approach:

- Single database for all tenants
- Every document has a `tenantId` field
- Automatic tenant filtering via Mongoose middleware
- Complete data isolation between tenants

### Benefits

- ✅ Cost-effective (single database)
- ✅ Easy backups and maintenance
- ✅ Simpler deployment
- ✅ Efficient resource usage
- ✅ Automatic tenant filtering

---

## 🎯 Key Features

### 1. **Complete Tenant Isolation**

- Every model includes `tenantId`
- Automatic query filtering
- No cross-tenant data leakage
- Middleware enforces isolation

### 2. **Multi-Tenant Authentication**

- JWT tokens include `tenantId`
- Role-based access control:
  - `super-admin` → All tenants
  - `salon-admin` → Own salon only
  - `beautician` → Own salon, limited access
  - `customer` → Own bookings only

### 3. **Flexible Tenant Resolution**

- Custom domain: `yoursalon.com`
- Subdomain: `yoursalon.platform.com`
- Path: `platform.com/salon/yoursalon`
- JWT token
- HTTP header (`X-Tenant-ID`)

### 4. **Tenant Provisioning**

- Self-service salon registration
- Automatic tenant creation
- Default admin account
- 14-day free trial
- Stripe Connect setup

### 5. **Multi-Tenant Stripe Connect**

- Platform fee: £0.50 per booking/product
- Beautician-specific Stripe accounts
- Automatic payment routing
- Separate revenue tracking

---

## 🚀 Quick Start

### 1. Run Migration Script

Migrate existing single-tenant data to multi-tenant:

```bash
node scripts/migrate-to-multitenant.js
```

This will:

- Create a default tenant for existing data
- Add `tenantId` to all documents
- Migrate admin users
- Set up default configurations

### 2. Create a New Salon

**Endpoint:** `POST /api/tenants/create`

```json
{
  "businessName": "Luxury Beauty Salon",
  "name": "Luxury Beauty",
  "email": "info@luxurybeauty.com",
  "phone": "+44 1234 567890",
  "adminName": "Jane Smith",
  "adminEmail": "jane@luxurybeauty.com",
  "adminPassword": "SecurePass123!",
  "address": {
    "street": "123 High Street",
    "city": "London",
    "postalCode": "SW1A 1AA",
    "country": "United Kingdom"
  }
}
```

**Response:**

```json
{
  "success": true,
  "tenant": {
    "id": "60f7b...",
    "name": "Luxury Beauty",
    "slug": "luxury-beauty",
    "status": "trial",
    "isTrial": true,
    "trialEndsAt": "2025-12-10T..."
  },
  "admin": {
    "id": "60f7c...",
    "name": "Jane Smith",
    "email": "jane@luxurybeauty.com",
    "role": "salon-admin"
  },
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "onboardingUrl": "/onboarding/luxury-beauty"
}
```

---

## 📋 API Endpoints

### Tenant Management

#### Create Tenant (Public)

```
POST /api/tenants/create
Body: { businessName, name, email, adminName, adminEmail, adminPassword }
```

#### List Tenants (Super Admin)

```
GET /api/tenants
Query: ?status=active&search=luxury&page=1&limit=20
Auth: Super Admin JWT
```

#### Get Tenant

```
GET /api/tenants/:id
Auth: Salon Admin (own) or Super Admin (any)
```

#### Update Tenant

```
PUT /api/tenants/:id
Body: { name, email, branding, schedulingSettings, ... }
Auth: Salon Admin (own) or Super Admin (any)
```

#### Suspend Tenant

```
POST /api/tenants/:id/suspend
Auth: Super Admin
```

#### Activate Tenant

```
POST /api/tenants/:id/activate
Auth: Super Admin
```

#### Get Tenant by Slug (Public)

```
GET /api/tenants/slug/:slug
Returns: Public tenant info for frontend
```

---

## 🔒 Security & Isolation

### Tenant Resolution Order

1. **HTTP Header** (`X-Tenant-ID`)
2. **Custom Domain** (`yoursalon.com`)
3. **Subdomain** (`yoursalon.platform.com`)
4. **Path Parameter** (`/salon/yoursalon`)
5. **JWT Token** (`tenantId` claim)

### Automatic Query Filtering

All queries are automatically filtered by `tenantId`:

```javascript
// This query automatically includes { tenantId: req.tenantId }
const services = await Service.find({ active: true });

// Behind the scenes:
// Service.find({ active: true, tenantId: req.tenantId })
```

### Preventing Cross-Tenant Access

```javascript
// ❌ WRONG: No tenant context
const service = await Service.findById(serviceId);

// ✅ CORRECT: Tenant context from middleware
app.use(resolveTenant);
app.use(requireTenant);
const service = await Service.findById(serviceId);
// Automatically filtered by tenantId
```

### Manual Tenant Context (Advanced)

```javascript
import { setTenantContext } from "./middleware/multiTenantPlugin.js";

// Set tenant context for a specific query
const query = Service.find({ active: true });
setTenantContext(query, tenantId);
const services = await query.exec();
```

---

## 👥 User Roles & Permissions

### Role Hierarchy

```
super-admin (Platform Owner)
  └── salon-admin (Salon Owner)
      ├── beautician (Staff)
      └── customer (Client)
```

### Permissions Matrix

| Feature            | Super Admin | Salon Admin    | Beautician | Customer  |
| ------------------ | ----------- | -------------- | ---------- | --------- |
| View all tenants   | ✅          | ❌             | ❌         | ❌        |
| Manage own salon   | ✅          | ✅             | ❌         | ❌        |
| Manage beauticians | ✅          | ✅             | ❌         | ❌        |
| Manage services    | ✅          | ✅             | View only  | View only |
| View appointments  | ✅          | ✅ (own salon) | ✅ (own)   | ✅ (own)  |
| Manage products    | ✅          | ✅             | ✅ (own)   | ❌        |
| View revenue       | ✅          | ✅ (own salon) | ✅ (own)   | ❌        |

---

## 💳 Multi-Tenant Payments

### Stripe Connect Architecture

```
Customer Payment
    ↓
Platform (£0.50 fee)
    ↓
Beautician (remaining amount)
```

### Payment Flow

1. **Customer books service** → £50.00
2. **Platform fee** → £0.50
3. **Stripe fee** → ~£1.45 (2.9% + 20p)
4. **Beautician receives** → £48.05

### Configuration

```javascript
// Service payment
const paymentIntent = await stripe.paymentIntents.create({
  amount: 5000, // £50.00
  currency: "gbp",
  application_fee_amount: 50, // £0.50
  transfer_data: {
    destination: beautician.stripeAccountId,
  },
});
```

### Product Payment

```javascript
// Product payment (same structure)
const paymentIntent = await stripe.paymentIntents.create({
  amount: productTotal,
  currency: "gbp",
  application_fee_amount: 50, // £0.50 per product/order
  transfer_data: {
    destination: product.beauticianId.stripeAccountId,
  },
});
```

---

## 🎨 Tenant Branding

Each tenant can customize:

```javascript
{
  branding: {
    logo: { url, id, provider },
    primaryColor: "#3B82F6",
    secondaryColor: "#10B981",
    accentColor: "#F59E0B",
    favicon: { url, publicId },
    heroImages: [...]
  }
}
```

### Applying Branding (Frontend)

```javascript
const tenant = await fetch(`/api/tenants/slug/${slug}`);
document.documentElement.style.setProperty(
  "--primary-color",
  tenant.branding.primaryColor
);
```

---

## 📅 Multi-Tenant Booking

### Tenant-Specific Logic

- **Working hours** → Per tenant + per beautician
- **Cancellation policy** → Per tenant or beautician
- **Time zones** → Per tenant
- **Buffer times** → Per tenant settings
- **Max advance booking** → Per tenant

### Time Slot Generation

```javascript
// Automatically respects tenant boundaries
const slots = await getAvailableSlots({
  beauticianId,
  serviceId,
  date,
  // tenantId automatically from req.tenantId
});
```

---

## 🌍 Custom Domains

### Setup Process

1. **Add domain to tenant**

```javascript
PUT /api/tenants/:id
{
  "domains": [{
    "domain": "luxurybeauty.com",
    "isPrimary": true,
    "verified": false
  }]
}
```

2. **Generate verification token**

```javascript
const token = tenant.generateDomainVerificationToken();
```

3. **DNS Configuration** (Customer side)

```
Type: CNAME
Name: @
Value: platform.yourdomain.com
```

4. **Verify domain**

```javascript
POST /api/tenants/:id/domains/:domainId/verify
```

---

## 📊 Tenant Analytics

### Per-Tenant Metrics

```javascript
GET /api/analytics/tenant/:tenantId
```

Returns:

- Total bookings
- Total revenue
- Active beauticians
- Customer count
- Product sales
- Growth metrics

---

## 🧪 Testing Multi-Tenant

### Test Tenant Isolation

```javascript
// Create two test tenants
const tenant1 = await createTenant({ name: "Salon A" });
const tenant2 = await createTenant({ name: "Salon B" });

// Create service for tenant 1
const service1 = await Service.create({
  name: "Haircut",
  tenantId: tenant1._id,
});

// Try to access from tenant 2 context
req.tenantId = tenant2._id;
const services = await Service.find(); // Should NOT include service1
```

### Security Tests

```bash
npm run test:security
```

Runs:

- Cross-tenant access tests
- Permission boundary tests
- Data isolation tests

---

## 🔧 Troubleshooting

### Issue: Documents not filtering by tenant

**Solution:** Ensure tenant resolution middleware is active:

```javascript
app.use(resolveTenant);
app.use(requireTenant); // For protected routes
```

### Issue: "tenantId is required" error

**Solution:** Check JWT token includes tenantId:

```javascript
const token = jwt.sign(
  {
    id: admin._id,
    tenantId: admin.tenantId, // ← Must include this
    role: admin.role,
  },
  JWT_SECRET
);
```

### Issue: Cross-tenant data leakage

**Solution:** Verify plugin is applied to all models:

```javascript
import { multiTenantPlugin } from "./middleware/multiTenantPlugin.js";
schema.plugin(multiTenantPlugin);
```

---

## 📝 Environment Variables

```env
# Multi-Tenant Configuration
PLATFORM_DOMAIN=nobleelegance.co.uk
DEFAULT_TENANT_SLUG=noble-elegance
DEFAULT_BUSINESS_NAME=Noble Elegance
DEFAULT_SALON_NAME=Noble Elegance Beauty Salon
DEFAULT_TENANT_EMAIL=info@nobleelegance.co.uk
DEFAULT_TENANT_PHONE=+44 1945 123456

# Stripe Connect
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PLATFORM_FEE=50  # £0.50 in pence

# JWT
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRES_IN=7d
```

---

## 🚀 Deployment

### 1. Update Database Schema

```bash
node scripts/migrate-to-multitenant.js
```

### 2. Set Environment Variables

Configure all required env vars for your platform.

### 3. Deploy Application

```bash
npm run build
npm start
```

### 4. DNS Configuration

Point platform domain to your server:

```
A Record: platform.yourdomain.com → Your Server IP
```

---

## 📚 Additional Resources

- [Stripe Connect Documentation](https://stripe.com/docs/connect)
- [Multi-Tenant Best Practices](https://docs.mongodb.com/manual/core/security-client-side-field-level-encryption/)
- [JWT Authentication](https://jwt.io/)

---

## ⚠️ Important Notes

1. **Always run migration script on a backup first**
2. **Test tenant isolation thoroughly before production**
3. **Monitor cross-tenant queries in logs**
4. **Set up proper monitoring and alerts**
5. **Regular security audits recommended**

---

## 📞 Support

For issues or questions about the multi-tenant system:

- Check logs in `logs/` directory
- Review security settings
- Test with provided test scripts
- Verify tenant resolution is working

---

## 🎉 Success!

You now have a fully functional multi-tenant SaaS platform! Each salon can:

- Sign up independently
- Manage their own data
- Customize their branding
- Accept payments via Stripe Connect
- Scale infinitely on your platform

**Next Steps:**

1. Run the migration script
2. Test tenant creation
3. Configure custom domains
4. Set up monitoring
5. Launch your SaaS platform! 🚀
