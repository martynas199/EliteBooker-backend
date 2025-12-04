# Product Payments - Direct to Beautician (Zero Platform Fees)

## Overview

Product purchases now use **destination charges** to send payments directly to beauticians' Stripe Connect accounts. The platform pays **zero Stripe fees** and takes **no platform fee** on product sales.

## Key Changes

### 1. Payment Flow

**Before:**
- Multi-beautician orders: Platform received payment, then created transfers
- Platform paid Stripe fees on transfers
- Complex payment splitting logic

**After:**
- **Single beautician per order** (enforced)
- Direct destination charge to beautician's Stripe account
- Beautician pays ALL Stripe fees
- No platform fees
- No transfers needed

### 2. Stripe Integration

```javascript
// Product checkout - destination charge
sessionConfig.payment_intent_data = {
  transfer_data: {
    destination: beauticianStripeAccountId,
  },
  // NO application_fee_amount - zero platform fee
  metadata: {
    orderId: orderId,
    beauticianId: beauticianId,
    type: "product_direct_payment",
  },
};
```

**Key Points:**
- Uses `transfer_data.destination` for direct payment
- NO `application_fee_amount` (unlike services which use 50p)
- Beautician receives: `payment amount - Stripe fees`
- Platform receives: `£0`

### 3. Service Bookings (Unchanged)

Service bookings continue to work exactly as before:

```javascript
// Service booking - still uses application fee
payment_intent_data: {
  application_fee_amount: 50, // 50p platform fee
  transfer_data: {
    destination: beauticianStripeAccountId,
  },
};
```

**Service Payment Breakdown:**
- Beautician receives: `payment - Stripe fees - 50p`
- Platform receives: `50p` per booking
- Stripe fees: Deducted before transfer

## Security Enhancements

### 1. Price Validation
```javascript
// Always use database price, never trust client
price = requestedCurrency === "EUR" && variant.priceEUR != null
  ? variant.priceEUR
  : variant.price;
```

**Protects against:**
- Client-side price manipulation
- Fake discounts
- Cart tampering

### 2. Beautician Validation
```javascript
// Validate product ownership
if (!product.beauticianId) {
  return res.status(400).json({
    error: "Product is not assigned to a beautician",
  });
}

// Validate Stripe connection
if (!beautician.stripeAccountId || beautician.stripeStatus !== "connected") {
  return res.status(400).json({
    error: "Beautician hasn't set up payment processing",
  });
}
```

### 3. Quantity Validation
```javascript
// Validate quantity is positive integer
if (!Number.isInteger(item.quantity) || item.quantity < 1) {
  return res.status(400).json({
    error: "Invalid quantity",
  });
}
```

### 4. Single Beautician Enforcement
```javascript
// Restrict to single beautician per order
if (itemsByBeautician.size > 1) {
  return res.status(400).json({
    error: "Cannot checkout with products from multiple beauticians. Please complete separate orders for each beautician.",
  });
}
```

## Implementation Details

### Backend Changes

**File:** `src/routes/orders.js`

1. **Checkout Validation** (Lines ~285-350)
   - Validate product ownership
   - Validate Stripe account connection
   - Enforce price integrity
   - Enforce single beautician

2. **Session Creation** (Lines ~480-520)
   - Remove multi-beautician transfer logic
   - Use destination charges exclusively
   - Remove application_fee_amount for products
   - Add clear error messages

3. **Order Confirmation** (Lines ~95-145)
   - Simplified payment processing
   - Remove transfer creation
   - Update beautician earnings
   - Log direct payments

### Frontend Updates Needed

**File:** `src/features/cart/` (if exists)

1. **Cart Validation**
   ```javascript
   // Check if products are from multiple beauticians
   const beauticians = new Set(
     cart.items.map(item => item.product.beauticianId)
   );
   
   if (beauticians.size > 1) {
     // Show warning: "Please checkout products from each beautician separately"
     // Option 1: Split cart automatically
     // Option 2: Require user to remove items
   }
   ```

2. **Checkout Display**
   ```javascript
   // Show payment breakdown
   Subtotal: £70.00
   Shipping: £5.99
   ────────────────
   Total: £75.99
   
   // Paid directly to: [Beautician Name]
   // Note: No platform fees for product purchases
   ```

3. **Error Handling**
   ```javascript
   if (error.includes("multiple beauticians")) {
     // Show modal: "Split Your Cart"
     // Provide options to checkout separately
   }
   
   if (error.includes("hasn't set up payment processing")) {
     // Show: "This product is currently unavailable"
     // Suggest contacting support
   }
   ```

## Fee Breakdown Comparison

### Product Purchase (£50)
```
Customer pays:    £50.00
Stripe fee:       -£0.95 (1.5% + 20p)
Beautician gets:  £49.05
Platform gets:    £0.00
```

### Service Booking (£50)
```
Customer pays:    £50.00
Stripe fee:       -£0.95 (1.5% + 20p)
Platform fee:     -£0.50 (50p)
Beautician gets:  £48.55
Platform gets:    £0.50
```

## Refund Flow

### Product Refund
```javascript
const refund = await stripe.refunds.create({
  payment_intent: order.stripePaymentIntentId,
  reverse_transfer: true, // Reverse from beautician to customer
  metadata: {
    orderId: orderId,
    reason: reason,
  },
});
```

**Refund Breakdown:**
- Money returned from beautician to customer
- Stripe fees NOT refunded (beautician loses fees)
- Beautician earnings decremented
- Product stock restored

## Migration Notes

### Existing Orders
- Old orders with transfers: Keep as-is, don't modify
- Only new orders use destination charges
- Refunds work for both old and new orders

### Database
- No schema changes required
- `stripeConnectPayments` array continues to work
- `transferId` field no longer populated (new orders)

### Monitoring
```javascript
// Log direct payments
console.log(`[PRODUCT ORDER] Direct payment processed for beautician ${beauticianId} - amount: £${amount}`);

// Track in Stripe metadata
metadata: {
  type: "product_direct_payment",
  orderId: orderId,
  beauticianId: beauticianId,
}
```

## Testing Checklist

- [ ] Single product checkout (direct payment)
- [ ] Multiple products, same beautician (single payment)
- [ ] Multiple products, different beauticians (rejected)
- [ ] Unconnected beautician product (rejected)
- [ ] Price manipulation blocked
- [ ] Invalid quantity blocked
- [ ] Order confirmation emails sent
- [ ] Beautician earnings updated correctly
- [ ] Stock managed correctly
- [ ] Refunds work (reverse_transfer)
- [ ] Service bookings still use 50p fee
- [ ] Stripe Dashboard shows destination charges
- [ ] Platform account charged £0

## Deployment Steps

1. **Backend:**
   ```bash
   cd beauty-salon-backend
   git pull
   npm install
   pm2 restart backend
   ```

2. **Verify Configuration:**
   ```bash
   # Check environment variables
   echo $STRIPE_SECRET
   echo $FRONTEND_URL
   ```

3. **Test in Stripe Test Mode:**
   - Use test beautician accounts
   - Complete test checkout
   - Verify direct charge in Stripe Dashboard
   - Confirm no platform fees

4. **Monitor Logs:**
   ```bash
   pm2 logs backend --lines 100
   # Look for: [PRODUCT CHECKOUT] and [PRODUCT ORDER] logs
   ```

5. **Switch to Live Mode:**
   - Update Stripe API keys to live mode
   - Test with real (small amount) purchase
   - Monitor for 24 hours

## Support & Troubleshooting

### Common Issues

**Issue:** "Beautician hasn't set up payment processing"
- **Cause:** Beautician's Stripe account not connected
- **Fix:** Beautician must complete Stripe Connect onboarding

**Issue:** "Cannot checkout with products from multiple beauticians"
- **Cause:** Cart contains products from 2+ beauticians
- **Fix:** User must checkout separately for each beautician

**Issue:** Platform still getting charged fees
- **Cause:** Using transfers instead of destination charges
- **Fix:** Verify `payment_intent_data.transfer_data.destination` is set
- **Fix:** Verify NO `application_fee_amount` for products

### Verification Queries

```javascript
// Check if order used direct payment
const order = await Order.findById(orderId);
console.log(order.stripeConnectPayments);
// Should have: beauticianStripeAccount, no transferId

// Check beautician earnings
const beautician = await Beautician.findById(beauticianId);
console.log(beautician.totalEarnings);

// Check Stripe payment details
const paymentIntent = await stripe.paymentIntents.retrieve(piId);
console.log(paymentIntent.transfer_data); // Should show destination
console.log(paymentIntent.application_fee_amount); // Should be null for products
```

## API Changes Summary

### POST /api/orders/checkout

**New Validations:**
- Single beautician per order (enforced)
- Beautician must have connected Stripe account
- Price validation (uses database, not client)
- Quantity validation (positive integer)

**New Response Codes:**
- `400`: Multiple beauticians in cart
- `400`: Beautician not connected to Stripe
- `400`: Invalid quantity or price
- `400`: Product not assigned to beautician

### GET /api/orders/confirm-checkout

**Changes:**
- Removed transfer creation logic
- Simplified payment processing
- Updated logging

### POST /api/orders/:id/refund

**No changes** - refunds work with `reverse_transfer: true`

## Future Enhancements

1. **Multi-Beautician Support** (if needed)
   - Create separate Stripe sessions per beautician
   - Link sessions with common order group
   - Handle partial payments/refunds

2. **Split Payment Display**
   - Show breakdown per beautician in cart
   - Display separate payment buttons
   - Group confirmation emails

3. **Beautician Dashboard**
   - Show direct payment earnings
   - Display Stripe fee breakdown
   - Export payment reports

4. **Analytics**
   - Track platform vs direct payments
   - Monitor beautician earnings
   - Report on fee distribution

---

**Last Updated:** 2025-11-16  
**Version:** 1.0.0  
**Author:** AI Development Team
