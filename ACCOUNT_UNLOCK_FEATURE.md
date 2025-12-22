# Account Unlock Feature - Implementation Complete

## Overview

Implemented a comprehensive account unlock system that allows super administrators to unlock user accounts that have been locked due to failed login attempts.

## Backend Implementation

### 1. Database Models

#### Admin Model (`src/models/Admin.js`)

- **Existing fields utilized**:
  - `loginAttempts`: Number - tracks failed login attempts
  - `lockUntil`: Date - timestamp when lock expires
- **Enhanced toJSON() method**:
  - Returns `isLocked` computed field for frontend
  - Includes `lockInfo` object when account is locked
  - Shows loginAttempts and lockUntil for locked accounts

#### AuditLog Model (`src/models/AuditLog.js`) - NEW

- Tracks all administrative actions including account unlocks
- Fields:
  - `action`: Type of action performed
  - `performedBy`: Admin who performed action
  - `targetUser`: User affected by action
  - `details`: Additional context
  - `ipAddress` & `userAgent`: Request metadata
- Indexed for efficient queries

### 2. API Endpoints

#### POST `/admin/admins/:adminId/unlock`

- **Authorization**: Super admin only
- **Functionality**:
  - Validates super admin permission
  - Checks if account is actually locked
  - Resets `loginAttempts` to 0
  - Clears `lockUntil` field
  - Creates audit log entry
  - Sends email notification to unlocked user
- **Response**:
  ```json
  {
    "success": true,
    "message": "Account unlocked successfully",
    "admin": {
      "_id": "...",
      "name": "...",
      "email": "...",
      "isLocked": false
    }
  }
  ```

### 3. Enhanced Login Logic (`src/routes/auth.js`)

#### Auto-Unlock Feature

- Before checking if account is locked, system checks if `lockUntil` has expired
- If expired, automatically unlocks the account:
  ```javascript
  if (admin.lockUntil && admin.lockUntil < Date.now()) {
    admin.loginAttempts = 0;
    admin.lockUntil = undefined;
    await admin.save();
  }
  ```

#### Improved Error Messages

- Shows time remaining when account is locked:
  ```
  "Account is temporarily locked due to too many failed login attempts.
   Please try again in X minute(s)."
  ```
- Includes `minutesRemaining` in response

### 4. Email Notifications

#### Unlock Notification Email

- Sent automatically when account is unlocked by admin
- Uses existing nodemailer transport from `mailer.js`
- Professional HTML design with:
  - Clear unlock confirmation
  - Security warning
  - Elite Booker branding
- Plain text fallback included

### 5. Audit Logging

- Every unlock action is logged with:
  - Admin who performed unlock
  - Target user unlocked
  - Timestamp
  - IP address
  - User agent
  - Details (admin name, email)

## Frontend Implementation

### 1. Admin Management UI (`src/admin/pages/AdminBeauticianLink.jsx`)

#### Visual Indicators

- Locked accounts show 🔒 badge next to role
- Badge styling: `bg-red-100 text-red-800`
- Visible in admin list table

#### Unlock Button

- Only visible to super admins
- Only shown when account is locked
- Styled with green theme: `border-green-300 text-green-700 hover:bg-green-50`
- Icon: 🔓 Unlock

#### Confirmation Modal

- Toast-based confirmation dialog
- Clear warning about action
- Two-button interface:
  - "Yes, Unlock" (green) - confirms action
  - "Cancel" (gray) - dismisses modal

### 2. API Integration

#### `handleUnlock(admin)` Function

- Validates super admin permission
- Checks if account is locked
- Shows confirmation dialog
- Calls API endpoint on confirmation

#### `performUnlock(adminId)` Function

- Makes POST request to `/admin/admins/:adminId/unlock`
- Handles success:
  - Shows success toast with 🔓 icon
  - Reloads admin list to update UI
- Handles errors:
  - Displays specific error messages
  - Logs errors for debugging

### 3. User Experience Features

- Success message: "Account unlocked successfully! User can now log in."
- Error handling with specific messages from backend
- Automatic list refresh after unlock
- Loading states managed properly

## Security Features

### 1. Authorization

- ✅ Only super admins can unlock accounts
- ✅ JWT token validation required
- ✅ Role check on every request

### 2. Validation

- ✅ Verifies user ID exists
- ✅ Checks if account is actually locked
- ✅ Prevents errors from invalid operations

### 3. Audit Trail

- ✅ Every unlock logged with full context
- ✅ IP address and user agent tracked
- ✅ Searchable by admin, target user, or action type

### 4. Rate Limiting

- Backend uses existing rate limiting middleware
- Recommended: Add specific rate limit for unlock endpoint

## Lock Configuration

### Current Settings

- **Max Login Attempts**: 5 failed attempts
- **Lock Duration**: 2 hours (7200000 ms)
- **Auto-Unlock**: Yes - happens on next login attempt after expiration

### Lock Logic (in Admin model)

```javascript
const maxAttempts = 5;
const lockTime = 2 * 60 * 60 * 1000; // 2 hours

if (this.loginAttempts + 1 >= maxAttempts && !this.isLocked()) {
  updates.$set = { lockUntil: Date.now() + lockTime };
}
```

## Optional Enhancements (Future)

### 1. Configurable Settings

Create admin settings page to customize:

- Maximum login attempts (currently 5)
- Lock duration (currently 2 hours)
- Enable/disable auto-unlock
- Email notifications on/off

### 2. Dashboard Widget

- Show count of currently locked accounts
- Quick unlock button on dashboard
- Alert when multiple accounts are locked

### 3. Enhanced Notifications

- Email to super admins when account gets locked
- SMS notifications for critical accounts
- Slack/Teams integration for team alerts

### 4. Unlock History

- Dedicated page showing unlock audit log
- Filter by date range, admin, or target user
- Export to CSV for compliance

## Testing Checklist

- [x] Super admin can unlock locked accounts
- [x] Regular admin cannot unlock accounts
- [x] Unlock resets loginAttempts to 0
- [x] Unlock clears lockUntil
- [x] Email sent to unlocked user
- [x] Audit log created on unlock
- [x] Auto-unlock works after expiration
- [x] Lock status shows in admin list
- [x] Unlock button only visible to super admins
- [x] Confirmation dialog works
- [x] Success/error messages display correctly

## Files Modified

### Backend

- `src/models/Admin.js` - Enhanced toJSON method
- `src/models/AuditLog.js` - NEW audit logging model
- `src/routes/admins.js` - Added unlock endpoint
- `src/routes/auth.js` - Enhanced login with auto-unlock
- `scripts/checkStripeMode.js` - NEW utility script

### Frontend

- `src/admin/pages/AdminBeauticianLink.jsx` - Added unlock UI
- `src/features/connect/StripeConnectSettings.jsx` - Added disconnect button

## Usage Instructions

### For Super Admins

1. **View Locked Accounts**:

   - Navigate to Admin → Admins
   - Locked accounts show 🔒 badge

2. **Unlock an Account**:

   - Click "🔓 Unlock" button next to locked admin
   - Confirm action in dialog
   - Wait for success message
   - User receives email notification

3. **View Audit Logs** (database query):
   ```javascript
   await AuditLog.find({ action: "account_unlocked" })
     .populate("performedBy targetUser")
     .sort({ createdAt: -1 });
   ```

### For Locked Users

1. **Auto-Unlock**:

   - Wait 2 hours after last failed attempt
   - Try logging in again
   - Account automatically unlocks if time expired

2. **Manual Unlock**:
   - Contact super administrator
   - Receive email notification when unlocked
   - Log in immediately

## API Documentation

### Unlock Account

```http
POST /admin/admins/:adminId/unlock
Authorization: Bearer <super_admin_token>

Response 200:
{
  "success": true,
  "message": "Account unlocked successfully",
  "admin": {
    "_id": "12345",
    "name": "John Doe",
    "email": "john@example.com",
    "isLocked": false
  }
}

Error 403:
{
  "error": "Only super admins can unlock accounts"
}

Error 400:
{
  "error": "Account is not locked"
}

Error 404:
{
  "error": "Admin not found"
}
```

## Environment Variables

No new environment variables required. Uses existing SMTP configuration:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

## Deployment Notes

1. Run migrations (if using migration system)
2. Ensure SMTP is configured for email notifications
3. Test unlock functionality in staging environment
4. Monitor audit logs for unlock events
5. Consider adding rate limiting for unlock endpoint

## Support

For issues or questions:

1. Check audit logs for unlock events
2. Verify super admin permissions
3. Check SMTP configuration for email issues
4. Review backend logs for detailed error messages
