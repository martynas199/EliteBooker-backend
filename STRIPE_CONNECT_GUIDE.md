# Stripe Connect Implementation Guide

## Overview

This system uses **Stripe Connect Express** accounts to enable direct payouts to beauticians for both:

- **Service Bookings** - Platform keeps £0.50 per completed booking
- **Product Sales** - 100% goes to product owner (beautician)

## Architecture

```
Client Payment → Stripe → Split Payment:
                           ├─ Platform Fee (£0.50 for bookings)
                           └─ Beautician Account (rest of amount)
```

## Setup Instructions

### 1. Stripe Dashboard Setup

1. Log into your Stripe Dashboard
2. Navigate to **Connect → Settings**
3. Enable **Express** account type
4. Set your platform name and branding
5. Configure webhook endpoints (see Webhooks section below)

### 2. Environment Variables

Add to your `.env` file:

```bash
# Stripe Keys
STRIPE_SECRET_KEY=sk_test_...  # Your Stripe secret key
STRIPE_WEBHOOK_SECRET=whsec_...  # Webhook signing secret

# Platform Configuration
STRIPE_PLATFORM_FEE=50  # Platform fee in pence (£0.50)
FRONTEND_URL=http://localhost:5173  # For onboarding redirects
```

### 3. Webhook Configuration

In Stripe Dashboard → Developers → Webhooks:

**Endpoint URL:** `https://your-domain.com/api/webhooks/stripe`

**Events to listen for:**

- `checkout.session.completed`
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `charge.refunded`
- `account.updated`
- `payout.paid`

Copy the **Signing secret** to `STRIPE_WEBHOOK_SECRET` in your `.env`

## API Endpoints

### Stripe Connect Onboarding

#### Create Onboarding Link

```http
POST /api/connect/onboard
Content-Type: application/json

{
  "beauticianId": "64a1b2c3d4e5f6...",
  "email": "beautician@example.com"
}

Response:
{
  "success": true,
  "url": "https://connect.stripe.com/setup/...",
  "stripeAccountId": "acct_..."
}
```

#### Check Account Status

```http
GET /api/connect/status/:beauticianId

Response:
{
  "status": "connected",
  "connected": true,
  "stripeAccountId": "acct_...",
  "chargesEnabled": true,
  "detailsSubmitted": true,
  "payoutsEnabled": true
}
```

#### Generate Dashboard Link

```http
POST /api/connect/dashboard-link/:beauticianId

Response:
{
  "success": true,
  "url": "https://connect.stripe.com/express/..."
}
```

### Revenue Reports

#### Get Platform Revenue

```http
GET /api/reports/revenue?startDate=2025-01-01&endDate=2025-01-31

Response:
{
  "platform": {
    "totalFees": 125.00,  # Platform earnings
    "totalBookingRevenue": 3500.00,
    "totalProductRevenue": 1200.00
  },
  "beauticians": [
    {
      "beauticianId": "...",
      "beauticianName": "Jane Doe",
      "bookings": {
        "count": 45,
        "revenue": 2250.00,
        "platformFees": 22.50,
        "earnings": 2227.50
      },
      "products": {
        "count": 12,
        "revenue": 600.00
      },
      "totalEarnings": 2827.50
    }
  ]
}
```

#### Get Beautician Earnings

```http
GET /api/reports/beautician-earnings/:beauticianId

Response:
{
  "beautician": {
    "name": "Jane Doe",
    "stripeConnected": true
  },
  "bookings": {
    "count": 45,
    "earnings": 2227.50,
    "platformFees": 22.50
  },
  "products": {
    "count": 12,
    "earnings": 600.00
  },
  "totals": {
    "totalEarnings": 2827.50
  }
}
```

## Payment Flows

### Booking Payment with Connect

When a client books a service:

```javascript
const paymentIntent = await stripe.paymentIntents.create({
  amount: Math.round(price * 100), // £50.00 → 5000 pence
  currency: "gbp",
  payment_method_types: ["card"],
  application_fee_amount: 50, // £0.50 platform fee
  transfer_data: {
    destination: beautician.stripeAccountId, // Direct to beautician
  },
  metadata: {
    appointmentId: appointment._id,
    beauticianId: beautician._id,
    type: "booking",
  },
});
```

**Result:**

- £0.50 stays in platform account
- £49.50 transferred to beautician account
- Payment tracked in `Appointment.payment.stripe`

### Product Purchase with Connect

When a client buys a product:

```javascript
// Group items by beautician
const itemsByBeautician = groupBy(items, (item) => item.productId.beauticianId);

// Create separate Payment Intent for each beautician
for (const [beauticianId, items] of itemsByBeautician) {
  const total = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  await stripe.paymentIntents.create({
    amount: Math.round(total * 100),
    currency: "gbp",
    application_fee_amount: 0, // No platform fee for products
    transfer_data: {
      destination: beautician.stripeAccountId,
    },
    metadata: {
      orderId: order._id,
      beauticianId: beauticianId,
      type: "product",
    },
  });
}
```

**Result:**

- 100% of product price goes to beautician
- No platform fee
- Payment tracked in `Order.stripeConnectPayments`

## Refunds

### Booking Cancellation

```javascript
const refund = await stripe.refunds.create({
  payment_intent: appointment.payment.stripe.paymentIntentId,
  refund_application_fee: true, // Refund the £0.50 platform fee
  reverse_transfer: true, // Take money back from beautician
});
```

**Result:**

- Client receives full refund
- Platform fee returned
- Amount deducted from beautician's next payout

### Product Refund

```javascript
const refund = await stripe.refunds.create({
  payment_intent: order.stripePaymentIntentId,
  reverse_transfer: true, // Take from beautician
});
```

## Database Schema

### Beautician Model

```javascript
{
  stripeAccountId: String,  // Stripe Connect account ID
  stripeStatus: String,  // not_connected | pending | connected | rejected
  stripeOnboardingCompleted: Boolean,
  totalEarnings: Number,  // Cumulative earnings
  totalPayouts: Number,  // Total paid out by Stripe
  lastPayoutDate: Date
}
```

### Appointment Model

```javascript
{
  payment: {
    stripe: {
      paymentIntentId: String,
      platformFee: Number,  // Default 50 (£0.50)
      beauticianStripeAccount: String,
      transferId: String
    }
  }
}
```

### Order Model

```javascript
{
  stripeConnectPayments: [{
    beauticianId: ObjectId,
    beauticianStripeAccount: String,
    amount: Number,
    paymentIntentId: String,
    transferId: String,
    status: String  // pending | succeeded | failed | refunded
  }],
  refundStatus: String  // none | partial | full
}
```

## Testing

### Test Mode Setup

1. Use Stripe test keys (`sk_test_...`)
2. Create test connected accounts
3. Use test card: `4242 4242 4242 4242`
4. Use test bank account for payout testing

### Test Scenarios

**Onboarding:**

1. Create beautician account
2. Complete Stripe onboarding
3. Verify status updates to "connected"

**Booking Payment:**

1. Book a service with connected beautician
2. Complete payment (£50.00)
3. Verify:
   - Platform receives £0.50
   - Beautician receives £49.50
   - `totalEarnings` updated

**Refund:**

1. Cancel completed booking
2. Verify:
   - Client refunded £50.00
   - Platform refunded £0.50
   - Beautician balance reduced by £49.50

**Product Sale:**

1. Purchase product owned by beautician
2. Verify 100% goes to beautician
3. No platform fee charged

## Compliance

### KYC/AML

Stripe handles all KYC verification during onboarding:

- Identity verification
- Business verification (if applicable)
- Bank account verification

### Payouts

- Automatic daily payouts (after 2-day rolling basis)
- Beauticians can view in Stripe Express dashboard
- Platform has no control over payout timing

### Tax Reporting

- Stripe provides 1099 forms (US) or equivalent
- Beauticians responsible for own tax reporting
- Platform should provide revenue summaries

## Troubleshooting

### "Beautician not connected" Error

- Beautician hasn't completed onboarding
- Check account status: `GET /api/connect/status/:id`
- Generate new onboarding link if expired

### Payment Fails with Connect Error

- Verify beautician's `stripeAccountId` is valid
- Check account status in Stripe Dashboard
- Ensure `charges_enabled` is true

### Refund Fails

- Verify beautician has sufficient balance
- Check if transfer has already been reversed
- View detailed error in Stripe Dashboard

### Webhook Not Received

- Verify webhook endpoint is publicly accessible
- Check webhook signature is correct
- View webhook logs in Stripe Dashboard → Developers → Webhooks

## Next Steps

### Phase 1: Basic Implementation ✅

- [x] Stripe Connect account creation
- [x] Onboarding flow
- [x] Booking payments with platform fee
- [x] Product payments without fee
- [x] Refund handling
- [x] Webhook handlers
- [x] Revenue reporting

### Phase 2: Frontend Integration (In Progress)

- [ ] Beautician "Connect with Stripe" button
- [ ] Onboarding redirect handling
- [ ] Earnings dashboard for beauticians
- [ ] Admin revenue dashboard
- [ ] CSV export functionality

### Phase 3: Advanced Features

- [ ] Split payments for multi-beautician orders
- [ ] Dynamic platform fee configuration
- [ ] Commission-based pricing for products
- [ ] Payout schedule customization
- [ ] Dispute management UI

## Support

For Stripe Connect issues:

- Stripe Docs: https://stripe.com/docs/connect
- Stripe Support: https://support.stripe.com

For implementation questions:

- Check webhook logs in Stripe Dashboard
- Review server logs for detailed errors
- Test in Stripe test mode first
