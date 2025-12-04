# 💰 Refund Policy Documentation

## Overview

This document explains the automated refund policy system for appointment cancellations in the Beauty Salon booking system.

### Where This Policy Is Displayed

The cancellation policy is prominently displayed in two locations:

1. **Customer Checkout Page** (`/checkout`)

   - Shows clear, visual summary before payment buttons
   - Highlights all 4 refund windows with color-coded icons
   - Required for legal compliance and customer transparency

2. **Admin Dashboard** (`/admin/cancellation`)
   - Comprehensive policy reference for staff
   - Includes technical details and calculation examples
   - Payment mode explanations and best practices

---

## Refund Policy Structure

The refund policy is configurable and based on **time windows** relative to the appointment start time.

### Default Policy Parameters

```javascript
{
  freeCancelHours: 24,      // Full refund if cancelled 24+ hours before
  noRefundHours: 2,         // No refund if cancelled within 2 hours
  partialRefund: {
    percent: 50             // 50% refund in the partial window
  },
  appliesTo: "deposit_only", // "deposit_only" or "full"
  graceMinutes: 15,         // Full refund within 15 min of booking
  currency: "gbp"
}
```

---

## Refund Windows

### 1. **Grace Window** (Full Refund - 100%)

- **Condition**: Cancelled within 15 minutes of booking
- **Refund**: 100% of applicable amount
- **Reason Code**: `grace_window`
- **Logic**: Allows customers to immediately cancel if they made a mistake

**Example**:

- Booked at: 10:00 AM
- Cancelled at: 10:10 AM (10 minutes later)
- **Result**: Full refund

---

### 2. **Free Cancellation Window** (Full Refund - 100%)

- **Condition**: Cancelled 24+ hours before appointment
- **Refund**: 100% of applicable amount
- **Reason Code**: `free_window`
- **Logic**: No-penalty cancellation for advance notice

**Example**:

- Appointment: Saturday 2:00 PM
- Cancelled: Thursday 1:00 PM (25 hours before)
- **Result**: Full refund

---

### 3. **Partial Refund Window** (50% Default)

- **Condition**: Between 2-24 hours before appointment
- **Refund**: 50% of applicable amount (configurable)
- **Reason Code**: `partial_window`
- **Logic**: Some penalty for late cancellation, but not total loss

**Example**:

- Appointment: Saturday 2:00 PM
- Cancelled: Saturday 9:00 AM (5 hours before)
- **Result**: 50% refund

---

### 4. **No Refund Window** (0%)

- **Condition**: Cancelled within 2 hours of appointment
- **Refund**: 0%
- **Reason Code**: `inside_no_refund`
- **Logic**: Too late to rebook, full penalty applies

**Example**:

- Appointment: Saturday 2:00 PM
- Cancelled: Saturday 1:30 PM (30 minutes before)
- **Result**: No refund

---

### 5. **No Payment/Base Zero** (0%)

- **Condition**: No payment was made (pay_in_salon mode)
- **Refund**: 0% (nothing to refund)
- **Reason Code**: `base_zero`
- **Logic**: Customer hasn't paid anything yet

---

## Payment Modes and Refund Base

The "refund base" (what gets refunded) depends on payment mode and policy settings:

### Payment Modes

| Mode             | Description             | Default Refund Base            |
| ---------------- | ----------------------- | ------------------------------ |
| **pay_now**      | Full payment upfront    | Full amount (amountTotal)      |
| **deposit**      | Partial payment upfront | Deposit amount (amountDeposit) |
| **pay_in_salon** | No online payment       | £0 (nothing to refund)         |

### AppliesTo Setting

The `appliesTo` policy setting determines what gets refunded for **deposit** mode:

- **`deposit_only`** (default): Only refund the deposit amount
- **`full`**: Refund the full service price even if only deposit paid

**Example**:

- Service cost: £100
- Deposit paid: £20
- Payment mode: `deposit`

With `appliesTo: "deposit_only"`:

- Cancel 25 hours before → Refund £20 (100% of deposit)
- Cancel 5 hours before → Refund £10 (50% of deposit)

With `appliesTo: "full"`:

- Cancel 25 hours before → Refund £100 (100% of full price)
- Cancel 5 hours before → Refund £50 (50% of full price)

---

## Refund Calculation Examples

### Example 1: Pay Now, Early Cancel

```
Payment Mode: pay_now
Amount Paid: £100
Appointment: Mon 10:00 AM
Cancel Time: Sat 3:00 PM (43 hours before)

Calculation:
- Hours to start: 43
- Window: Free cancellation (≥24 hours)
- Refund: £100 (100%)
- Status: cancelled_full_refund
```

### Example 2: Deposit, Partial Window

```
Payment Mode: deposit
Deposit Paid: £25
Full Price: £120
AppliesTo: deposit_only
Appointment: Fri 2:00 PM
Cancel Time: Fri 9:00 AM (5 hours before)

Calculation:
- Hours to start: 5
- Window: Partial (2-24 hours)
- Base amount: £25 (deposit only)
- Partial rate: 50%
- Refund: £12.50 (50% of £25)
- Status: cancelled_partial_refund
```

### Example 3: Deposit, Last Minute

```
Payment Mode: deposit
Deposit Paid: £30
Appointment: Sun 11:00 AM
Cancel Time: Sun 10:30 AM (30 minutes before)

Calculation:
- Hours to start: 0.5
- Window: No refund (≤2 hours)
- Refund: £0
- Status: cancelled_no_refund
```

### Example 4: Grace Period

```
Payment Mode: pay_now
Amount Paid: £80
Booked: 2:00:00 PM
Cancelled: 2:08:00 PM (8 minutes later)

Calculation:
- Minutes since booked: 8
- Window: Grace period (≤15 minutes)
- Refund: £80 (100%)
- Status: cancelled_full_refund
- Reason: Immediate cancellation after booking
```

---

## Implementation Details

### Code Location

**Backend**:

- **Logic**: `src/controllers/appointments/computeCancellationOutcome.js`
- **API Route**: `src/routes/appointments.js` (PATCH `/api/appointments/:id/cancel`)
- **Stripe Integration**: `src/payments/stripe.js` (`refundPayment` function)

### computeCancellationOutcome Function

```javascript
computeCancellationOutcome({
  appointment: {
    start: Date,
    createdAt: Date,
    payment: {
      mode: 'pay_now' | 'deposit' | 'pay_in_salon',
      amountTotal: number,  // in pence
      amountDeposit: number // in pence
    }
  },
  policy: {
    freeCancelHours: 24,
    noRefundHours: 2,
    partialRefund: { percent: 50 },
    appliesTo: 'deposit_only',
    graceMinutes: 15
  },
  now: Date,
  salonTz: 'Europe/London'
})

// Returns:
{
  refundAmount: number,     // in pence
  outcomeStatus: string,    // cancelled_full_refund | cancelled_partial_refund | cancelled_no_refund
  reasonCode: string        // grace_window | free_window | partial_window | inside_no_refund | base_zero
}
```

---

## API Response Format

### Cancel Appointment Response

```json
{
  "success": true,
  "appointment": {
    "_id": "...",
    "status": "cancelled_full_refund",
    "payment": {
      "status": "refunded",
      "refund": {
        "amount": 5000,
        "currency": "gbp",
        "stripeRefundId": "re_..."
      }
    }
  },
  "meta": {
    "outcome": {
      "refundAmount": 5000,
      "outcomeStatus": "cancelled_full_refund",
      "reasonCode": "free_window"
    },
    "stripeRefundId": "re_..."
  }
}
```

---

## Stripe Integration

### Refund Process

1. **Outcome Calculated**: System determines refund amount
2. **Stripe Refund Created**: If amount > 0 and payment via Stripe
3. **Idempotency**: Uses appointment ID as idempotency key (prevents double refunds)
4. **Status Update**: Appointment status updated to include refund info
5. **Payment Status**: Updated to `refunded` or `partial_refunded`

### Refund Function

```javascript
await refundPayment({
  stripeReference: "pi_...", // Payment Intent ID
  amount: 5000, // Amount in pence
  reason: "requested_by_customer",
  metadata: { appointmentId: "..." },
  idempotencyKey: "cancel-appt-...",
});
```

---

## Configuration

### Where to Configure Policy

The cancellation policy is currently hardcoded in the API route:

**File**: `src/routes/appointments.js`

```javascript
const policy = {
  freeCancelHours: 24,
  noRefundHours: 2,
  partialRefund: { percent: 50 },
  appliesTo: "deposit_only",
  graceMinutes: 15,
  currency: "gbp",
};
```

### Future Enhancement: Database Policy

For production, consider storing the policy in:

- **Settings collection** (system-wide)
- **Service-specific policies** (different rules per service)
- **Admin dashboard** (editable via UI)

---

## Frontend Display

### Admin Appointments Page

The admin can preview the refund before confirming cancellation:

```javascript
// Preview API call
const preview = await api.patch(`/appointments/${id}/cancel`, {
  preview: true,
});

// Shows:
// - Current Status: confirmed
// - New Status: cancelled_full_refund
// - Refund: £50.00
```

**Location**: `src/admin/pages/Appointments.jsx`

---

## Status Codes Reference

### Appointment Status After Cancellation

| Status                     | Meaning                       | Refund |
| -------------------------- | ----------------------------- | ------ |
| `cancelled_full_refund`    | Cancelled with 100% refund    | 100%   |
| `cancelled_partial_refund` | Cancelled with partial refund | 1-99%  |
| `cancelled_no_refund`      | Cancelled with no refund      | 0%     |

### Payment Status After Refund

| Status             | Meaning                     |
| ------------------ | --------------------------- |
| `refunded`         | Full refund processed       |
| `partial_refunded` | Partial refund processed    |
| `paid`             | No refund (original status) |

---

## Edge Cases

### 1. Already Cancelled

- Cannot cancel twice
- API returns error

### 2. Past Appointments

- Can still cancel (for record-keeping)
- Applies no-refund window logic if within 2 hours of start
- Consider no refund for appointments already past

### 3. No Payment Made

- `pay_in_salon` mode
- Returns `base_zero` reason
- Status: `cancelled_no_refund`

### 4. Partial vs Fixed Refund

```javascript
// Percentage-based (default)
partialRefund: {
  percent: 50;
} // 50% of base

// Fixed amount
partialRefund: {
  fixed: 1000;
} // £10 fixed refund (in pence)
```

### 5. Multiple Cancellations

- Idempotency key prevents double refunds
- Each cancellation attempt uses same key
- Stripe won't process duplicate

---

## Testing Refund Logic

### Unit Test Scenarios

```javascript
// Test 1: Grace window
computeCancellationOutcome({
  appointment: {
    start: new Date("2025-11-01T14:00:00"),
    createdAt: new Date("2025-11-01T10:00:00"),
    payment: { mode: "pay_now", amountTotal: 5000 },
  },
  policy: { graceMinutes: 15 },
  now: new Date("2025-11-01T10:10:00"),
});
// Expected: { refundAmount: 5000, outcomeStatus: 'cancelled_full_refund', reasonCode: 'grace_window' }

// Test 2: Free cancellation
computeCancellationOutcome({
  appointment: {
    start: new Date("2025-11-02T14:00:00"),
    createdAt: new Date("2025-11-01T10:00:00"),
    payment: { mode: "pay_now", amountTotal: 5000 },
  },
  policy: { freeCancelHours: 24 },
  now: new Date("2025-11-01T10:00:00"),
});
// Expected: { refundAmount: 5000, outcomeStatus: 'cancelled_full_refund', reasonCode: 'free_window' }

// Test 3: Partial refund
computeCancellationOutcome({
  appointment: {
    start: new Date("2025-11-01T14:00:00"),
    createdAt: new Date("2025-11-01T06:00:00"),
    payment: { mode: "deposit", amountDeposit: 2000 },
  },
  policy: {
    freeCancelHours: 24,
    noRefundHours: 2,
    partialRefund: { percent: 50 },
  },
  now: new Date("2025-11-01T09:00:00"), // 5 hours before
});
// Expected: { refundAmount: 1000, outcomeStatus: 'cancelled_partial_refund', reasonCode: 'partial_window' }

// Test 4: No refund
computeCancellationOutcome({
  appointment: {
    start: new Date("2025-11-01T14:00:00"),
    createdAt: new Date("2025-11-01T10:00:00"),
    payment: { mode: "pay_now", amountTotal: 5000 },
  },
  policy: { noRefundHours: 2 },
  now: new Date("2025-11-01T13:30:00"), // 30 min before
});
// Expected: { refundAmount: 0, outcomeStatus: 'cancelled_no_refund', reasonCode: 'inside_no_refund' }
```

---

## Customer Communication

### Email Templates (Recommended)

**Full Refund**:

```
Subject: Appointment Cancelled - Full Refund Processed

Your appointment on [date] at [time] has been cancelled.

A full refund of £[amount] will be processed to your original payment method within 5-10 business days.

Cancellation Details:
- Cancelled: [hours] hours before appointment
- Refund: 100% (£[amount])
- Refund ID: [stripe_refund_id]
```

**Partial Refund**:

```
Subject: Appointment Cancelled - Partial Refund Processed

Your appointment on [date] at [time] has been cancelled.

As per our cancellation policy, a partial refund of £[amount] ([percent]%) will be processed to your original payment method within 5-10 business days.

Cancellation Details:
- Cancelled: [hours] hours before appointment
- Refund: [percent]% (£[amount])
- Refund ID: [stripe_refund_id]
```

**No Refund**:

```
Subject: Appointment Cancelled - No Refund

Your appointment on [date] at [time] has been cancelled.

Due to the late cancellation (within 2 hours of appointment), no refund will be processed as per our cancellation policy.

We appreciate your understanding.
```

---

## Best Practices

### 1. Clear Communication

- Display refund policy during booking
- Show preview before confirming cancellation
- Send confirmation email with refund details

### 2. Flexibility

- Consider exceptions for emergencies
- Manual override capability for admin
- Grace period for booking mistakes

### 3. Fairness

- Reasonable time windows
- Partial refunds as middle ground
- Special handling for loyal customers

### 4. Technical

- Always use idempotency keys
- Log all refund attempts
- Monitor refund success rate
- Handle Stripe errors gracefully

---

## Future Enhancements

### 1. Tiered Refund Policy

```javascript
{
  tiers: [
    { hoursBeforeMin: 48, refundPercent: 100 },
    { hoursBeforeMin: 24, refundPercent: 75 },
    { hoursBeforeMin: 12, refundPercent: 50 },
    { hoursBeforeMin: 2, refundPercent: 25 },
    { hoursBeforeMin: 0, refundPercent: 0 },
  ];
}
```

### 2. Service-Specific Policies

- Higher-priced services: stricter policy
- Popular services: more flexible
- New customers: grace period

### 3. Loyalty Program

- Frequent customers: more lenient
- First-time customers: full refund on first cancel
- VIP members: always full refund

### 4. Rescheduling vs Cancelling

- No penalty for rescheduling
- Encourage reschedule over cancel
- Transfer payment to new appointment

---

## Summary

| Window      | Time Before Appointment | Refund Amount | Status Code                |
| ----------- | ----------------------- | ------------- | -------------------------- |
| Grace       | ≤15 min after booking   | 100%          | `cancelled_full_refund`    |
| Free Cancel | ≥24 hours               | 100%          | `cancelled_full_refund`    |
| Partial     | 2-24 hours              | 50% (default) | `cancelled_partial_refund` |
| No Refund   | <2 hours                | 0%            | `cancelled_no_refund`      |
| No Payment  | N/A                     | 0%            | `cancelled_no_refund`      |

**Key Principle**: Balance between customer satisfaction and business protection.

---

## Questions & Support

For questions about refund policy implementation:

- Review: `computeCancellationOutcome.js`
- Test: Run cancellation scenarios in API
- Adjust: Modify policy parameters in `appointments.js`
- Monitor: Check Stripe dashboard for refund processing

**Remember**: All refunds are processed automatically via Stripe. Manual intervention only needed for exceptions or errors.
