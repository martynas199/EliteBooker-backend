# 🔍 How to Verify Stripe Fee Allocation is Working

## ✅ What You Just Saw (Connected Account Payment View)

```
Payment amount:    £50.00
Application fees:  -£0.50
Net amount:        £49.50
```

**This is CORRECT!** Here's why:

---

## 🎯 How Stripe `on_behalf_of` Works

When you use `on_behalf_of` with destination charges:

1. **Payment flows to connected account**: £50.00
2. **Platform takes application fee**: £0.50
3. **Connected account receives**: £49.50
4. **Stripe processing fee (~£1.65)**: Charged to connected account's **overall Stripe balance**, not visible in individual payment

---

## 🔍 Where to See the Stripe Fee

### **Option 1: Check Platform Account Balance Transaction**

1. Log into **Platform Stripe Account**
2. Go to **Balance** → **Transactions**
3. Find the payment for £50.00
4. Click on it
5. You should see:
   ```
   Gross:     £0.50  (your application fee)
   Stripe fee: £0.00  (platform pays nothing!)
   Net:       £0.50
   ```

**If you see this, it's working!** Platform only gets £0.50, pays no Stripe fees.

### **Option 2: Check Connected Account Balance**

1. Go to **Connect** → **Accounts** → Click specialist account
2. Click **"View in Dashboard"** or **"Sign in to account"**
3. Go to **Balance** → **Transactions**
4. Look at the **balance changes over time**
5. The Stripe fee will be deducted from their running balance

### **Option 3: Check Balance Transaction Details**

1. In Platform account, go to **Payments**
2. Click on the £50.00 payment
3. Scroll down to **"Balance transaction"** section
4. Click on the balance transaction ID (e.g., `txn_...`)
5. This shows the detailed fee breakdown
6. Check if fee is £0 for platform

---

## 💡 The Key Difference

### **WITHOUT `on_behalf_of`** (Old way - Platform pays):

```
Platform Account:
  Gross:     £50.00
  Stripe fee: -£1.65  ← Platform pays this!
  App fee:    £0.50
  Net:        -£1.15  (platform loses money!)

Connected Account:
  Receives:   £49.50
```

### **WITH `on_behalf_of`** (New way - Beautician pays):

```
Platform Account:
  Gross:     £0.50   (only app fee)
  Stripe fee: £0.00  ← Platform pays nothing!
  Net:        £0.50  ✅

Connected Account:
  Receives:   £49.50
  Stripe fee: -£1.65  (deducted from their balance)
  Net impact: £47.85
```

---

## 🧪 Quick Test to Verify

Run this command in your terminal to check the balance transaction:

```powershell
stripe payment_intents retrieve pi_3SP7bBAN8wTZWWpP3WvbBqar --expand application_fee_amount
```

Look for:

- `application_fee_amount: 50` ✅ (Platform gets £0.50)
- `on_behalf_of: "acct_1SP6S8PL8sEGP84H"` ✅ (Beautician pays Stripe fees)

---

## 🎉 What to Expect

### **Platform Account View** (Your main account):

- Each booking: **Net = £0.50** (only application fee)
- **No Stripe processing fees** deducted from your balance

### **Connected Account View** (Beautician):

- Each booking: **Receives £49.50** (£50 - £0.50 app fee)
- **Stripe fees (~£1.65) deducted from their overall balance**
- Final available: **~£47.85 per £50 booking**

---

## ⚠️ Important Note

The connected account payment view you showed is **correct**:

```
Payment amount:    £50.00
Application fees:  -£0.50
Net amount:        £49.50
```

The Stripe processing fee **won't show here** because it's charged to their **account balance**, not deducted from this specific payment transfer.

**To truly verify**: Check your **Platform account** balance transaction and confirm you only received £0.50 net (not £50 minus fees).

---

## ✅ Summary

If in your **Platform Account** you see:

- Net received: **£0.50** (not £48.85 or similar)

Then **it's working!** The specialist is paying the Stripe fees from their balance, and you're only getting your £0.50 application fee.
