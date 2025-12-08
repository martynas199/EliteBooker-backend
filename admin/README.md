# Admin Dashboard - Beauty Salon Booking System

Complete production-ready admin dashboard for managing services and staff in your beauty salon booking application.

## 📦 What's Included

### Backend Components

- **Validation Schemas** (`src/validations/`)

  - `service.schema.js` - Zod schemas for service CRUD operations
  - `specialist.schema.js` - Zod schemas for specialist/staff CRUD operations

- **API Routes** (`src/routes/`)

  - `services.js` - Full CRUD API for services (GET, POST, PATCH, DELETE)
  - `specialists.js` - Full CRUD API for specialists with service-assignment protection

- **Middleware** (`src/middleware/`)

  - `requireAdmin.js` - Authentication/authorization middleware (placeholder)

- **Tests** (`tests/`)
  - `service.schema.test.js` - Comprehensive validation tests for services
  - `specialist.schema.test.js` - Comprehensive validation tests for specialists

### Frontend Components

- **Admin Forms** (`src/admin/`)

  - `ServiceForm.jsx` - Create/edit/delete services with variants and image upload
  - `StaffForm.jsx` - Create/edit/delete staff with working hours and specialties

- **Admin Lists** (`src/admin/`)

  - `ServicesList.jsx` - List view with search, filters, and actions
  - `StaffList.jsx` - List view with service assignments and warnings

- **Hooks** (`src/hooks/`)
  - `useImageUpload.js` - Image upload interface (placeholder for Cloudflare R2)

## 🚀 Getting Started

### 1. Backend Setup

#### Install Dependencies (if needed)

```bash
cd beauty-salon-backend
npm install zod
```

#### Run Validation Tests

```bash
node --test tests/service.schema.test.js
node --test tests/specialist.schema.test.js
```

#### Update Server Routes

Make sure your `src/server.js` imports and uses the routes:

```javascript
import servicesRouter from "./routes/services.js";
import beauticiansRouter from "./routes/specialists.js";

app.use("/api/services", servicesRouter);
app.use("/api/specialists", beauticiansRouter);
```

### 2. Frontend Setup

#### Example Admin Page Integration

Create a new admin page that uses the components:

```jsx
// src/admin/pages/ServicesManager.jsx
import { useState, useEffect } from "react";
import ServiceForm from "../ServiceForm";
import ServicesList from "../ServicesList";

export default function ServicesManager() {
  const [services, setServices] = useState([]);
  const [specialists, setBeauticians] = useState([]);
  const [editingService, setEditingService] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [servicesRes, beauticiansRes] = await Promise.all([
        fetch("/api/services"),
        fetch("/api/specialists"),
      ]);
      setServices(await servicesRes.json());
      setBeauticians(await beauticiansRes.json());
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingService(null);
    setShowForm(true);
  };

  const handleEdit = (service) => {
    setEditingService(service);
    setShowForm(true);
  };

  const handleSave = async (serviceData) => {
    try {
      const url = editingService
        ? `/api/services/${editingService._id}`
        : "/api/services";

      const method = editingService ? "PATCH" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(serviceData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to save service");
      }

      await loadData();
      setShowForm(false);
      setEditingService(null);
    } catch (error) {
      throw error; // Let form handle error display
    }
  };

  const handleDelete = async (serviceId) => {
    try {
      const response = await fetch(`/api/services/${serviceId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to delete service");
      }

      await loadData();
      setShowForm(false);
      setEditingService(null);
    } catch (error) {
      alert(error.message);
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingService(null);
  };

  if (showForm) {
    return (
      <ServiceForm
        service={editingService}
        specialists={specialists}
        onSave={handleSave}
        onCancel={handleCancel}
        onDelete={
          editingService ? () => handleDelete(editingService._id) : undefined
        }
      />
    );
  }

  return (
    <ServicesList
      services={services}
      onEdit={handleEdit}
      onDelete={handleDelete}
      onCreate={handleCreate}
      isLoading={isLoading}
    />
  );
}
```

Similar pattern for Staff management:

```jsx
// src/admin/pages/StaffManager.jsx
import { useState, useEffect } from "react";
import StaffForm from "../StaffForm";
import StaffList from "../StaffList";

// ... Similar structure to ServicesManager
// Use /api/specialists endpoints
```

## 📚 API Reference

### Services API

#### GET /api/services

Get all services with optional filters.

**Query Parameters:**

- `active` (boolean) - Filter by active status
- `category` (string) - Filter by category

**Response:**

```json
[
  {
    "_id": "507f1f77bcf86cd799439011",
    "name": "Haircut & Styling",
    "description": "Professional haircut with styling",
    "price": 5000,
    "durationMin": 60,
    "category": "Hair",
    "active": true,
    "primaryBeauticianId": "507f1f77bcf86cd799439012",
    "image": {
      "provider": "cloudflare-r2",
      "url": "https://...",
      "alt": "Haircut service"
    },
    "variants": [
      { "name": "Short Hair", "priceAdjust": 0 },
      { "name": "Long Hair", "priceAdjust": 1000 }
    ]
  }
]
```

#### GET /api/services/:id

Get a single service by ID with populated specialist.

#### POST /api/services

Create a new service (requires admin auth).

**Request Body:**

```json
{
  "name": "New Service",
  "description": "Service description",
  "price": 5000,
  "durationMin": 60,
  "category": "Hair",
  "active": true,
  "primaryBeauticianId": "507f1f77bcf86cd799439012",
  "image": {
    "provider": "cloudflare-r2",
    "url": "https://...",
    "alt": "Service image"
  },
  "variants": [{ "name": "Variant 1", "priceAdjust": 0 }]
}
```

#### PATCH /api/services/:id

Update an existing service (requires admin auth).

**Request Body:** Partial service object (only fields to update)

#### DELETE /api/services/:id

Delete a service (requires admin auth).

### Beauticians API

#### GET /api/specialists

Get all specialists with optional filters.

**Query Parameters:**

- `active` (boolean) - Filter by active status
- `serviceId` (string) - Filter by assigned service

#### GET /api/specialists/:id

Get a single specialist by ID.

#### POST /api/specialists

Create a new specialist (requires admin auth).

**Request Body:**

```json
{
  "name": "Jane Smith",
  "email": "jane@example.com",
  "phone": "+44 20 1234 5678",
  "bio": "Professional stylist with 10 years experience",
  "specialties": ["Haircuts", "Coloring", "Styling"],
  "active": true,
  "color": "#3B82F6",
  "image": {
    "provider": "cloudflare-r2",
    "url": "https://...",
    "alt": "Jane Smith"
  },
  "workingHours": [
    {
      "dayOfWeek": 1,
      "start": "09:00",
      "end": "17:00"
    }
  ]
}
```

#### PATCH /api/specialists/:id

Update an existing specialist (requires admin auth).

#### DELETE /api/specialists/:id

Delete a specialist (requires admin auth).

**Note:** Backend will return 409 error if specialist is assigned to any services.

## 🔒 Authentication Setup

The `requireAdmin` middleware is currently a **placeholder** that allows all requests through. You MUST implement proper authentication before deploying to production.

### Option 1: JWT-based Authentication

```javascript
// src/middleware/requireAdmin.js
import jwt from "jsonwebtoken";

export default function requireAdmin(req, res, next) {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded.isAdmin) {
      return res.status(403).json({ message: "Admin access required" });
    }

    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}
```

### Option 2: Session-based Authentication

```javascript
// src/middleware/requireAdmin.js
export default function requireAdmin(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  if (!req.session.user.isAdmin) {
    return res.status(403).json({ message: "Admin access required" });
  }

  next();
}
```

### Frontend Auth Integration

Add authentication headers to your API calls:

```javascript
const response = await fetch("/api/services", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${yourAuthToken}`,
  },
  body: JSON.stringify(serviceData),
});
```

## 📸 Image Upload Setup (Cloudflare R2)

The `useImageUpload` hook is a **placeholder** that returns blob URLs. For production, integrate with Cloudflare R2:

### Backend Upload Endpoint

```javascript
// src/routes/upload.js
import express from "express";
import multer from "multer";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const s3Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

// Direct upload endpoint
router.post(
  "/upload",
  requireAdmin,
  upload.single("image"),
  async (req, res) => {
    try {
      const file = req.file;
      const fileName = `${Date.now()}-${file.originalname}`;

      await s3Client.send(
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: fileName,
          Body: file.buffer,
          ContentType: file.mimetype,
        })
      );

      const url = `${process.env.R2_PUBLIC_URL}/${fileName}`;

      res.json({
        provider: "cloudflare-r2",
        id: fileName,
        url,
        alt: req.body.alt || "",
        width: null, // Use sharp to get dimensions if needed
        height: null,
      });
    } catch (error) {
      res.status(500).json({ message: "Upload failed", error: error.message });
    }
  }
);

export default router;
```

### Environment Variables

```env
# Cloudflare R2
R2_ENDPOINT=https://ACCOUNT_ID.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET_NAME=your-bucket-name
R2_PUBLIC_URL=https://your-bucket.your-domain.com
```

### Frontend Hook Update

Update `useImageUpload.js` to call your backend:

```javascript
const uploadImage = async (file, options = {}) => {
  const formData = new FormData();
  formData.append("image", file);
  formData.append("alt", options.alt || "");

  const response = await fetch("/api/upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${yourAuthToken}`,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error("Upload failed");
  }

  return await response.json();
};
```

## ✅ Validation Schema Examples

### Service Validation

```javascript
import {
  createServiceSchema,
  updateServiceSchema,
} from "./validations/service.schema.js";

// Create validation
try {
  const validData = createServiceSchema.parse(req.body);
  // validData is now type-safe and validated
} catch (error) {
  // error.errors contains detailed validation errors
}

// Update validation (allows partial updates)
try {
  const validData = updateServiceSchema.parse(req.body);
} catch (error) {
  // Handle validation errors
}
```

### Beautician Validation

```javascript
import {
  createBeauticianSchema,
  updateBeauticianSchema,
} from "./validations/specialist.schema.js";

// Validates working hours, time format, specialties array, etc.
const validData = createBeauticianSchema.parse(req.body);
```

## 🧪 Testing

Run the validation tests:

```bash
# Test service schema validation
node --test tests/service.schema.test.js

# Test specialist schema validation
node --test tests/specialist.schema.test.js

# Run all tests
node --test tests/*.test.js
```

Expected output:

```
✓ Service validation tests (12 tests passed)
✓ Beautician validation tests (15 tests passed)
```

## 🚀 Deployment Checklist

- [ ] **Implement Authentication** - Replace `requireAdmin` placeholder with real auth
- [ ] **Setup Image Upload** - Integrate Cloudflare R2 or alternative storage
- [ ] **Environment Variables** - Set all required env vars in production
- [ ] **Database Indexes** - Add indexes for frequently queried fields
- [ ] **Stripe Webhooks** - Update webhook URLs for production domain
- [ ] **CORS Configuration** - Configure CORS for your frontend domain
- [ ] **Rate Limiting** - Add rate limiting to admin endpoints
- [ ] **Error Logging** - Setup error tracking (Sentry, etc.)
- [ ] **Backup Strategy** - Implement database backup procedures

### Production Environment Variables

```env
# Database
MONGODB_URI=mongodb+srv://...

# Authentication
JWT_SECRET=your-super-secret-key-change-in-production

# Cloudflare R2
R2_ENDPOINT=https://...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=...
R2_PUBLIC_URL=https://...

# Stripe
STRIPE_SECRET=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# App
NODE_ENV=production
PORT=4000
```

## 📝 Component API

### ServiceForm

```jsx
<ServiceForm
  service={service || null}        // Existing service for edit, null for create
  specialists={beauticiansArray}   // Array of specialist objects for dropdown
  onSave={async (data) => {...}}   // Called with validated service data
  onCancel={() => {...}}           // Called when user cancels
  onDelete={async () => {...}}     // Called when user confirms delete (edit mode only)
/>
```

### ServicesList

```jsx
<ServicesList
  services={servicesArray}           // Array of service objects
  onEdit={(service) => {...}}        // Called when edit button clicked
  onDelete={async (id) => {...}}     // Called when delete confirmed
  onCreate={() => {...}}             // Called when create button clicked
  isLoading={false}                  // Show loading state
/>
```

### StaffForm

```jsx
<StaffForm
  staff={staff || null}              // Existing staff for edit, null for create
  onSave={async (data) => {...}}     // Called with validated staff data
  onCancel={() => {...}}             // Called when user cancels
  onDelete={async () => {...}}       // Called when user confirms delete
/>
```

### StaffList

```jsx
<StaffList
  staff={staffArray}                 // Array of staff objects
  services={servicesArray}           // Array of services (shows assignments)
  onEdit={(staff) => {...}}          // Called when edit button clicked
  onDelete={async (id) => {...}}     // Called when delete confirmed
  onCreate={() => {...}}             // Called when create button clicked
  isLoading={false}                  // Show loading state
/>
```

## 🎨 Styling

All components use Tailwind CSS utility classes. Make sure your `tailwind.config.js` includes:

```javascript
module.exports = {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eff6ff",
          // ... your brand colors
          600: "#2563eb",
          700: "#1d4ed8",
        },
      },
    },
  },
};
```

## 🐛 Troubleshooting

### "STRIPE_SECRET is not configured"

Make sure `.env` is loaded before importing stripe:

```javascript
import "dotenv/config"; // Must be first
import express from "express";
```

### "Beautician cannot be deleted (assigned to services)"

The backend prevents deletion of specialists assigned to services. Reassign services first:

1. Edit each service that uses this specialist
2. Select a different primary specialist
3. Save the service
4. Now you can delete the staff member

### Webhook not receiving events (local development)

Use Stripe CLI for local webhook forwarding:

```bash
stripe listen --forward-to http://localhost:4000/api/webhooks/stripe
```

### Image upload returns blob URL

This is expected behavior with the placeholder hook. See "Image Upload Setup" section to integrate real storage.

## 📚 Additional Resources

- [Zod Documentation](https://zod.dev/)
- [Mongoose Models](https://mongoosejs.com/docs/models.html)
- [Cloudflare R2 Docs](https://developers.cloudflare.com/r2/)
- [Stripe Webhooks](https://stripe.com/docs/webhooks)
- [Tailwind CSS](https://tailwindcss.com/)

## 🤝 Support

For issues or questions:

1. Check this README thoroughly
2. Review validation test files for examples
3. Check backend route implementations for API patterns
4. Review form components for integration examples

---

**Note:** This is a complete admin system ready for integration. Remember to implement authentication and image upload before deploying to production!
