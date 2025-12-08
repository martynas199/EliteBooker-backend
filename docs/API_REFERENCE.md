# Multi-Tenant API Reference

Complete API documentation for multi-tenant endpoints.

## Table of Contents

1. [Authentication](#authentication)
2. [Tenant Management](#tenant-management)
3. [Tenant Resolution](#tenant-resolution)
4. [Beautician Stripe Connect](#specialist-stripe-connect)
5. [Admin Routes](#admin-routes)
6. [Error Codes](#error-codes)

---

## Authentication

### JWT Token Structure

Multi-tenant JWT tokens include:

```json
{
  "id": "user_id",
  "tenantId": "tenant_id",
  "role": "salon-admin | specialist | customer | super-admin",
  "iat": 1234567890,
  "exp": 1234567890
}
```

### Headers

All authenticated requests require:

```http
Authorization: Bearer <jwt_token>
X-Tenant-ID: <tenant_id>  (optional, overrides JWT)
```

---

## Tenant Management

### Create Tenant (Signup)

Creates a new tenant with admin account.

**Endpoint:** `POST /api/tenants/create`

**Auth Required:** No

**Request Body:**

```json
{
  "businessName": "My Beauty Salon",
  "email": "contact@mybeautysalon.com",
  "phone": "+441234567890",
  "address": "123 Beauty Street",
  "city": "London",
  "postalCode": "SW1A 1AA",
  "country": "UK",
  "adminName": "Salon Owner",
  "adminEmail": "owner@mybeautysalon.com",
  "adminPassword": "SecurePass123!"
}
```

**Response:** `201 Created`

```json
{
  "tenant": {
    "_id": "tenant_id",
    "slug": "my-beauty-salon",
    "businessInfo": {
      "name": "My Beauty Salon",
      "email": "contact@mybeautysalon.com",
      "phone": "+441234567890",
      "address": "123 Beauty Street",
      "city": "London",
      "postalCode": "SW1A 1AA",
      "country": "UK"
    },
    "status": "active",
    "createdAt": "2025-11-26T10:00:00.000Z"
  },
  "admin": {
    "_id": "admin_id",
    "name": "Salon Owner",
    "email": "owner@mybeautysalon.com",
    "role": "salon-admin",
    "tenantId": "tenant_id"
  },
  "token": "jwt_token_here"
}
```

**Errors:**

- `400` - Validation error (missing fields, invalid email, weak password)
- `409` - Email already exists
- `409` - Slug already taken

---

### Get Tenant by ID

**Endpoint:** `GET /api/tenants/:id`

**Auth Required:** Yes (Admin only)

**Response:** `200 OK`

```json
{
  "_id": "tenant_id",
  "slug": "my-beauty-salon",
  "businessInfo": {
    "name": "My Beauty Salon",
    "email": "contact@mybeautysalon.com",
    "phone": "+441234567890",
    "address": "123 Beauty Street",
    "city": "London",
    "postalCode": "SW1A 1AA",
    "country": "UK"
  },
  "branding": {
    "colors": {
      "primary": "#8B5CF6",
      "secondary": "#EC4899",
      "accent": "#F59E0B"
    },
    "logo": {
      "url": "https://example.com/logo.png",
      "alt": "My Beauty Salon Logo"
    },
    "favicon": {
      "url": "https://example.com/favicon.ico"
    },
    "heroImages": [
      {
        "url": "https://example.com/hero.jpg",
        "title": "Welcome",
        "subtitle": "Experience luxury",
        "alt": "Hero image"
      }
    ]
  },
  "schedulingSettings": {
    "slotDuration": 30,
    "bufferTime": 0,
    "advanceBookingDays": 30,
    "cancellationHours": 24
  },
  "paymentSettings": {
    "platformFeePerBooking": 50,
    "platformFeePerProduct": 50,
    "currency": "GBP"
  },
  "domains": [],
  "status": "active",
  "createdAt": "2025-11-26T10:00:00.000Z"
}
```

**Errors:**

- `401` - Unauthorized
- `403` - Access denied (not your tenant)
- `404` - Tenant not found

---

### Get Tenant by Slug (Public)

**Endpoint:** `GET /api/tenants/slug/:slug`

**Auth Required:** No

**Response:** `200 OK`

```json
{
  "_id": "tenant_id",
  "slug": "my-beauty-salon",
  "businessInfo": {
    "name": "My Beauty Salon",
    "email": "contact@mybeautysalon.com",
    "phone": "+441234567890"
  },
  "branding": {
    "colors": { ... },
    "logo": { ... }
  }
}
```

**Note:** Sensitive information (payment settings, domains) is excluded.

**Errors:**

- `404` - Tenant not found

---

### Update Tenant

**Endpoint:** `PUT /api/tenants/:id`

**Auth Required:** Yes (Admin only)

**Request Body:**

```json
{
  "businessInfo": {
    "name": "Updated Salon Name",
    "phone": "+441234567891"
  },
  "schedulingSettings": {
    "slotDuration": 45,
    "bufferTime": 15
  },
  "paymentSettings": {
    "platformFeePerBooking": 75
  },
  "branding": {
    "colors": {
      "primary": "#9333EA"
    }
  }
}
```

**Response:** `200 OK`

```json
{
  "_id": "tenant_id",
  "businessInfo": {
    "name": "Updated Salon Name",
    ...
  },
  ...
}
```

**Errors:**

- `401` - Unauthorized
- `403` - Access denied
- `404` - Tenant not found
- `400` - Validation error

---

### List All Tenants (Super Admin Only)

**Endpoint:** `GET /api/tenants`

**Auth Required:** Yes (Super Admin only)

**Response:** `200 OK`

```json
[
  {
    "_id": "tenant_id_1",
    "slug": "salon-one",
    "businessInfo": { ... },
    "status": "active",
    "createdAt": "2025-11-26T10:00:00.000Z"
  },
  {
    "_id": "tenant_id_2",
    "slug": "salon-two",
    "businessInfo": { ... },
    "status": "suspended",
    "createdAt": "2025-11-25T14:30:00.000Z"
  }
]
```

**Errors:**

- `401` - Unauthorized
- `403` - Access denied (not super admin)

---

### Suspend Tenant (Super Admin Only)

**Endpoint:** `POST /api/tenants/:id/suspend`

**Auth Required:** Yes (Super Admin only)

**Response:** `200 OK`

```json
{
  "message": "Tenant suspended successfully",
  "tenant": {
    "_id": "tenant_id",
    "status": "suspended",
    "suspendedAt": "2025-11-26T12:00:00.000Z"
  }
}
```

**Errors:**

- `401` - Unauthorized
- `403` - Access denied
- `404` - Tenant not found

---

### Activate Tenant (Super Admin Only)

**Endpoint:** `POST /api/tenants/:id/activate`

**Auth Required:** Yes (Super Admin only)

**Response:** `200 OK`

```json
{
  "message": "Tenant activated successfully",
  "tenant": {
    "_id": "tenant_id",
    "status": "active"
  }
}
```

---

## Tenant Resolution

The platform resolves tenant context from multiple sources (in priority order):

### 1. HTTP Header

```http
X-Tenant-ID: tenant_id_here
```

### 2. Custom Domain

```
Request to: salon.customdomain.com
Matches tenant with domain: "salon.customdomain.com"
```

### 3. Subdomain

```
Request to: my-salon.yourdomain.com
Matches tenant with slug: "my-salon"
```

### 4. Path Parameter

```
Request to: /salon/my-salon/...
Matches tenant with slug: "my-salon"
```

### 5. JWT Token

```
Uses tenantId from JWT payload
```

### Middleware Usage

```javascript
// In your routes
import { resolveTenant, requireTenant } from "./middleware/resolveTenant.js";

// Resolve tenant (optional)
app.use(resolveTenant);

// Require tenant (throws error if not found)
app.use("/api/appointments", requireTenant, appointmentsRouter);

// Access tenant in routes
router.get("/", (req, res) => {
  const tenant = req.tenant; // Tenant object
  const tenantId = req.tenantId; // Tenant ID
});
```

---

## Beautician Stripe Connect

### Initiate Stripe Connect Onboarding

**Endpoint:** `POST /api/specialists/:id/stripe/onboard`

**Auth Required:** Yes (Admin only)

**Response:** `200 OK`

```json
{
  "url": "https://connect.stripe.com/setup/...",
  "accountId": "acct_...",
  "expiresAt": 1234567890
}
```

**Usage:**

```javascript
const response = await api.post(`/api/specialists/${id}/stripe/onboard`);
window.location.href = response.data.url;
```

**Errors:**

- `401` - Unauthorized
- `403` - Access denied (wrong tenant)
- `404` - Beautician not found
- `500` - Stripe API error

---

### Check Stripe Connect Status

**Endpoint:** `GET /api/specialists/:id/stripe/status`

**Auth Required:** Yes (Admin only)

**Response:** `200 OK`

```json
{
  "connected": true,
  "status": "connected",
  "accountId": "acct_...",
  "chargesEnabled": true,
  "payoutsEnabled": true,
  "detailsSubmitted": true,
  "requirements": {
    "currently_due": [],
    "eventually_due": [],
    "past_due": []
  }
}
```

**Possible Status Values:**

- `not_connected` - No Stripe account created
- `pending` - Account created but onboarding incomplete
- `connected` - Fully connected and verified
- `rejected` - Account rejected by Stripe
- `disconnected` - Account disconnected

**Errors:**

- `401` - Unauthorized
- `403` - Access denied
- `404` - Beautician not found

---

### Disconnect Stripe Account

**Endpoint:** `POST /api/specialists/:id/stripe/disconnect`

**Auth Required:** Yes (Admin only)

**Response:** `200 OK`

```json
{
  "message": "Stripe account disconnected successfully",
  "status": "disconnected"
}
```

**Errors:**

- `401` - Unauthorized
- `403` - Access denied
- `400` - No connected account
- `404` - Beautician not found

---

## Admin Routes

All admin routes require authentication and automatically filter by tenant context.

### Appointments

```http
GET    /api/appointments           # List appointments (tenant-filtered)
GET    /api/appointments/:id       # Get appointment (tenant-filtered)
POST   /api/appointments           # Create appointment
PUT    /api/appointments/:id       # Update appointment (tenant-filtered)
DELETE /api/appointments/:id       # Delete appointment (tenant-filtered)
```

### Services

```http
GET    /api/services               # List services (tenant-filtered)
GET    /api/services/:id           # Get service (tenant-filtered)
POST   /api/services               # Create service
PUT    /api/services/:id           # Update service (tenant-filtered)
DELETE /api/services/:id           # Delete service (tenant-filtered)
```

### Beauticians

```http
GET    /api/specialists            # List specialists (tenant-filtered)
GET    /api/specialists/:id        # Get specialist (tenant-filtered)
POST   /api/specialists            # Create specialist
PUT    /api/specialists/:id        # Update specialist (tenant-filtered)
DELETE /api/specialists/:id        # Delete specialist (tenant-filtered)
```

### Products

```http
GET    /api/products               # List products (tenant-filtered)
GET    /api/products/:id           # Get product (tenant-filtered)
POST   /api/products               # Create product
PUT    /api/products/:id           # Update product (tenant-filtered)
DELETE /api/products/:id           # Delete product (tenant-filtered)
```

### Orders

```http
GET    /api/orders                 # List orders (tenant-filtered)
GET    /api/orders/:id             # Get order (tenant-filtered)
POST   /api/orders                 # Create order
PUT    /api/orders/:id             # Update order (tenant-filtered)
```

---

## Error Codes

### Standard HTTP Status Codes

| Code | Meaning               | Description                        |
| ---- | --------------------- | ---------------------------------- |
| 200  | OK                    | Request successful                 |
| 201  | Created               | Resource created successfully      |
| 400  | Bad Request           | Invalid request data               |
| 401  | Unauthorized          | Missing or invalid authentication  |
| 403  | Forbidden             | Authenticated but access denied    |
| 404  | Not Found             | Resource not found or wrong tenant |
| 409  | Conflict              | Resource already exists            |
| 429  | Too Many Requests     | Rate limit exceeded                |
| 500  | Internal Server Error | Server error                       |

### Custom Error Responses

```json
{
  "error": "Error message",
  "details": {
    "field": "email",
    "message": "Email already exists"
  }
}
```

### Multi-Tenant Specific Errors

**Tenant Not Found:**

```json
{
  "error": "Tenant not found or inactive",
  "code": "TENANT_NOT_FOUND"
}
```

**Cross-Tenant Access:**

```json
{
  "error": "Access denied to this resource",
  "code": "CROSS_TENANT_ACCESS_DENIED"
}
```

**Tenant Suspended:**

```json
{
  "error": "This tenant account has been suspended",
  "code": "TENANT_SUSPENDED"
}
```

---

## Rate Limiting

### Default Limits

- **Public endpoints**: 100 requests per 15 minutes per IP
- **Authenticated endpoints**: 1000 requests per 15 minutes per user
- **Signup endpoint**: 5 requests per hour per IP

### Rate Limit Headers

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1234567890
```

### Rate Limit Exceeded Response

```json
{
  "error": "Too many requests, please try again later",
  "retryAfter": 900
}
```

---

## Pagination

Endpoints that return lists support pagination:

### Query Parameters

```
?page=1&limit=20&sortBy=createdAt&sortOrder=desc
```

### Response Format

```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

---

## Webhooks

### Stripe Webhook Events

**Endpoint:** `POST /api/webhooks/stripe`

**Events Handled:**

- `checkout.session.completed` - Payment completed
- `payment_intent.succeeded` - Payment successful
- `payment_intent.payment_failed` - Payment failed
- `charge.refunded` - Payment refunded
- `account.updated` - Beautician account status changed
- `account.application.authorized` - Beautician authorized platform
- `account.application.deauthorized` - Beautician disconnected
- `payout.paid` - Payout sent to specialist

**Webhook Signature Verification:**

```javascript
const sig = req.headers["stripe-signature"];
const event = stripe.webhooks.constructEvent(
  req.body,
  sig,
  process.env.STRIPE_WEBHOOK_SECRET
);
```

---

## Testing

### Test Mode

Use test API keys to test in sandbox mode:

```
STRIPE_SECRET_KEY=sk_test_...
```

### Test Tenant Creation

```bash
curl -X POST https://api.yourdomain.com/api/tenants/create \
  -H "Content-Type: application/json" \
  -d '{
    "businessName": "Test Salon",
    "email": "test@example.com",
    "phone": "+441234567890",
    "address": "123 Test St",
    "city": "London",
    "postalCode": "SW1A 1AA",
    "country": "UK",
    "adminName": "Test Admin",
    "adminEmail": "admin@testsalon.com",
    "adminPassword": "TestPass123!"
  }'
```

### Test Authentication

```bash
# Login
curl -X POST https://api.yourdomain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@testsalon.com",
    "password": "TestPass123!"
  }'

# Use token
curl https://api.yourdomain.com/api/appointments \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "X-Tenant-ID: YOUR_TENANT_ID"
```

---

## Support

For API support:

- **Documentation**: https://docs.yourdomain.com
- **Email**: api-support@yourdomain.com
- **Status Page**: https://status.yourdomain.com

API Version: 1.0.0  
Last Updated: November 26, 2025
