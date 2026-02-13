# Referral System API Documentation

## Overview

The referral system allows businesses and clients to generate unique 6-character referral codes, share them with others, and track referred signups. Each referral code follows the format `ABC234` (3 letters + 3 digits, excluding confusing characters I, O, 0, 1).

## Base URL

```
https://api.elitebooker.co.uk/api/referrals
```

## Authentication

All endpoints (except `/validate/:code`) require authentication via JWT token in cookies or Authorization header.

```
Cookie: accessToken=<jwt_token>
```

OR

```
Authorization: Bearer <jwt_token>
```

---

## Endpoints

### 1. Generate Referral Code

Generate or retrieve existing referral code for authenticated user.

**Endpoint:** `POST /api/referrals/generate`

**Authentication:** Required

**Request Body:** None

**Response:**

```json
{
  "success": true,
  "data": {
    "code": "ABC234",
    "referralLink": "https://www.elitebooker.co.uk/signup?ref=ABC234",
    "createdAt": "2025-01-14T10:30:00.000Z"
  }
}
```

**Status Codes:**

- `201 Created` - Code successfully generated
- `401 Unauthorized` - Not authenticated
- `500 Internal Server Error` - Server error

**Example:**

```javascript
const response = await fetch("/api/referrals/generate", {
  method: "POST",
  credentials: "include",
});
const data = await response.json();
console.log(data.data.code); // "ABC234"
```

---

### 2. Get My Referral Code

Retrieve authenticated user's referral code (creates one if doesn't exist).

**Endpoint:** `GET /api/referrals/my-code`

**Authentication:** Required

**Response:**

```json
{
  "success": true,
  "data": {
    "code": "ABC234",
    "referralLink": "https://www.elitebooker.co.uk/signup?ref=ABC234",
    "createdAt": "2025-01-14T10:30:00.000Z"
  }
}
```

**Status Codes:**

- `200 OK` - Success
- `401 Unauthorized` - Not authenticated
- `500 Internal Server Error` - Server error

---

### 3. Get Referral Dashboard

Retrieve complete dashboard data including stats and list of referred businesses.

**Endpoint:** `GET /api/referrals/dashboard`

**Authentication:** Required

**Query Parameters:**

- `page` (optional, default: 1) - Page number for pagination
- `limit` (optional, default: 50) - Number of results per page

**Response:**

```json
{
  "success": true,
  "data": {
    "hasCode": true,
    "code": "ABC234",
    "referralLink": "https://www.elitebooker.co.uk/signup?ref=ABC234",
    "stats": {
      "totalReferrals": 15,
      "activeReferrals": 12,
      "pendingReferrals": 3,
      "churnedReferrals": 0,
      "totalRewards": 150.0,
      "paidRewards": 100.0,
      "pendingRewards": 50.0
    },
    "referrals": [
      {
        "id": "507f1f77bcf86cd799439011",
        "businessName": "Beauty Salon Ltd",
        "businessEmail": "contact@beautysalon.com",
        "businessSlug": "beauty-salon",
        "signupDate": "2025-01-10T14:20:00.000Z",
        "firstBookingDate": "2025-01-12T09:00:00.000Z",
        "status": "active",
        "rewardStatus": "paid",
        "rewardAmount": 10.0
      }
    ],
    "pagination": {
      "total": 15,
      "page": 1,
      "limit": 50,
      "totalPages": 1
    }
  }
}
```

**Status Codes:**

- `200 OK` - Success
- `401 Unauthorized` - Not authenticated
- `500 Internal Server Error` - Server error

**Referral Status Values:**

- `pending` - Business signed up but no bookings yet
- `active` - Business has received first booking
- `churned` - Business account inactive/deleted

**Reward Status Values:**

- `pending` - Reward not yet paid
- `paid` - Reward has been paid
- `cancelled` - Reward cancelled (e.g., business churned)

---

### 4. Validate Referral Code

Check if a referral code is valid and active. Public endpoint (no auth required).

**Endpoint:** `POST /api/referrals/validate/:code`

**Authentication:** Optional (prevents self-referral if authenticated)

**URL Parameters:**

- `code` (required) - 6-character referral code

**Response (Valid):**

```json
{
  "success": true,
  "valid": true,
  "data": {
    "code": "ABC234",
    "ownerName": "John's Salon",
    "ownerType": "Tenant"
  }
}
```

**Response (Invalid):**

```json
{
  "success": false,
  "valid": false,
  "error": "Referral code not found"
}
```

**Status Codes:**

- `200 OK` - Code is valid
- `400 Bad Request` - Invalid format or self-referral
- `404 Not Found` - Code doesn't exist
- `500 Internal Server Error` - Server error

**Example:**

```javascript
const response = await fetch("/api/referrals/validate/ABC234", {
  method: "POST",
});
const data = await response.json();
if (data.valid) {
  console.log(`Valid code from ${data.data.ownerName}`);
}
```

---

### 5. Get Detailed Statistics

Retrieve detailed analytics for authenticated user's referral code.

**Endpoint:** `GET /api/referrals/stats`

**Authentication:** Required

**Response:**

```json
{
  "success": true,
  "data": {
    "hasCode": true,
    "code": "ABC234",
    "totalStats": {
      "totalReferrals": 15,
      "activeReferrals": 12,
      "pendingReferrals": 3,
      "churnedReferrals": 0,
      "totalRewards": 150.0,
      "paidRewards": 100.0,
      "pendingRewards": 50.0
    },
    "signupsByMonth": {
      "2025-01": 8,
      "2024-12": 7
    },
    "statusBreakdown": {
      "pending": 3,
      "active": 12,
      "churned": 0
    },
    "conversionRate": "80.00"
  }
}
```

**Status Codes:**

- `200 OK` - Success
- `401 Unauthorized` - Not authenticated
- `500 Internal Server Error` - Server error

---

### 6. Get Leaderboard

Retrieve top referrers across the platform (admin only in future).

**Endpoint:** `GET /api/referrals/leaderboard`

**Authentication:** Required

**Query Parameters:**

- `limit` (optional, default: 10) - Number of top referrers to return

**Response:**

```json
{
  "success": true,
  "data": {
    "leaderboard": [
      {
        "rank": 1,
        "code": "ABC234",
        "ownerName": "Premium Salon",
        "ownerType": "Tenant",
        "totalReferrals": 45,
        "activeReferrals": 40,
        "totalRewards": 450.0
      },
      {
        "rank": 2,
        "code": "DEF567",
        "ownerName": "Beauty Expert",
        "ownerType": "Client",
        "totalReferrals": 32,
        "activeReferrals": 28,
        "totalRewards": 320.0
      }
    ]
  }
}
```

**Status Codes:**

- `200 OK` - Success
- `401 Unauthorized` - Not authenticated
- `500 Internal Server Error` - Server error

---

## Tenant Signup with Referral Code

### Modified Tenant Creation Endpoint

**Endpoint:** `POST /api/tenants/create`

**Authentication:** None (public endpoint)

**Request Body:**

```json
{
  "businessName": "My Beauty Salon Ltd",
  "name": "My Beauty Salon",
  "email": "contact@mybeautysalon.com",
  "phone": "+44 20 1234 5678",
  "adminName": "Jane Doe",
  "adminEmail": "jane@mybeautysalon.com",
  "adminPassword": "SecurePassword123!",
  "referralCode": "ABC234",
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
  "message": "Salon account created successfully!",
  "tenant": {
    "id": "507f1f77bcf86cd799439011",
    "name": "My Beauty Salon",
    "businessName": "My Beauty Salon Ltd",
    "slug": "my-beauty-salon",
    "email": "contact@mybeautysalon.com",
    "status": "trial",
    "isTrial": true,
    "trialEndsAt": "2025-01-28T10:30:00.000Z"
  },
  "admin": {
    "id": "507f1f77bcf86cd799439012",
    "name": "Jane Doe",
    "email": "jane@mybeautysalon.com",
    "role": "super_admin"
  },
  "referral": {
    "code": "ABC234",
    "referralId": "507f1f77bcf86cd799439013"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "onboardingUrl": "/onboarding/my-beauty-salon"
}
```

**Notes:**

- `referralCode` field is **optional**
- Invalid or non-existent codes are logged but don't fail signup
- Referral is created with `pending` status
- Status changes to `active` when referred business receives first booking

---

## Code Format

Referral codes follow a specific format:

- **Length:** Exactly 6 characters
- **Format:** `LLL###` (3 uppercase letters + 3 digits)
- **Allowed Letters:** A-Z (excluding I and O for readability)
- **Allowed Digits:** 2-9 (excluding 0 and 1 for readability)
- **Examples:** `ABC234`, `XYZ567`, `DEF892`
- **Invalid Examples:**
  - `ABC123` (contains 1)
  - `AIO234` (contains I and O)
  - `AB234` (too short)
  - `ABCD234` (too long)

---

## Error Responses

All errors follow this format:

```json
{
  "success": false,
  "error": "Error message here"
}
```

Common error codes:

- `400 Bad Request` - Invalid input/validation error
- `401 Unauthorized` - Missing or invalid authentication
- `404 Not Found` - Resource not found
- `500 Internal Server Error` - Server error

---

## Implementation Notes

### Database Models

**ReferralCode:**

```javascript
{
  code: String (unique, 6 chars, uppercase),
  ownerId: ObjectId (references Client or Tenant),
  ownerType: String ('Client' or 'Tenant'),
  isActive: Boolean,
  createdAt: Date
}
```

**Referral:**

```javascript
{
  referralCodeId: ObjectId (references ReferralCode),
  referredBusinessId: ObjectId (references Tenant),
  referredBusinessName: String,
  referredBusinessEmail: String,
  status: String ('pending', 'active', 'churned'),
  firstBookingAt: Date,
  rewardAmount: Number,
  rewardStatus: String ('pending', 'paid', 'cancelled'),
  metadata: Mixed,
  createdAt: Date,
  updatedAt: Date
}
```

### Tracking First Booking

To mark a referral as active when the referred business receives their first booking:

```javascript
import Referral from "./models/Referral.js";

// In your booking creation endpoint:
await Referral.recordFirstBooking(tenantId);
```

This will:

1. Find the referral for this business
2. Set `firstBookingAt` to current date
3. Update status to `active`

---

## Frontend Integration Examples

### Signup Page with Referral Code

```javascript
import { useState, useEffect } from "react";

function SignupPage() {
  const [referralCode, setReferralCode] = useState("");
  const [codeValid, setCodeValid] = useState(null);

  // Auto-detect ref parameter from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref) {
      setReferralCode(ref);
      validateCode(ref);
    }
  }, []);

  const validateCode = async (code) => {
    if (!code || code.length !== 6) {
      setCodeValid(null);
      return;
    }

    try {
      const response = await fetch(`/api/referrals/validate/${code}`, {
        method: "POST",
      });
      const data = await response.json();
      setCodeValid(data.valid);
    } catch (error) {
      setCodeValid(false);
    }
  };

  return (
    <form>
      {/* ... other fields ... */}

      <div>
        <label>Referral Code (Optional)</label>
        <input
          type="text"
          value={referralCode}
          onChange={(e) => {
            const code = e.target.value.toUpperCase();
            setReferralCode(code);
            validateCode(code);
          }}
          maxLength={6}
          placeholder="ABC234"
        />
        {codeValid === true && (
          <span className="text-green-600">✓ Valid code</span>
        )}
        {codeValid === false && (
          <span className="text-red-600">✗ Invalid code</span>
        )}
      </div>

      <button type="submit">Sign Up</button>
    </form>
  );
}
```

### Referral Dashboard

```javascript
import { useState, useEffect } from "react";

function ReferralDashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch("/api/referrals/dashboard", {
      credentials: "include",
    })
      .then((res) => res.json())
      .then((result) => setData(result.data));
  }, []);

  if (!data) return <div>Loading...</div>;

  if (!data.hasCode) {
    return <div>Generate your referral code first!</div>;
  }

  const copyCode = () => {
    navigator.clipboard.writeText(data.referralLink);
    alert("Referral link copied!");
  };

  return (
    <div>
      <h1>Your Referral Code</h1>
      <div className="code-display">{data.code}</div>
      <button onClick={copyCode}>Copy Link</button>

      <div className="stats">
        <div>Total: {data.stats.totalReferrals}</div>
        <div>Active: {data.stats.activeReferrals}</div>
        <div>Pending: {data.stats.pendingReferrals}</div>
        <div>Rewards: £{data.stats.totalRewards}</div>
      </div>

      <h2>Referred Businesses</h2>
      <table>
        <thead>
          <tr>
            <th>Business</th>
            <th>Email</th>
            <th>Signup Date</th>
            <th>Status</th>
            <th>Reward</th>
          </tr>
        </thead>
        <tbody>
          {data.referrals.map((ref) => (
            <tr key={ref.id}>
              <td>{ref.businessName}</td>
              <td>{ref.businessEmail}</td>
              <td>{new Date(ref.signupDate).toLocaleDateString()}</td>
              <td>{ref.status}</td>
              <td>£{ref.rewardAmount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

---

## Testing

Run backend tests:

```bash
cd booking-backend
node test-referrals.js
```

This will test:

- Code generation
- Model creation
- Validation
- Stats retrieval
- Duplicate prevention

---

## Future Enhancements

1. **Reward Automation:** Automatically calculate and mark rewards as paid
2. **Email Notifications:** Notify referrers when someone uses their code
3. **Referral Tiers:** Bronze/Silver/Gold tiers based on referral count
4. **Custom Codes:** Allow users to request custom codes (subject to availability)
5. **Analytics Dashboard:** Advanced graphs and conversion funnels
6. **Referral Campaigns:** Time-limited bonus campaigns
7. **Admin Management:** Admin panel to manage codes, rewards, and disputes

---

## Support

For questions or issues, contact: support@elitebooker.co.uk
