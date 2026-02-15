import assert from "node:assert/strict";
import { computeCancellationOutcome } from "../../src/controllers/appointments/computeCancellationOutcome.js";

const tz = "Europe/London";
function makeAppt({ startISO, createdAtISO, mode, total, deposit }){
  return {
    start: startISO,
    createdAt: createdAtISO,
    payment: { mode, amountTotal: total, amountDeposit: deposit },
  };
}

function makeStripeAppt({ startISO, createdAtISO, mode, total, deposit, platformFee }) {
  return {
    start: startISO,
    createdAt: createdAtISO,
    payment: {
      mode,
      provider: "stripe",
      amountTotal: total,
      amountDeposit: deposit,
      stripe: {
        platformFee,
      },
    },
  };
}

const basePolicy = { freeCancelHours:24, noRefundHours:2, partialRefund:{ percent:50 }, appliesTo:"auto", graceMinutes:15, currency:"GBP" };

// Free window full refund
{
  const now = new Date("2025-03-01T09:00:00Z");
  const appt = makeAppt({ startISO:"2025-03-03T10:00:00Z", createdAtISO:"2025-02-28T10:00:00Z", mode:"pay_now", total:10000 });
  const out = computeCancellationOutcome({ appointment: appt, policy: basePolicy, now, salonTz: tz });
  assert.equal(out.refundAmount, 10000);
  assert.equal(out.outcomeStatus, "cancelled_full_refund");
}

// Partial window percent
{
  const now = new Date("2025-03-02T09:30:00Z");
  const appt = makeAppt({ startISO:"2025-03-02T12:30:00Z", createdAtISO:"2025-03-01T08:00:00Z", mode:"pay_now", total:10000 });
  const policy = { ...basePolicy, freeCancelHours: 48, noRefundHours: 2, partialRefund:{ percent:25 } };
  const out = computeCancellationOutcome({ appointment: appt, policy, now, salonTz: tz });
  assert.equal(out.refundAmount, 2500);
  assert.equal(out.outcomeStatus, "cancelled_partial_refund");
}

// Partial window fixed
{
  const now = new Date("2025-03-02T09:30:00Z");
  const appt = makeAppt({ startISO:"2025-03-02T12:30:00Z", createdAtISO:"2025-03-01T08:00:00Z", mode:"pay_now", total:10000 });
  const policy = { ...basePolicy, partialRefund:{ fixed: 3000 } };
  const out = computeCancellationOutcome({ appointment: appt, policy, now, salonTz: tz });
  assert.equal(out.refundAmount, 3000);
}

// Inside no-refund
{
  const now = new Date("2025-03-02T11:00:00Z");
  const appt = makeAppt({ startISO:"2025-03-02T12:00:00Z", createdAtISO:"2025-03-01T08:00:00Z", mode:"pay_now", total:10000 });
  const out = computeCancellationOutcome({ appointment: appt, policy: basePolicy, now, salonTz: tz });
  assert.equal(out.refundAmount, 0);
  assert.equal(out.outcomeStatus, "cancelled_no_refund");
}

// Grace minutes
{
  const now = new Date("2025-03-01T08:10:00Z");
  const appt = makeAppt({ startISO:"2025-03-02T12:00:00Z", createdAtISO:"2025-03-01T08:00:00Z", mode:"pay_now", total:5000 });
  const out = computeCancellationOutcome({ appointment: appt, policy: basePolicy, now, salonTz: tz });
  assert.equal(out.refundAmount, 5000);
}

// Deposit-only refund
{
  const now = new Date("2025-03-02T09:00:00Z");
  const appt = makeAppt({ startISO:"2025-03-03T09:00:00Z", createdAtISO:"2025-03-01T08:00:00Z", mode:"deposit", total:10000, deposit:2000 });
  const out = computeCancellationOutcome({ appointment: appt, policy: basePolicy, now, salonTz: tz });
  assert.equal(out.refundAmount, 2000);
}

// Platform fee is non-refundable (full refund window)
{
  const now = new Date("2025-03-01T09:00:00Z");
  const appt = makeStripeAppt({
    startISO: "2025-03-03T10:00:00Z",
    createdAtISO: "2025-02-28T10:00:00Z",
    mode: "pay_now",
    total: 199,
    platformFee: 99,
  });
  const out = computeCancellationOutcome({ appointment: appt, policy: basePolicy, now, salonTz: tz });
  assert.equal(out.refundAmount, 100);
  assert.equal(out.outcomeStatus, "cancelled_full_refund");
}

// Platform fee is excluded before partial-percent refund calculation
{
  const now = new Date("2025-03-02T09:30:00Z");
  const appt = makeStripeAppt({
    startISO: "2025-03-02T12:30:00Z",
    createdAtISO: "2025-03-01T08:00:00Z",
    mode: "pay_now",
    total: 10000,
    platformFee: 99,
  });
  const policy = { ...basePolicy, freeCancelHours: 48, noRefundHours: 2, partialRefund: { percent: 25 } };
  const out = computeCancellationOutcome({ appointment: appt, policy, now, salonTz: tz });
  assert.equal(out.refundAmount, Math.round((10000 - 99) * 0.25));
  assert.equal(out.outcomeStatus, "cancelled_partial_refund");
}

// Legacy records without stored platformFee still cap refund to service price
{
  const now = new Date("2025-03-01T09:00:00Z");
  const appt = makeAppt({
    startISO: "2025-03-03T10:00:00Z",
    createdAtISO: "2025-02-28T10:00:00Z",
    mode: "pay_now",
    total: 221,
  });
  appt.payment.provider = "stripe";
  appt.price = 1.22;

  const out = computeCancellationOutcome({ appointment: appt, policy: basePolicy, now, salonTz: tz });
  assert.equal(out.refundAmount, 122);
  assert.equal(out.outcomeStatus, "cancelled_full_refund");
}

console.log("cancellation tests passed");

