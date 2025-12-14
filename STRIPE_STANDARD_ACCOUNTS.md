# Stripe Connect - Standard Accounts

## Overview

This app uses **Stripe Connect Standard accounts** for all specialists. Standard accounts provide:

- ✅ **Zero monthly fees** ($0/month per specialist)
- ✅ **Stripe-hosted onboarding** (fully compliant, no custom forms needed)
- ✅ **Full KYC/compliance** handled by Stripe
- ✅ **Same payment flow** as Express accounts

## How It Works

### Account Creation

When a specialist connects their Stripe account:

```javascript
POST /api/connect/onboard
{
  "specialistId": "...",
  "email": "specialist@example.com"
}
```

The system creates a **Standard account** with:

- Type: `standard`
- Country: `GB`
- Capabilities: `transfers` and `card_payments`

### Payment Flow

Bookings use the same payment structure:

```javascript
// In checkout session
payment_intent_data: {
  application_fee_amount: 50, // £0.50 platform fee
  transfer_data: {
    destination: stripeAccountId // Specialist's Standard account
  }
}
```

**How money flows:**

1. Client pays £50 for a booking
2. Stripe takes transaction fee (~2.9% + £0.30 = £1.75)
3. Platform takes £0.50 application fee
4. Specialist receives £47.75
5. **No monthly fees deducted** 🎉

### Database Schema

```javascript
// Specialist model
{
  stripeAccountId: String,
  stripeAccountType: "standard", // Always standard
  stripeStatus: "not_connected" | "pending" | "connected",
  stripeOnboardingCompleted: Boolean,
  stripePayoutsEnabled: Boolean
}
```

## API Endpoints

### 1. Create Onboarding Link

```javascript
POST / api / connect / onboard;
// Creates Standard account and returns Stripe-hosted onboarding URL
```

### 2. Check Account Status

```javascript
GET /api/connect/status/:specialistId
// Returns connection status and account details
```

### 3. Dashboard Access

```javascript
POST /api/connect/dashboard-link/:specialistId
// Generates login link to Stripe Dashboard
```

### 4. Disconnect Account

```javascript
DELETE /api/connect/disconnect/:specialistId
// Removes Stripe connection (for testing)
```

## Cost Comparison

### Standard Accounts (Current Setup)

- Monthly fee: **£0**
- Per transaction: 2.9% + £0.30 (Stripe standard rate)
- **Total for 100 inactive specialists: £0/month**

### Express Accounts (Old Approach)

- Monthly fee: **£2 per account**
- Per transaction: 2.9% + £0.30 (same rate)
- **Total for 100 inactive specialists: £200/month = £2,400/year**

## Testing

### Test Mode

1. Use test API keys in `.env`
2. Create test specialist account
3. Complete onboarding with test data
4. Process test payment (use card `4242 4242 4242 4242`)

### Verify Standard Account

```javascript
// Check account type in Stripe Dashboard
// Should show: Account type = Standard
```

## Important Notes

⚠️ **One-time choice**: Once created, account type cannot be changed. Always Standard for this app.

✅ **No breaking changes**: Payment flow identical to Express accounts.

✅ **Zero migration needed**: Fresh start with Standard accounts.

✅ **Stripe Dashboard**: Specialists access full Stripe Dashboard (not embedded).

## Support

For Stripe Connect issues:

- Check Stripe Dashboard for account status
- Review Stripe logs for webhook events
- Test in Stripe test mode before going live
