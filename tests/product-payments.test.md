# Product Payment Tests

## Test Scenarios for Direct Beautician Payments (Zero Platform Fees)

### 1. Single Product Checkout - Success

**Setup:**

- Product A belongs to Beautician 1
- Beautician 1 has connected Stripe account
- Product price: £50
- Customer: test@example.com

**Expected:**

- ✅ Checkout session created with destination charge
- ✅ Payment goes directly to Beautician 1's Stripe account
- ✅ Beautician 1 pays Stripe processing fee (~1.5% + 20p)
- ✅ Platform account charged £0
- ✅ No application_fee_amount in payment_intent_data
- ✅ Order status: paid
- ✅ Beautician earnings increased by £50

**Test Command:**

```bash
curl -X POST http://localhost:5000/api/orders/checkout \
  -H "Content-Type: application/json" \
  -d '{
    "items": [{
      "productId": "PRODUCT_A_ID",
      "quantity": 1
    }],
    "shippingAddress": {
      "email": "test@example.com",
      "firstName": "Test",
      "lastName": "User",
      "address": "123 Test St",
      "city": "London",
      "postalCode": "SW1A 1AA",
      "country": "United Kingdom",
      "phone": "+44 20 1234 5678"
    },
    "shippingMethod": {
      "name": "Standard",
      "price": 5.99
    }
  }'
```

**Verify:**

1. Check Stripe Dashboard → Beautician 1 account
2. Confirm direct charge (not transfer)
3. Verify fee is deducted from Beautician 1's payout
4. Platform account should show £0 for this transaction

---

### 2. Multiple Products, Same Beautician - Success

**Setup:**

- Product A and Product B both belong to Beautician 1
- Beautician 1 has connected Stripe account
- Product A: £30, Product B: £40
- Total: £70

**Expected:**

- ✅ Single checkout session created
- ✅ Single destination charge to Beautician 1
- ✅ Beautician 1 pays fees on £70 + shipping
- ✅ Platform pays £0
- ✅ Beautician earnings increased by £70

---

### 3. Multiple Products, Different Beauticians - Rejected

**Setup:**

- Product A belongs to Beautician 1
- Product B belongs to Beautician 2
- Both specialists connected

**Expected:**

- ❌ 400 Error: "Cannot checkout with products from multiple specialists. Please complete separate orders for each specialist."
- ✅ No payment session created
- ✅ User prompted to checkout separately

**Test Command:**

```bash
curl -X POST http://localhost:5000/api/orders/checkout \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {"productId": "PRODUCT_A_ID", "quantity": 1},
      {"productId": "PRODUCT_B_ID", "quantity": 1}
    ],
    "shippingAddress": {...}
  }'
```

---

### 4. Beautician Not Connected to Stripe - Rejected

**Setup:**

- Product A belongs to Beautician 1
- Beautician 1 has NOT connected Stripe account

**Expected:**

- ❌ 400 Error: "Product [name] belongs to a specialist who hasn't set up payment processing yet. Please contact support."
- ✅ No payment session created
- ✅ User sees clear error message

---

### 5. Price Manipulation Attempt - Blocked

**Setup:**

- Product A actual price: £50
- Attacker sends modified price: £10 in request

**Expected:**

- ✅ Server uses database price (£50), ignores client price
- ✅ Checkout session created with correct £50 price
- ✅ Security validation passes

**Test Command:**

```bash
# Send manipulated price (should be ignored)
curl -X POST http://localhost:5000/api/orders/checkout \
  -H "Content-Type: application/json" \
  -d '{
    "items": [{
      "productId": "PRODUCT_A_ID",
      "quantity": 1,
      "price": 10
    }],
    "shippingAddress": {...}
  }'
```

**Verify:**

- Check Stripe session line items - should show £50, not £10

---

### 6. Invalid Quantity - Rejected

**Setup:**

- Product A: £50
- Request with quantity: -1 or 0 or 1.5

**Expected:**

- ❌ 400 Error: "Invalid quantity for [product name]"
- ✅ No session created

---

### 7. Order Confirmation Flow

**Setup:**

- Completed checkout session from Test #1
- Stripe payment successful

**Expected:**

- ✅ Order status updated to "paid"
- ✅ stripeConnectPayments[0].status = "succeeded"
- ✅ Beautician totalEarnings incremented correctly
- ✅ Stock reduced for products
- ✅ Customer email sent
- ✅ Admin notification sent

---

### 8. Product Refund - Full Reversal

**Setup:**

- Order from Test #1 completed
- Admin issues refund

**Expected:**

- ✅ Stripe refund created with reverse_transfer: true
- ✅ Money returned from Beautician 1 to customer
- ✅ Stripe fees NOT refunded to specialist
- ✅ Beautician totalEarnings decremented
- ✅ Product stock restored
- ✅ Order status: "refunded"

**Test Command:**

```bash
curl -X POST http://localhost:5000/api/orders/ORDER_ID/refund \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Customer request"
  }'
```

---

### 9. Service vs Product Checkout Comparison

**IMPORTANT:** Verify services still work correctly

**Service Booking (should be UNCHANGED):**

- ✅ Uses application_fee_amount: 50 (50p platform fee)
- ✅ Uses transfer_data.destination
- ✅ Beautician receives: payment - Stripe fees - 50p platform fee
- ✅ Platform receives: 50p per booking

**Product Checkout (NEW behavior):**

- ✅ NO application_fee_amount
- ✅ Uses transfer_data.destination
- ✅ Beautician receives: payment - Stripe fees
- ✅ Platform receives: £0

---

### 10. Mixed Cart (Service + Product) - If Supported

**Note:** Check if system supports this or if separate checkouts required

If supported:

- Service: Use application_fee_amount
- Product: Use destination charge without fee

If not supported:

- Reject with clear error message

---

## Validation Checklist

### Security ✓

- [x] Always use database prices, never client-provided
- [x] Validate beauticianId belongs to product
- [x] Validate stripeAccountId is registered and connected
- [x] Validate quantity is positive integer
- [x] Validate price is valid number >= 0
- [x] Sanitize all API inputs
- [x] Restrict to single specialist per order

### Platform Fee ✓

- [x] No application_fee_amount for products
- [x] No transfers (direct destination charges only)
- [x] Platform charged £0 Stripe fees
- [x] Beautician pays ALL Stripe fees

### Stripe Connect ✓

- [x] Destination charges used (not separate charges)
- [x] Payment goes directly to specialist account
- [x] Refunds use reverse_transfer: true

### User Experience ✓

- [x] Clear error for multi-specialist checkout
- [x] Clear error for unconnected specialist
- [x] Proper order confirmation emails
- [x] Correct payment breakdown shown

### Data Integrity ✓

- [x] Beautician earnings tracked correctly
- [x] Stock managed correctly
- [x] Order status transitions correct
- [x] Payment status tracking accurate

---

## Manual Testing Steps

1. **Setup Test Environment:**

   - Create 2 test specialists
   - Connect Beautician 1 to Stripe (use Stripe test mode)
   - Leave Beautician 2 unconnected
   - Create 3 test products:
     - Product A (Beautician 1) - £30
     - Product B (Beautician 1) - £40
     - Product C (Beautician 2) - £50

2. **Run Test Suite:**

   ```bash
   # Test 1: Single product
   # Test 2: Multiple products, same specialist
   # Test 3: Multiple products, different specialists (should fail)
   # Test 4: Product from unconnected specialist (should fail)
   # Test 5: Complete checkout and verify Stripe Dashboard
   # Test 6: Issue refund and verify reversal
   ```

3. **Verify in Stripe Dashboard:**

   - Check Beautician 1's Stripe account
   - Confirm charges show as direct charges (not transfers)
   - Verify fees are shown on specialist's side
   - Confirm platform account has £0 from product sales

4. **Compare Service Bookings:**
   - Make a test service booking
   - Verify 50p platform fee is still collected
   - Confirm product orders have no platform fee

---

## Expected Outcomes Summary

| Scenario                  | Platform Fee | Stripe Fees Paid By | Payment Method        |
| ------------------------- | ------------ | ------------------- | --------------------- |
| Service Booking           | 50p          | Beautician          | Destination + App Fee |
| Single Product            | £0           | Beautician          | Destination Charge    |
| Multi-Product (Same)      | £0           | Beautician          | Destination Charge    |
| Multi-Product (Different) | N/A          | N/A                 | ❌ Rejected           |

---

## Notes for Developers

- Products MUST have a beauticianId assigned
- Beauticians MUST complete Stripe Connect onboarding before products can be sold
- Frontend should prevent multi-specialist cart checkout (UI validation)
- Backend enforces single-specialist rule (API validation)
- No changes needed to service booking flow
