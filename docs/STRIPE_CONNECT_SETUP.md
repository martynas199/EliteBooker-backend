# Stripe Connect Setup Guide

Complete guide for setting up Stripe Connect in your multi-tenant beauty booking platform.

## Overview

The platform uses **Stripe Connect** to enable:

- Platform collects payments on behalf of tenants
- Automatic platform fee deduction (£0.50 per booking/product by default)
- Direct transfers to specialist Stripe accounts
- Separate payouts for each specialist

## Architecture

```
Customer Payment → Platform Stripe Account → Transfer to Specialist Account
                   ↓
              Platform Fee (£0.50) retained
```

## Prerequisites

1. **Stripe Account** (Platform Level)

   - Sign up at https://stripe.com
   - Complete business verification
   - Enable "Connect" in your Dashboard

2. **Environment Variables**
   ```bash
   STRIPE_SECRET_KEY=sk_test_...           # Your platform secret key
   STRIPE_WEBHOOK_SECRET=whsec_...         # Webhook signing secret
   STRIPE_CONNECT_CLIENT_ID=ca_...         # Connect client ID
   FRONTEND_URL=http://localhost:5173      # Frontend URL for redirects
   ```

## Step 1: Platform Stripe Account Setup

### 1.1 Get API Keys

1. Go to https://dashboard.stripe.com/apikeys
2. Copy your **Secret Key** (starts with `sk_test_` or `sk_live_`)
3. Add to `.env`:
   ```bash
   STRIPE_SECRET_KEY=sk_test_your_key_here
   ```

### 1.2 Enable Stripe Connect

1. Go to https://dashboard.stripe.com/connect/accounts/overview
2. Click "Get Started" on Connect
3. Fill in your platform details:
   - **Platform Name**: Your SaaS Platform Name
   - **Support Email**: your-support@example.com
   - **Industry**: Software/SaaS
4. Copy your **Connect Client ID** (starts with `ca_`)
5. Add to `.env`:
   ```bash
   STRIPE_CONNECT_CLIENT_ID=ca_your_client_id_here
   ```

### 1.3 Configure Connect Settings

1. Go to https://dashboard.stripe.com/settings/connect
2. **Branding**:
   - Upload your platform logo
   - Set brand color
3. **OAuth Settings**:
   - Add redirect URIs:
     ```
     http://localhost:5173/admin/specialists/*
     https://yourdomain.com/admin/specialists/*
     ```

## Step 2: Webhook Configuration

### 2.1 Create Webhook Endpoint

1. Go to https://dashboard.stripe.com/webhooks
2. Click "Add Endpoint"
3. **Endpoint URL**: `https://yourdomain.com/api/webhooks/stripe`
4. **Events to listen for**:
   ```
   checkout.session.completed
   payment_intent.succeeded
   payment_intent.payment_failed
   charge.refunded
   account.updated
   account.application.authorized
   account.application.deauthorized
   payout.paid
   ```

### 2.2 Get Webhook Secret

1. After creating webhook, click to reveal "Signing secret"
2. Copy the secret (starts with `whsec_`)
3. Add to `.env`:
   ```bash
   STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
   ```

### 2.3 Test Webhooks Locally

For local development, use Stripe CLI:

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe  # macOS
# or download from https://stripe.com/docs/stripe-cli

# Login
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:4000/api/webhooks/stripe

# Copy the webhook signing secret shown and add to .env
```

## Step 3: Specialist Onboarding Flow

### 3.1 Create Stripe Connect Account

When a specialist needs to connect their bank account:

```javascript
// Backend: POST /api/specialists/:id/stripe/onboard
const account = await stripe.accounts.create({
  type: "express",
  country: "GB",
  email: specialist.email,
  capabilities: {
    card_payments: { requested: true },
    transfers: { requested: true },
  },
  business_type: "individual",
  metadata: {
    specialistId: specialist._id.toString(),
    tenantId: specialist.tenantId.toString(),
  },
});
```

### 3.2 Generate Onboarding Link

```javascript
const accountLink = await stripe.accountLinks.create({
  account: accountId,
  refresh_url: `${FRONTEND_URL}/admin/specialists/${id}?stripe=refresh`,
  return_url: `${FRONTEND_URL}/admin/specialists/${id}?stripe=success`,
  type: "account_onboarding",
});

// Redirect specialist to accountLink.url
```

### 3.3 Frontend Integration

```jsx
// In your Admin panel
const handleStripeConnect = async (specialistId) => {
  const response = await api.post(
    `/api/specialists/${specialistId}/stripe/onboard`
  );

  // Redirect to Stripe onboarding
  window.location.href = response.data.url;
};
```

### 3.4 Handle Return from Stripe

```jsx
// Check URL params after Stripe redirect
useEffect(() => {
  const params = new URLSearchParams(window.location.search);

  if (params.get("stripe") === "success") {
    // Onboarding completed
    toast.success("Stripe account connected successfully!");
  } else if (params.get("stripe") === "refresh") {
    // User needs to complete onboarding again
    toast.warning("Please complete your Stripe onboarding");
  }
}, []);
```

## Step 4: Payment Flow with Platform Fees

### 4.1 Appointment Checkout

```javascript
// Backend: routes/checkout.js
const tenant = req.tenant;
const platformFee = tenant?.paymentSettings?.platformFeePerBooking || 50; // £0.50

const session = await stripe.checkout.sessions.create({
  mode: "payment",
  payment_method_types: ["card"],
  line_items: [
    {
      price_data: {
        currency: "gbp",
        product_data: { name: service.name },
        unit_amount: service.price,
      },
      quantity: 1,
    },
  ],
  // Platform fee
  payment_intent_data: {
    application_fee_amount: platformFee,
    transfer_data: {
      destination: specialist.stripeAccountId,
    },
    metadata: {
      appointmentId: appointment._id.toString(),
      tenantId: tenant._id.toString(),
      platformFee: platformFee,
    },
  },
  success_url: `${FRONTEND_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
  cancel_url: `${FRONTEND_URL}/cancel`,
});
```

**Money Flow Example:**

- Service Price: £50.00 (5000 pence)
- Platform Fee: £0.50 (50 pence)
- Specialist Receives: £49.50 (4950 pence)

### 4.2 Product Checkout

```javascript
// Backend: routes/orders.js
const platformFee = tenant?.paymentSettings?.platformFeePerProduct || 50;

const session = await stripe.checkout.sessions.create({
  mode: "payment",
  line_items: products.map((item) => ({
    price_data: {
      currency: "gbp",
      product_data: { name: item.name },
      unit_amount: item.price,
    },
    quantity: item.quantity,
  })),
  payment_intent_data: {
    application_fee_amount: platformFee * totalQuantity,
    transfer_data: {
      destination: beauticianStripeAccount,
    },
  },
});
```

## Step 5: Webhook Event Handling

### 5.1 Account Status Updates

```javascript
// Webhook: account.updated
case 'account.updated': {
  const account = event.data.object;
  const specialist = await Specialist.findOne({
    stripeAccountId: account.id,
  });

  if (specialist) {
    const isComplete = account.details_submitted && account.charges_enabled;
    specialist.stripeStatus = isComplete ? 'connected' : 'pending';
    specialist.stripePayoutsEnabled = account.payouts_enabled;
    await specialist.save();
  }
  break;
}
```

### 5.2 Payment Success

```javascript
// Webhook: payment_intent.succeeded
case 'payment_intent.succeeded': {
  const pi = event.data.object;

  // Track platform fee
  if (pi.application_fee_amount) {
    console.log(
      `Platform fee collected: £${pi.application_fee_amount / 100}`
    );
  }

  // Update appointment status
  await Appointment.findByIdAndUpdate(
    pi.metadata.appointmentId,
    {
      status: 'confirmed',
      'payment.status': 'succeeded',
      'payment.stripe.platformFee': pi.application_fee_amount,
    }
  );
  break;
}
```

### 5.3 Account Disconnection

```javascript
// Webhook: account.application.deauthorized
case 'account.application.deauthorized': {
  const specialist = await Specialist.findOne({
    stripeAccountId: event.account,
  });

  if (specialist) {
    specialist.stripeStatus = 'disconnected';
    specialist.stripeAccountId = null;
    await specialist.save();
  }
  break;
}
```

## Step 6: Testing

### 6.1 Test Cards

Use Stripe test cards in test mode:

```
Success: 4242 4242 4242 4242
Declined: 4000 0000 0000 0002
Requires Auth: 4000 0025 0000 3155

CVV: Any 3 digits
Expiry: Any future date
```

### 6.2 Test Onboarding

1. Create a specialist in admin panel
2. Click "Connect Stripe" button
3. Fill in test information:
   - Email: any email
   - Phone: any phone
   - DOB: Any past date (18+)
   - Account: Use test routing number `110000000` and account `000123456789`

### 6.3 Verify Platform Fees

1. Make a test booking
2. Check Stripe Dashboard → Payments
3. Verify:
   - Total charge shows full amount
   - Application fee shows £0.50
   - Transfer shows (amount - fee)

## Step 7: Production Checklist

### Before Going Live:

- [ ] Switch to live API keys (starts with `sk_live_`)
- [ ] Enable live mode webhooks
- [ ] Update Connect redirect URIs to production domain
- [ ] Complete Stripe account verification
- [ ] Set up business bank account for platform payouts
- [ ] Test complete flow with real bank account
- [ ] Review platform fee settings per tenant
- [ ] Configure payout schedule (daily, weekly, monthly)
- [ ] Set up Connect onboarding notifications
- [ ] Add refund handling for cancelled bookings

### Environment Variables (Production):

```bash
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_CONNECT_CLIENT_ID=ca_...
FRONTEND_URL=https://yourdomain.com
NODE_ENV=production
```

## Troubleshooting

### Issue: "No such destination"

**Cause**: Specialist's Stripe account not connected
**Solution**: Ensure specialist completes onboarding before accepting payments

### Issue: "Invalid application fee"

**Cause**: Platform fee exceeds payment amount
**Solution**: Set reasonable platform fees (£0.50 recommended)

### Issue: Webhook signature verification failed

**Cause**: Wrong webhook secret or request not from Stripe
**Solution**: Verify `STRIPE_WEBHOOK_SECRET` matches dashboard

### Issue: Account onboarding link expired

**Cause**: Account links expire after 5 minutes
**Solution**: Generate new link via `/api/specialists/:id/stripe/onboard`

## Monitoring

### Track Platform Revenue

```javascript
// Get total platform fees collected
const payments = await stripe.paymentIntents.list({
  limit: 100,
});

const totalFees = payments.data.reduce((sum, pi) => {
  return sum + (pi.application_fee_amount || 0);
}, 0);

console.log(`Total platform revenue: £${totalFees / 100}`);
```

### Monitor Connected Accounts

```javascript
// List all connected accounts
const accounts = await stripe.accounts.list({ limit: 100 });

const stats = {
  total: accounts.data.length,
  active: accounts.data.filter((a) => a.charges_enabled).length,
  pending: accounts.data.filter((a) => !a.charges_enabled).length,
};
```

## Support Resources

- **Stripe Connect Docs**: https://stripe.com/docs/connect
- **Stripe CLI**: https://stripe.com/docs/stripe-cli
- **Connect Onboarding**: https://stripe.com/docs/connect/onboarding
- **Platform Fees**: https://stripe.com/docs/connect/direct-charges#collecting-fees
- **Webhooks Guide**: https://stripe.com/docs/webhooks

## Next Steps

1. Test onboarding flow with multiple specialists
2. Verify webhooks are processing correctly
3. Monitor dashboard for payment activity
4. Set up automated reports for platform fees
5. Configure dispute handling process
