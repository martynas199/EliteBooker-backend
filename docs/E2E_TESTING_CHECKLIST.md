# End-to-End Testing Checklist

Complete manual testing guide for the multi-tenant beauty booking platform.

## Testing Overview

This guide covers:

1. **Tenant Signup Flow** - New salon registration
2. **Admin Dashboard** - Tenant management
3. **Specialist Onboarding** - Stripe Connect setup
4. **Customer Booking** - Appointment creation
5. **Payment Processing** - Platform fee collection
6. **Cross-Tenant Isolation** - Security verification

**Estimated Time:** 2-3 hours

---

## Prerequisites

### Test Accounts Needed

1. **Super Admin Account** (for tenant management testing)
2. **2 Test Tenants** (to test isolation)
3. **Stripe Test Account**
4. **Test Credit Cards** (provided by Stripe)

### Test Environment

- **Backend**: Running on `http://localhost:4000`
- **Frontend**: Running on `http://localhost:5173`
- **Database**: MongoDB with clean state

### Stripe Test Cards

```
Success: 4242 4242 4242 4242
Declined: 4000 0000 0000 0002
Requires Auth: 4000 0025 0000 3155

CVV: Any 3 digits
Expiry: Any future date
ZIP: Any 5 digits
```

---

## Test 1: Tenant Signup Flow

### 1.1 Create First Tenant

**Steps:**

1. Navigate to `http://localhost:5173/signup`
2. Fill in Step 1 (Business Information):
   ```
   Business Name: Elegant Beauty Salon
   Email: contact@elegant-beauty.com
   Phone: +441234567890
   Address: 123 Beauty Street
   City: London
   Postal Code: SW1A 1AA
   Country: UK
   ```
3. Click "Next"
4. Fill in Step 2 (Admin Account):
   ```
   Admin Name: Sarah Johnson
   Email: sarah@elegant-beauty.com
   Password: SecurePass123!
   Confirm Password: SecurePass123!
   ```
5. Click "Create Account"

**Expected Results:**

✅ Account created successfully  
✅ Redirected to `/admin/settings/onboarding-complete`  
✅ JWT token stored in localStorage  
✅ Tenant ID stored in localStorage  
✅ Welcome message displayed

**Verify in Database:**

```javascript
// Check tenant created
db.tenants.findOne({ slug: "elegant-beauty-salon" });

// Check admin created
db.admins.findOne({ email: "sarah@elegant-beauty.com" });

// Verify tenantId matches
db.admins.findOne({ email: "sarah@elegant-beauty.com" }).tenantId ===
  db.tenants.findOne({ slug: "elegant-beauty-salon" })._id;
```

---

### 1.2 Create Second Tenant (for isolation testing)

Repeat steps 1.1 with different data:

```
Business Name: Modern Spa & Wellness
Email: contact@modern-spa.com
Admin Name: Emma Wilson
Admin Email: emma@modern-spa.com
Password: SecurePass456!
```

**Expected Results:**

✅ Second tenant created independently  
✅ Different slug generated: `modern-spa-wellness`  
✅ No cross-contamination of data

---

## Test 2: Admin Dashboard Access

### 2.1 Login as Tenant 1 Admin

**Steps:**

1. Logout from current session
2. Navigate to `http://localhost:5173/admin/login`
3. Enter credentials:
   ```
   Email: sarah@elegant-beauty.com
   Password: SecurePass123!
   ```
4. Click "Login"

**Expected Results:**

✅ Login successful  
✅ Redirected to `/admin` (dashboard)  
✅ See "Elegant Beauty Salon" branding  
✅ See navigation menu  
✅ No data from other tenants visible

### 2.2 Navigate Dashboard

**Test each section:**

1. **Dashboard** - `/admin`

   - ✅ Stats displayed (appointments, revenue, etc.)
   - ✅ All data is for current tenant only

2. **Appointments** - `/admin/appointments`

   - ✅ Empty list initially
   - ✅ No appointments from other tenants

3. **Services** - `/admin/services`

   - ✅ Can create services
   - ✅ Services tagged with tenantId

4. **Staff** - `/admin/staff`

   - ✅ Can add specialists
   - ✅ Specialists tagged with tenantId

5. **Settings** - `/admin/tenant-settings`

   - ✅ Can view tenant info
   - ✅ Can update scheduling settings
   - ✅ Can modify platform fees

6. **Branding** - `/admin/branding`
   - ✅ Can change colors
   - ✅ Can upload logo
   - ✅ Can set hero images

---

## Test 3: Tenant Settings Management

### 3.1 Update Business Information

**Steps:**

1. Navigate to `/admin/tenant-settings`
2. Update phone: `+441234567899`
3. Update address: `456 New Location`
4. Click "Save Settings"

**Expected Results:**

✅ Settings saved successfully  
✅ Success message displayed  
✅ Data persisted in database

**Verify:**

```javascript
db.tenants.findOne({ slug: "elegant-beauty-salon" }).businessInfo.phone;
// Should be: "+441234567899"
```

### 3.2 Update Scheduling Settings

**Steps:**

1. Change "Slot Duration" to `45` minutes
2. Change "Buffer Time" to `15` minutes
3. Change "Cancellation Hours" to `48`
4. Click "Save Settings"

**Expected Results:**

✅ Settings updated  
✅ New slots reflect 45-minute duration

### 3.3 Update Platform Fees

**Steps:**

1. Change "Platform Fee per Booking" to `75` (£0.75)
2. Change "Platform Fee per Product" to `60` (£0.60)
3. Click "Save Settings"

**Expected Results:**

✅ Fees updated  
✅ Future bookings use new fee structure  
✅ Past bookings unchanged

---

## Test 4: Branding Customization

### 4.1 Change Brand Colors

**Steps:**

1. Navigate to `/admin/branding`
2. Set colors:
   ```
   Primary: #9333EA (Purple)
   Secondary: #EC4899 (Pink)
   Accent: #F59E0B (Amber)
   ```
3. Click "Save Branding"

**Expected Results:**

✅ Colors saved  
✅ Preview swatches updated  
✅ Refresh page to see new colors applied

### 4.2 Add Logo

**Steps:**

1. Enter logo URL: `https://via.placeholder.com/300x100/9333EA/FFFFFF?text=Elegant+Beauty`
2. Verify preview loads
3. Click "Save Branding"

**Expected Results:**

✅ Logo saved  
✅ Logo appears in preview  
✅ Logo visible on customer-facing pages

---

## Test 5: Specialist Management

### 5.1 Create Specialist

**Steps:**

1. Navigate to `/admin/staff`
2. Click "Add Specialist"
3. Fill in details:
   ```
   Name: Jessica Smith
   Email: jessica@elegant-beauty.com
   Phone: +441234567891
   Specialties: Hair Styling, Color Treatment
   Bio: 10 years of experience...
   Active: Yes
   ```
4. Click "Save"

**Expected Results:**

✅ Specialist created  
✅ Listed in staff table  
✅ tenantId automatically set

**Verify:**

```javascript
db.specialists.findOne({ email: "jessica@elegant-beauty.com" });
// Should have tenantId matching Elegant Beauty Salon
```

### 5.2 Stripe Connect Onboarding

**Steps:**

1. In staff list, find Jessica Smith
2. Click "Connect Stripe" button
3. Redirected to Stripe onboarding page
4. Fill in Stripe test information:
   ```
   Email: jessica@elegant-beauty.com
   Phone: +441234567891
   DOB: 01/01/1990
   Business Type: Individual
   Account: Use test routing number 110000000
   Account Number: 000123456789
   ```
5. Complete onboarding
6. Redirected back with `?stripe=success`

**Expected Results:**

✅ Stripe account created  
✅ Account ID saved to specialist record  
✅ Status updated to "connected"  
✅ Can accept payments

**Verify:**

```javascript
const specialist = db.specialists.findOne({
  email: "jessica@elegant-beauty.com",
});

console.log(specialist.stripeAccountId); // Should be "acct_..."
console.log(specialist.stripeStatus); // Should be "connected"
console.log(specialist.stripeOnboardingCompleted); // Should be true
```

### 5.3 Check Stripe Status

**Steps:**

1. In staff list, click "View Status" for Jessica
2. Status modal opens

**Expected Results:**

✅ Shows "Connected"  
✅ Displays account ID  
✅ Shows charges enabled: Yes  
✅ Shows payouts enabled: Yes

---

## Test 6: Service Creation

### 6.1 Create Service

**Steps:**

1. Navigate to `/admin/services`
2. Click "Add Service"
3. Fill in details:
   ```
   Name: Haircut & Style
   Description: Professional haircut with blow dry
   Duration: 60 minutes
   Price: £50.00 (5000 pence)
   Category: Hair
   Primary Specialist: Jessica Smith
   Active: Yes
   ```
4. Click "Save"

**Expected Results:**

✅ Service created  
✅ Appears in services list  
✅ tenantId automatically set  
✅ Associated with Jessica

---

## Test 7: Customer Booking Flow

### 7.1 Customer Visits Salon URL

**Steps:**

1. Open new incognito window (simulate customer)
2. Navigate to `http://localhost:5173/salon/elegant-beauty-salon`
3. Browse services and specialists

**Expected Results:**

✅ Tenant branding applied (purple colors)  
✅ Logo displayed  
✅ Only Elegant Beauty services shown  
✅ Only Elegant Beauty specialists shown  
✅ No data from Modern Spa visible

### 7.2 Select Service and Specialist

**Steps:**

1. Click "Book Now"
2. Select "Haircut & Style"
3. Select "Jessica Smith"
4. Click "Continue"

**Expected Results:**

✅ Shows available time slots  
✅ Slots based on tenant's scheduling settings (45-min duration)

### 7.3 Choose Date and Time

**Steps:**

1. Select tomorrow's date
2. Choose "10:00 AM" slot
3. Click "Continue to Details"

**Expected Results:**

✅ Booking form displayed  
✅ Service and time summary shown

### 7.4 Enter Customer Details

**Steps:**

1. Fill in form:
   ```
   Name: John Customer
   Email: john@customer.com
   Phone: +441234567892
   Notes: First visit
   ```
2. Click "Continue to Payment"

**Expected Results:**

✅ Redirected to checkout page  
✅ Shows booking summary  
✅ Shows total: £50.00

---

## Test 8: Payment Processing

### 8.1 Create Checkout Session

**Steps:**

1. On checkout page, click "Pay Now"
2. Redirected to Stripe Checkout

**Expected Results:**

✅ Stripe Checkout page opens  
✅ Shows correct amount: £50.00  
✅ Shows business name: "Elegant Beauty Salon"  
✅ Secure payment form

### 8.2 Complete Payment

**Steps:**

1. Enter test card details:
   ```
   Card: 4242 4242 4242 4242
   Expiry: 12/25
   CVV: 123
   ZIP: 12345
   ```
2. Click "Pay"

**Expected Results:**

✅ Payment processing...  
✅ Payment successful  
✅ Redirected to success page

### 8.3 Verify Payment in Stripe Dashboard

**Steps:**

1. Login to Stripe Dashboard (test mode)
2. Go to Payments section
3. Find recent payment

**Expected Results:**

✅ Payment shows £50.00  
✅ Application fee shows £0.75 (updated fee)  
✅ Transfer to Jessica's account: £49.25  
✅ Status: Succeeded

### 8.4 Verify in Database

**Check appointment:**

```javascript
const appointment = db.appointments.findOne({
  customerEmail: "john@customer.com",
});

console.log(appointment.status); // Should be "confirmed"
console.log(appointment.payment.status); // Should be "succeeded"
console.log(appointment.payment.amount); // Should be 5000
console.log(appointment.payment.stripe.platformFee); // Should be 75
console.log(appointment.tenantId); // Should match Elegant Beauty
```

---

## Test 9: Cross-Tenant Isolation

### 9.1 Login as Tenant 2

**Steps:**

1. Logout from Tenant 1 admin
2. Login as Modern Spa admin:
   ```
   Email: emma@modern-spa.com
   Password: SecurePass456!
   ```

**Expected Results:**

✅ Login successful  
✅ Dashboard loads  
✅ Different branding/colors

### 9.2 Verify Data Isolation

**Check each section:**

1. **Appointments**

   - ✅ Empty (no Elegant Beauty appointments visible)
   - ✅ Cannot see John Customer's booking

2. **Services**

   - ✅ Empty (no Elegant Beauty services)
   - ✅ "Haircut & Style" not visible

3. **Staff**

   - ✅ Empty (no Elegant Beauty staff)
   - ✅ Jessica Smith not visible

4. **Settings**
   - ✅ Shows Modern Spa info only
   - ✅ Cannot access Elegant Beauty settings

### 9.3 Attempt Cross-Tenant API Access

**Manual API test:**

```bash
# Get Tenant 1's appointment ID
APPOINTMENT_ID="..." # From Test 8.4

# Try to access with Tenant 2 token
curl http://localhost:4000/api/appointments/$APPOINTMENT_ID \
  -H "Authorization: Bearer <tenant2_token>" \
  -H "X-Tenant-ID: <tenant2_id>"
```

**Expected Results:**

✅ Returns 404 Not Found  
✅ Cannot access other tenant's data  
✅ No error messages leak information

### 9.4 Verify Database Queries

**Test query filtering:**

```javascript
// Simulate Tenant 2 context
const Appointment = require("./models/Appointment");
Appointment.setTenantContext(tenant2Id);

// Try to find Tenant 1's appointment
const result = await Appointment.findById(tenant1AppointmentId);

console.log(result); // Should be null (not found)
```

**Expected Results:**

✅ Returns null  
✅ Multi-tenant plugin prevents access  
✅ No cross-tenant data leakage

---

## Test 10: Super Admin Functionality

### 10.1 Create Super Admin Account

**In database:**

```javascript
db.admins.insertOne({
  email: "superadmin@platform.com",
  password: "<hashed_password>",
  name: "Platform Admin",
  role: "super-admin",
  // No tenantId for super admin
});
```

### 10.2 Login as Super Admin

**Steps:**

1. Login with super admin credentials
2. Navigate to `/admin/tenants`

**Expected Results:**

✅ Can access tenants page  
✅ See all tenants listed  
✅ See stats (2 active tenants)

### 10.3 View Tenant Details

**Steps:**

1. Click "View" on Elegant Beauty Salon
2. Navigate around dashboard

**Expected Results:**

✅ Impersonation mode activated  
✅ Yellow banner shows "viewing as tenant"  
✅ Can see all tenant data  
✅ Can perform admin actions

### 10.4 Exit Impersonation

**Steps:**

1. Click "Exit Impersonation" in yellow banner
2. Return to tenants list

**Expected Results:**

✅ Back to super admin view  
✅ Banner disappears  
✅ Can view all tenants again

### 10.5 Suspend Tenant

**Steps:**

1. Find Modern Spa in list
2. Click "Suspend"
3. Confirm action

**Expected Results:**

✅ Tenant status changed to "suspended"  
✅ Modern Spa admins cannot login  
✅ Customer bookings blocked  
✅ Can reactivate later

---

## Test 11: Product Purchase Flow

### 11.1 Create Product

**Steps:**

1. Login as Elegant Beauty admin
2. Navigate to `/admin/products`
3. Click "Add Product"
4. Fill details:
   ```
   Name: Premium Shampoo
   Price: £25.00
   Stock: 50
   Specialist: Jessica Smith
   Active: Yes
   ```
5. Save product

**Expected Results:**

✅ Product created  
✅ tenantId set  
✅ Associated with Jessica

### 11.2 Customer Purchases Product

**Steps:**

1. Open customer view: `/salon/elegant-beauty-salon`
2. Navigate to Products/Catalog
3. Add "Premium Shampoo" to cart
4. Proceed to checkout
5. Complete payment with test card

**Expected Results:**

✅ Order created  
✅ Payment processed  
✅ Platform fee £0.60 collected  
✅ Transfer £24.40 to Jessica

---

## Test 12: Webhook Verification

### 12.1 Test Webhook Events

**Setup Stripe CLI:**

```bash
stripe listen --forward-to localhost:4000/api/webhooks/stripe
```

**Create test payment and monitor webhooks:**

**Expected Events:**

✅ `checkout.session.completed` received  
✅ `payment_intent.succeeded` received  
✅ Appointment status updated  
✅ Platform fee logged

### 12.2 Test Account Update Webhook

**Steps:**

1. In Stripe Dashboard, update connected account
2. Change payout schedule

**Expected Events:**

✅ `account.updated` webhook received  
✅ Specialist record updated in database  
✅ `stripePayoutsEnabled` reflects changes

---

## Test Summary

### Results Checklist

**Core Functionality:**

- [ ] Tenant signup works
- [ ] Admin login works
- [ ] Settings management works
- [ ] Branding customization works
- [ ] Service creation works
- [ ] Specialist Stripe Connect works
- [ ] Customer booking works
- [ ] Payment processing works
- [ ] Platform fees collected correctly
- [ ] Product purchase works

**Security:**

- [ ] Cross-tenant isolation verified
- [ ] API access control works
- [ ] Database queries filtered
- [ ] No data leakage between tenants
- [ ] Super admin access control works

**Stripe Integration:**

- [ ] Onboarding flow works
- [ ] Payments processed correctly
- [ ] Platform fees deducted
- [ ] Transfers to specialists work
- [ ] Webhooks handled correctly

---

## Known Issues & Workarounds

### Issue: Onboarding link expires

**Workaround:** Generate new link via "Connect Stripe" button

### Issue: Webhook signature fails

**Solution:** Verify `STRIPE_WEBHOOK_SECRET` is correct

### Issue: Cross-tenant data visible

**Critical:** Report immediately - security issue

---

## Performance Testing

### Load Testing Checklist

- [ ] 100 concurrent tenant signups
- [ ] 1000 concurrent bookings
- [ ] 10,000 database queries
- [ ] Response time < 2 seconds
- [ ] No memory leaks
- [ ] Database indexes working

---

## Next Steps

After passing all tests:

1. ✅ Mark "Test End-to-End Multi-Tenant Flow" as complete
2. ✅ Deploy to staging environment
3. ✅ Repeat tests in staging
4. ✅ Fix any issues found
5. ✅ Get stakeholder approval
6. ✅ Deploy to production

---

## Test Report Template

```
Date: _______
Tester: _______
Environment: Local / Staging / Production

Tenant Signup: PASS / FAIL
Admin Dashboard: PASS / FAIL
Specialist Onboarding: PASS / FAIL
Customer Booking: PASS / FAIL
Payment Processing: PASS / FAIL
Platform Fees: PASS / FAIL
Cross-Tenant Isolation: PASS / FAIL
Super Admin: PASS / FAIL

Critical Issues:
1. _______
2. _______

Minor Issues:
1. _______
2. _______

Notes:
_______________________________
_______________________________

Overall Status: PASS / FAIL

Approved By: ___________________
Date: __________________________
```
