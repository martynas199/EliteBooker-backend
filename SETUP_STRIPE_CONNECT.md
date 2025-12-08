# 🔧 Setup Guide: Link Admin to Beautician for Stripe Connect

## Problem

The "Connect with Stripe" button doesn't appear in Settings because your admin account is not linked to a specialist account.

## Solution

Link your admin account to a specialist using the provided scripts.

---

## 📋 Step-by-Step Setup

### **Step 1: List All Accounts**

See which admins and specialists exist in your database:

```bash
cd c:\Users\user\Desktop\beauty-salon-backend
node scripts/listAccounts.js
```

**Expected Output:**

```
✅ Connected to MongoDB

👤 ADMIN ACCOUNTS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Admin Name
   Email: admin@salon.com
   Role: admin
   Beautician ID: (not linked)
   Active: Yes

💇 BEAUTICIAN ACCOUNTS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Sarah Johnson
   ID: 507f1f77bcf86cd799439011
   Email: sarah@salon.com
   Active: Yes
   Stripe Status: not_connected
```

---

### **Step 2: Link Admin to Beautician**

Use the emails from Step 1 to link them:

```bash
node scripts/linkAdminToBeautician.js <admin-email> <specialist-email>
```

**Example:**

```bash
node scripts/linkAdminToBeautician.js admin@salon.com sarah@salon.com
```

**Expected Output:**

```
✅ Connected to MongoDB
✅ Found admin: Admin Name (admin@salon.com)
✅ Found specialist: Sarah Johnson (sarah@salon.com)

🎉 Successfully linked admin to specialist!
   Admin: Admin Name (admin@salon.com)
   Beautician: Sarah Johnson
   Beautician ID: 507f1f77bcf86cd799439011

✅ Now log out and log back in to see Stripe Connect settings!
```

---

### **Step 3: Log Out and Log Back In**

1. Go to your frontend: `http://localhost:5173/admin`
2. **Log out** from your admin account
3. **Log back in** with the same credentials
4. Navigate to **Settings**: `http://localhost:5173/admin/settings`

---

### **Step 4: Verify Stripe Connect Appears**

You should now see the **"Stripe Connect Settings"** section at the top of Settings page with:

- 📊 Status badge: "Not Connected"
- 🔗 Button: "Connect with Stripe"

**Click "Connect with Stripe"** to start the onboarding process!

---

## 🔍 Alternative: If No Beautician Exists

If you don't have any specialists in the database yet, create one first:

### **Option A: Via Admin Panel**

1. Go to `http://localhost:5173/admin/staff`
2. Click "Add Staff Member"
3. Fill in specialist details (include email!)
4. Save

### **Option B: Via Database Script**

Create a quick script to add a specialist:

```bash
node -e "
import('mongodb').then(async ({ MongoClient }) => {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db();

  await db.collection('specialists').insertOne({
    name: 'Your Name',
    email: 'your@email.com',
    phone: '+44 1234 567890',
    active: true,
    stripeStatus: 'not_connected',
    createdAt: new Date(),
    updatedAt: new Date()
  });

  console.log('✅ Beautician created!');
  await client.close();
});
"
```

---

## 📊 What Gets Updated

When you link an admin to a specialist:

**Admin Model** gets:

```javascript
{
  email: "admin@salon.com",
  name: "Admin Name",
  beauticianId: "507f1f77bcf86cd799439011"  // ← NEW FIELD
}
```

**Frontend Redux State** (after re-login):

```javascript
{
  admin: {
    email: "admin@salon.com",
    name: "Admin Name",
    beauticianId: "507f1f77bcf86cd799439011"  // ← NOW AVAILABLE
  }
}
```

**Settings Page** now renders:

```jsx
{
  admin?.beauticianId && admin?.email && (
    <StripeConnectSettings
      beauticianId={admin.beauticianId}
      email={admin.email}
    />
  );
}
```

---

## ✅ Verification Checklist

After linking and re-logging in:

- [ ] Settings page shows "Stripe Connect Settings" section
- [ ] Status badge displays (should say "Not Connected")
- [ ] "Connect with Stripe" button is visible
- [ ] Clicking button redirects to Stripe
- [ ] Complete onboarding returns to success page
- [ ] Settings now shows "Connected" status
- [ ] "View Earnings" and "Stripe Dashboard" buttons appear

---

## 🐛 Troubleshooting

### Issue: "Admin not found"

**Solution:** Check the email spelling. Run `listAccounts.js` to see the correct email.

### Issue: "Beautician not found"

**Solution:** Create a specialist first via admin panel or database script.

### Issue: Still don't see Stripe Connect after re-login

**Solution:**

1. Open browser console (F12)
2. Check `localStorage.getItem('admin')`
3. Verify `beauticianId` field exists
4. If not, try clearing cache and logging in again

### Issue: "Cannot find module"

**Solution:** Make sure you're in the backend directory:

```bash
cd c:\Users\user\Desktop\beauty-salon-backend
```

---

## 🚀 Quick Commands Summary

```bash
# 1. See all accounts
node scripts/listAccounts.js

# 2. Link admin to specialist
node scripts/linkAdminToBeautician.js admin@salon.com specialist@salon.com

# 3. Restart backend (if needed)
npm run dev

# 4. In browser: Log out and log back in
```

---

## 📝 Files Modified

- ✅ `src/models/Admin.js` - Added `beauticianId` field
- ✅ `scripts/listAccounts.js` - List all admins and specialists
- ✅ `scripts/linkAdminToBeautician.js` - Link an admin to a specialist

---

**After Setup:** You'll be able to use all Stripe Connect features including onboarding, earnings tracking, and dashboard access! 🎉
