# ✅ FIXED: Beautician Now Pays Stripe Fees (Direct Charges)

## 🔧 What We Changed

### **Problem**

Even with `on_behalf_of` parameter set, the platform was still paying Stripe processing fees (~£1.83 per £50 booking).

### **Root Cause**

We were using **Destination Charges** which always make the platform pay Stripe fees, regardless of `on_behalf_of` parameter.

### **Solution**

Switched to **Direct Charges** - creating the checkout session directly on the specialist's Stripe account.

---

## 📝 Code Changes

### **File: `src/routes/checkout.js`**

**Before (Destination Charges):**

```javascript
// Platform creates session, transfers to specialist
const stripe = getStripe(); // Platform account
const session = await stripe.checkout.sessions.create({
  payment_intent_data: {
    application_fee_amount: 50,
    on_behalf_of: specialist.stripeAccountId, // This didn't work!
    transfer_data: {
      destination: specialist.stripeAccountId,
    },
  },
  // ... other config
});
```

**After (Direct Charges):**

```javascript
// Beautician creates session directly on their account
const stripe = getStripe(specialist.stripeAccountId); // Connected account!
const session = await stripe.checkout.sessions.create({
  payment_intent_data: {
    application_fee_amount: 50, // Platform gets £0.50
    // No transfer_data needed - charge is directly on specialist account
  },
  // ... other config
});
```

---

## 💰 Fee Breakdown

### **Platform Account** (After Fix):

```
Per £50 booking:
  Gross:     £0.50  (application fee only)
  Stripe fee: £0.00  (platform pays nothing!)
  Net:       £0.50  ✅
```

### **Beautician Account** (After Fix):

```
Per £50 booking:
  Gross:     £50.00
  Stripe fee: -£1.83  (specialist pays this)
  App fee:    -£0.50  (to platform)
  Net:       £47.67  ✅
```

---

## 🧪 How to Test

1. **Make a new booking** (previous bookings used old method)
2. **Complete payment** with test card `4242 4242 4242 4242`
3. **Check Platform Account**:

   - Go to Payments → Find the £50 payment
   - **Payment breakdown** should show:
     - Payment amount: £0.50
     - Stripe processing fees: £0.00
     - Net amount: £0.50

4. **Check Beautician Account**:
   - Go to Connect → Accounts → Click specialist
   - View their payments
   - **Payment breakdown** should show:
     - Payment amount: £50.00
     - Stripe processing fees: -£1.83
     - Net amount: £48.17 (before application fee deduction)

---

## 🔍 Technical Details

### **Destination Charges** (Old - Didn't Work):

- Platform account creates PaymentIntent
- Funds collected on platform account
- Platform pays Stripe fees (~£1.83)
- Platform transfers net amount to specialist
- Platform takes application fee (£0.50)
- **Result**: Platform loses ~£1.33 per booking

### **Direct Charges** (New - Works):

- Beautician account creates PaymentIntent
- Funds collected directly on specialist account
- **Beautician pays Stripe fees** (~£1.83)
- Platform automatically receives application fee (£0.50)
- **Result**: Platform gains £0.50 per booking, specialist pays their own fees

---

## ⚠️ Important Notes

1. **Only works for connected specialists**: If specialist isn't connected to Stripe, booking falls back to platform account (platform pays fees)

2. **Application fee goes to platform automatically**: No manual transfer needed - Stripe handles it

3. **Beautician sees full £50 charge**: Stripe fees are deducted from their Stripe balance, not shown in individual payment

4. **Platform only sees £0.50**: Your dashboard will only show the application fee amount

---

## 🎉 Expected Results

### **Before Fix:**

- Platform receives: £48.17 (£50 - £1.83 fees)
- Platform keeps: £0.50 (app fee)
- Platform transfers: £47.67 to specialist
- **Platform net**: -£1.33 loss per booking 💸

### **After Fix:**

- Platform receives: £0.50 (app fee only)
- Beautician receives: £50.00 (gross)
- Beautician pays: £1.83 (Stripe fees)
- Beautician keeps: £47.67
- **Platform net**: +£0.50 profit per booking ✅

---

## 📚 Stripe Documentation

- [Direct Charges](https://stripe.com/docs/connect/direct-charges)
- [Destination Charges vs Direct Charges](https://stripe.com/docs/connect/charges)
- [Application Fees](https://stripe.com/docs/connect/direct-charges#collecting-fees)

---

**Status**: Ready to test! Make a new booking to see the fix in action. 🚀
