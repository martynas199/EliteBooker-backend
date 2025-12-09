# 🧪 Testing Stripe Fee Allocation

## ✅ Changes Applied

Both booking and product payments now ensure specialists pay Stripe processing fees (when possible).

---

## 🎯 What to Test

### **1. Booking Payment** ✅ HIGH PRIORITY

**Steps:**

1. Go to booking page
2. Select service, specialist, time slot
3. Complete checkout
4. Check Stripe Dashboard

**Expected Results:**

- Customer pays: Full service price (e.g., £50)
- Stripe fee (~£1.65): Deducted from specialist
- Platform fee: £0.50
- Specialist receives: £47.85

**In Stripe Dashboard:**

- Go to Connect → Connected accounts
- Click on specialist's account
- Check "Payments" tab
- Fee should show as charged to connected account

---

### **2. Single Product Order** ✅ HIGH PRIORITY

**Steps:**

1. Go to shop
2. Add products from ONE specialist to cart
3. Complete checkout
4. Check Stripe Dashboard

**Expected Results:**

- Customer pays: Product total (e.g., £100)
- Stripe fee (~£3.10): Deducted from specialist
- Platform fee: £0.00
- Specialist receives: £96.90

**In Stripe Dashboard:**

- Check specialist's Connect account
- Fee should be charged to connected account

---

### **3. Multi-Specialist Order** ⚠️ LOWER PRIORITY

**Steps:**

1. Go to shop
2. Add products from MULTIPLE specialists
3. Complete checkout

**Expected Results:**

- Customer pays: Product total (e.g., £100)
- Stripe fee (~£3.10): Paid by platform
- Each specialist receives: Full amount for their products
- Platform absorbs: ~£3.10 fee

**Note:** This is a rare edge case and acceptable compromise.

---

## 🔍 How to Verify in Stripe Dashboard

### **Method 1: Check Fee Details**

1. Log into Stripe Dashboard (test mode)
2. Go to **Payments** → Find the payment
3. Click on payment to see details
4. Look for "Application fee" and "Stripe fee"
5. Check which account was charged the fee

### **Method 2: Check Connected Account Balance**

1. Go to **Connect** → **Connected accounts**
2. Click on specialist's account
3. Go to **Balance** or **Payouts**
4. Verify the amount matches expected (after fees)

### **Method 3: Check Payment Intent**

1. Go to **Developers** → **API logs**
2. Find the `payment_intent.created` event
3. Check for `on_behalf_of` parameter
4. Should match specialist's Stripe account ID

---

## 💡 Test Card Numbers

Use Stripe test cards:

- **Success**: `4242 4242 4242 4242`
- **Requires authentication**: `4000 0025 0000 3155`
- **Declined**: `4000 0000 0000 9995`

**Expiry**: Any future date (e.g., 12/30)
**CVC**: Any 3 digits (e.g., 123)
**ZIP**: Any 5 digits (e.g., 12345)

---

## 📊 Expected Fee Breakdown

### **Booking Example: £50 Service**

```
Customer Payment:     £50.00
─────────────────────────────
Stripe Fee (2.9%+20p): -£1.65  ← Charged to specialist
Platform Fee:          -£0.50  ← Goes to platform
─────────────────────────────
Specialist Receives:   £47.85
```

### **Product Example: £100 Single Specialist**

```
Customer Payment:     £100.00
─────────────────────────────
Stripe Fee (2.9%+20p): -£3.10  ← Charged to specialist
Platform Fee:          £0.00
─────────────────────────────
Specialist Receives:   £96.90
```

---

## ⚠️ Troubleshooting

### **Issue: Platform still paying fees**

**Check:**

1. Is specialist's Stripe account fully onboarded?
2. Check `stripeStatus === 'connected'` in database
3. Verify `on_behalf_of` parameter in payment intent
4. Check API logs for errors

**Fix:**

- Re-run specialist Stripe onboarding
- Ensure `specialistId` is linked to admin account
- Check environment variables are set

### **Issue: Payment fails**

**Check:**

1. Stripe API keys are correct (test mode vs live mode)
2. Webhook endpoint is configured
3. Connected account has capabilities enabled

---

## 🎉 Success Indicators

- ✅ Bookings complete successfully
- ✅ Products complete successfully
- ✅ Stripe Dashboard shows fees charged to specialist (not platform)
- ✅ Specialist balance reflects net amount (after fees)
- ✅ Platform only receives application fee (£0.50 for bookings, £0 for products)

---

## 📝 What Changed in Code

### **File: `src/routes/checkout.js`** (Bookings)

```javascript
payment_intent_data.on_behalf_of = specialist.stripeAccountId;
```

### **File: `src/routes/orders.js`** (Products)

```javascript
// For single-specialist orders
if (stripeConnectPayments.length === 1) {
  sessionConfig.payment_intent_data = {
    on_behalf_of: payment.beauticianStripeAccount,
    application_fee_amount: 0,
    transfer_data: {
      destination: payment.beauticianStripeAccount,
    },
  };
}
```

---

## 🔗 Documentation

See `STRIPE_FEE_RESPONSIBILITY.md` for complete technical details.
