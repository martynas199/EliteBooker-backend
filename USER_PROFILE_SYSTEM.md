# 🎯 User Profile System - Backend Implementation Complete

## ✅ What's Been Built

### 1️⃣ Database Models

#### **User Model** (`src/models/User.js`)

```javascript
{
  name: String,
  email: String (unique),
  phone: String,
  password: String (hashed with bcrypt),
  role: "customer",
  totalBookings: Number,
  totalOrders: Number,
  totalSpent: Number,
  isActive: Boolean,
  lastLogin: Date
}
```

#### **Updated Models**

- **Appointment**: Added `userId` field (optional, null for guests)
- **Order**: Added `userId` field (optional, null for guests)

---

### 2️⃣ Authentication System

#### **Routes** (`/api/user-auth/*`)

| Endpoint                  | Method | Description           | Auth Required |
| ------------------------- | ------ | --------------------- | ------------- |
| `/api/user-auth/register` | POST   | Register new customer | No            |
| `/api/user-auth/login`    | POST   | Login customer        | No            |
| `/api/user-auth/me`       | GET    | Get current user      | Yes           |
| `/api/user-auth/logout`   | POST   | Logout (optional)     | No            |

#### **Features:**

- ✅ Password hashing with bcryptjs
- ✅ JWT token generation (7-day expiry)
- ✅ Email uniqueness validation
- ✅ Password minimum length (6 chars)
- ✅ Account status tracking (isActive)
- ✅ Last login timestamp

---

### 3️⃣ User Profile Routes

#### **Routes** (`/api/users/*`) - All require authentication

| Endpoint                            | Method | Description                  |
| ----------------------------------- | ------ | ---------------------------- |
| `/api/users/me/bookings`            | GET    | Get user's bookings          |
| `/api/users/me/orders`              | GET    | Get user's orders            |
| `/api/users/me`                     | PATCH  | Update profile               |
| `/api/users/me`                     | DELETE | Delete account (soft delete) |
| `/api/users/me/bookings/:id/cancel` | PATCH  | Cancel booking               |

#### **Features:**

- ✅ Booking history with service & beautician details
- ✅ Order history with product details
- ✅ Profile updates (name, email, phone)
- ✅ Password change with current password verification
- ✅ Soft delete (account deactivation)
- ✅ Booking cancellation with 24-hour policy
- ✅ Refund type determination (full/none based on notice)

---

### 4️⃣ Authentication Middleware

**File**: `src/middleware/userAuth.js`

#### **`authenticateUser`**

- Verifies JWT token from Authorization header
- Validates customer token type
- Checks account is active
- Attaches `req.user` and `req.userId`

#### **`optionalAuth`**

- Allows both authenticated and guest users
- Sets `req.user` to null for guests
- Useful for checkout flow (guest vs logged-in)

---

### 5️⃣ Security Features

✅ **Rate Limiting**

- Login: Stricter limits
- Registration: Protected against spam
- All API routes: General rate limiting

✅ **Password Security**

- Bcrypt hashing with salt rounds: 10
- Minimum 6 characters
- Current password required for changes

✅ **Token Security**

- JWT with 7-day expiration
- Token type verification (customer vs admin)
- Bearer token authentication

✅ **Data Protection**

- Password excluded from JSON responses
- Soft delete (preserve data, deactivate account)
- Email uniqueness enforced

---

## 📋 API Examples

### Register

```bash
POST /api/user-auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "07123456789",
  "password": "password123"
}

Response:
{
  "user": { "name": "John Doe", "email": "john@example.com", ... },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Login

```bash
POST /api/user-auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "password123"
}

Response:
{
  "user": { ... },
  "token": "..."
}
```

### Get Current User

```bash
GET /api/user-auth/me
Authorization: Bearer <token>

Response:
{
  "user": { ... }
}
```

### Get Bookings

```bash
GET /api/users/me/bookings
Authorization: Bearer <token>

Response:
{
  "bookings": [
    {
      "_id": "...",
      "client": { "name": "...", "email": "..." },
      "serviceId": { "name": "Hair Cut", ... },
      "beauticianId": { "name": "Jane", ... },
      "start": "2025-11-10T10:00:00Z",
      "price": 50,
      "status": "confirmed"
    }
  ]
}
```

### Cancel Booking

```bash
PATCH /api/users/me/bookings/:id/cancel
Authorization: Bearer <token>
Content-Type: application/json

{
  "reason": "Schedule conflict"
}

Response:
{
  "message": "Booking cancelled successfully",
  "refundType": "cancelled_full_refund",
  "appointment": { ... }
}
```

---

## 🔄 Checkout Flow Integration

### Guest Checkout (Existing)

```javascript
// No userId - works as before
{
  client: { name, email, phone },
  userId: null
}
```

### Logged-in Checkout (New)

```javascript
// With userId - linked to user account
{
  client: { name, email, phone },
  userId: "507f1f77bcf86cd799439011"
}
```

---

## 🎨 Frontend Tasks Remaining

### 1. **Auth Context** (`src/app/AuthContext.jsx`)

- Store user state and token
- Login/logout/register functions
- useAuth hook

### 2. **Login/Register Pages**

- `src/features/auth/LoginPage.jsx`
- `src/features/auth/RegisterPage.jsx`
- Form validation
- Error handling

### 3. **Profile Page** (`src/features/profile/ProfilePage.jsx`)

- **Tabs**: Bookings, Orders, Settings
- Booking history with cancel button
- Order history with reorder button
- Profile settings form

### 4. **Update Checkout**

- Detect if user logged in
- Pre-fill details for logged-in users
- "Continue as Guest" vs "Sign In" options
- Link bookings/orders to userId

### 5. **Mobile Optimization**

- Card layouts for bookings/orders
- Responsive grid (Tailwind)
- Touch-friendly buttons

---

## 📊 Database Changes

### Indexes Added

- `Appointment.userId` (for fast user lookups)
- `Order.userId` (for fast user lookups)
- `User.email` (unique, for login)

### Backward Compatibility

- ✅ Guest checkout still works (userId = null)
- ✅ Existing appointments/orders unaffected
- ✅ No breaking changes

---

## 🚀 Next Steps

1. **Frontend Authentication**

   - Create AuthContext
   - Build login/register pages
   - Add to routes

2. **Profile Page**

   - Build UI with tabs
   - Implement booking/order displays
   - Add cancel/reorder functionality

3. **Update Checkout**

   - Add auth detection
   - Pre-fill user details
   - Link to userId

4. **Email Notifications** (Optional)

   - Set up Nodemailer
   - Create templates
   - Send on booking/order confirmation

5. **Testing**
   - Register → Login → Book → View → Cancel flow
   - Guest checkout still works
   - Mobile responsiveness

---

## 🔐 Environment Variables Needed

Add to `.env`:

```
JWT_SECRET=your-super-secret-jwt-key-change-in-production
```

---

## ✅ Backend Status

**Complete and Running!** 🎉

- User registration & login ✅
- JWT authentication ✅
- Profile management ✅
- Booking/order history ✅
- Cancellation logic ✅
- Guest checkout preserved ✅

**Ready for frontend integration!**
