# 🔧 Fix: Account Status Shows "Inactive"

## Problem

The Profile page was showing "Inactive" status even though admins are active.

## Root Causes

### 1. **Missing `active` Field in Older Admin Records**

- Admins created before the `active` field was added to the schema don't have this field
- MongoDB doesn't automatically add default values to existing documents
- Solution: Run migration script to add the field

### 2. **UI Only Showed Active Badge**

- Original code: `{admin?.active && <span>Active</span>}`
- This only displayed badge when active=true
- When active=undefined or false, no badge appeared (looked like "Inactive")
- Solution: Show both Active and Inactive states

### 3. **Redux Store Not Updated on Page Load**

- ProtectedRoute verified token but didn't update Redux with fresh admin data
- Old localStorage data might be missing the `active` field
- Solution: Update Redux store with fresh data from `/auth/me` response

---

## Fixes Applied

### Fix 1: Migration Script (Backend)

**File**: `scripts/fixAdminActive.js` (NEW)

This script checks all admins and sets `active: true` for any missing the field.

**Usage**:

```powershell
cd C:\Users\user\Desktop\beauty-salon-backend
node scripts/fixAdminActive.js
```

**What it does**:

1. Connects to MongoDB
2. Finds all admin users
3. Checks if `active` field is undefined/null
4. Sets `active: true` for affected admins
5. Reports how many were updated

**Output Example**:

```
🔧 Fixing Admin Active Field

✅ Connected to database

📊 Found 2 admin(s)

👤 Admin: John Smith (john@example.com)
   Current active status: undefined
   ✅ Updated to: true

👤 Admin: Jane Doe (jane@example.com)
   Current active status: true
   ℹ️  Already has active field set

✅ Migration complete!
   Updated: 1 admin(s)
   Total: 2 admin(s)
```

---

### Fix 2: Show Both Active/Inactive States (Frontend)

**File**: `src/admin/pages/Profile.jsx` (MODIFIED)

#### Profile Overview Card Badge

**Before**:

```jsx
{
  admin?.active && (
    <span className="...green...">
      <span className="...green..."></span>
      Active
    </span>
  );
}
```

**Problem**: No badge shown when active=false or undefined

**After**:

```jsx
{
  admin?.active !== undefined && (
    <span
      className={`... ${
        admin.active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
      }`}
    >
      <span
        className={`... ${admin.active ? "bg-green-500" : "bg-red-500"}`}
      ></span>
      {admin.active ? "Active" : "Inactive"}
    </span>
  );
}
```

**Fix**: Shows green "Active" or red "Inactive" badge based on status

#### Account Information Section

**Before**:

```jsx
<p className="text-sm text-gray-500">{admin?.active ? "Active" : "Inactive"}</p>
```

**Problem**: Just plain text, not visually clear

**After**:

```jsx
<span
  className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg ${
    admin?.active
      ? "bg-green-100 text-green-800 border border-green-200"
      : "bg-red-100 text-red-800 border border-red-200"
  }`}
>
  <span
    className={`w-2.5 h-2.5 rounded-full ${
      admin?.active ? "bg-green-500" : "bg-red-500"
    }`}
  ></span>
  {admin?.active ? "Active" : "Inactive"}
</span>
```

**Fix**: Shows as a prominent badge with colored dot indicator

---

### Fix 3: Update Redux on Auth Verification (Frontend)

**File**: `src/components/ProtectedRoute.jsx` (MODIFIED)

**Before**:

```jsx
const response = await api.get("/auth/me");
if (response.data.success) {
  setIsValid(true);
}
```

**Problem**: Verified token but didn't update Redux with fresh admin data

**After**:

```jsx
const response = await api.get("/auth/me");
if (response.data.success && response.data.admin) {
  setIsValid(true);
  // Update Redux with fresh admin data (includes active field)
  dispatch(updateAdmin(response.data.admin));
}
```

**Fix**:

- Updates Redux store with latest admin data from server
- Includes `active`, `lastLogin`, and all other fields
- Ensures UI always shows current data

---

## Testing the Fix

### Step 1: Run Migration Script

```powershell
cd C:\Users\user\Desktop\beauty-salon-backend
node scripts/fixAdminActive.js
```

**Expected Output**:

- Shows all admins found
- Updates any without `active` field
- Reports success

### Step 2: Restart Backend

```powershell
cd C:\Users\user\Desktop\beauty-salon-backend
npm run dev
```

### Step 3: Clear Browser Data

**Option A: Clear localStorage (Recommended)**

- Open browser DevTools (F12)
- Go to Application tab
- Click "Local Storage" → your domain
- Delete `authToken` and `admin` keys
- Refresh page

**Option B: Use Incognito/Private Window**

- Opens fresh session without cached data

### Step 4: Login Again

1. Go to `http://localhost:5173/admin/login`
2. Enter your credentials
3. Login

### Step 5: Check Profile Page

1. Click "Profile" (👤) in sidebar
2. Check "Profile Overview" card at top
3. Should see **green "Active" badge** with dot
4. Scroll to "Account Information" section
5. Should see **green "Active" badge** with larger dot

### Step 6: Verify Data in DevTools

Open browser console and run:

```javascript
console.log(JSON.parse(localStorage.getItem("admin")));
```

**Expected Output**:

```javascript
{
  _id: "507f1f77bcf86cd799439011",
  email: "admin@example.com",
  name: "Admin User",
  role: "super_admin",
  active: true,        // ← Should be true
  lastLogin: "2025-10-26T..."
}
```

---

## Visual Changes

### Before Fix

```
┌─────────────────────────────────┐
│  [AU]  Admin User               │
│        admin@example.com        │
│        [super_admin]            │  ← No status badge
└─────────────────────────────────┘

Account Information
Account Status
Inactive                            ← Plain text, unclear
```

### After Fix

```
┌─────────────────────────────────┐
│  [AU]  Admin User               │
│        admin@example.com        │
│        [super_admin] [● Active] │  ← Green badge with dot
└─────────────────────────────────┘

Account Information
Account Status
[● Active]                          ← Green badge with larger dot
```

---

## Why This Happened

### Timeline of Events

1. **Initial Implementation**: Admin model created without `active` field
2. **First Admin Created**: Admin in database without `active` field
3. **Schema Updated**: `active` field added with `default: true`
4. **New Admins Work**: New admins get `active: true` automatically
5. **Old Admins Break**: Existing admins still missing the field
6. **UI Shows Inactive**: Badge logic didn't handle undefined case
7. **Redux Not Synced**: ProtectedRoute didn't update Redux with fresh data

### MongoDB Behavior

**Important**: MongoDB does NOT automatically add default values to existing documents when you add new fields to a schema. You must:

- Migrate existing data (our migration script)
- OR manually update each document
- OR drop and recreate (loses data)

---

## Prevention

### For Future Field Additions

When adding new fields with defaults to Mongoose schemas:

1. **Add field to schema** with default value

   ```javascript
   newField: {
     type: Boolean,
     default: true
   }
   ```

2. **Create migration script** immediately

   ```javascript
   // scripts/migrateNewField.js
   await Model.updateMany(
     { newField: { $exists: false } },
     { $set: { newField: true } }
   );
   ```

3. **Run migration** before deploying

   ```bash
   node scripts/migrateNewField.js
   ```

4. **Update UI** to handle both states
   ```jsx
   {
     field !== undefined && <span>{field ? "Yes" : "No"}</span>;
   }
   ```

---

## Files Modified

### Backend (1 NEW)

1. **`scripts/fixAdminActive.js`** - Migration script to fix existing admins

### Frontend (2 MODIFIED)

1. **`src/admin/pages/Profile.jsx`** - Show both Active/Inactive states with badges
2. **`src/components/ProtectedRoute.jsx`** - Update Redux with fresh admin data

---

## API Verification

### Check Admin Data via API

```bash
# Login
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"yourpassword"}' \
  | jq

# Get current admin (use token from above)
curl http://localhost:4000/api/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  | jq
```

**Expected Response**:

```json
{
  "success": true,
  "admin": {
    "_id": "507f1f77bcf86cd799439011",
    "id": "507f1f77bcf86cd799439011",
    "email": "admin@example.com",
    "name": "Admin User",
    "role": "super_admin",
    "active": true,           ← Should be true
    "lastLogin": "2025-10-26T10:30:00.000Z"
  }
}
```

---

## Summary

✅ **Migration script created** - Fixes existing admins  
✅ **UI updated** - Shows both Active/Inactive clearly  
✅ **Redux sync fixed** - Fresh data on every page load  
✅ **Visual badges added** - Green for active, red for inactive  
✅ **Problem identified** - MongoDB doesn't auto-migrate defaults  
✅ **Prevention documented** - Process for future field additions

**All admins should now show "Active" status correctly!** 🎉

---

## Quick Fix Commands

```powershell
# 1. Run migration
cd C:\Users\user\Desktop\beauty-salon-backend
node scripts/fixAdminActive.js

# 2. Restart backend
npm run dev

# 3. In browser: Clear localStorage and login again
# DevTools (F12) → Console:
localStorage.clear()
location.reload()
```

**Done!** Status should show as "Active" now. 🚀
