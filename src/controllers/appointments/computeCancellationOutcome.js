import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * @typedef {Object} Outcome
 * @property {number} refundAmount // in minor units (pence)
 * @property {"cancelled_full_refund"|"cancelled_partial_refund"|"cancelled_no_refund"} outcomeStatus
 * @property {string} reasonCode
 */

/**
 * Compute cancellation outcome without side effects.
 * @param {Object} params
 * @param {any} params.appointment // expects { start, createdAt, payment: { mode, amountTotal, amountDeposit }, ... }
 * @param {any} params.policy // expects { freeCancelHours, noRefundHours, partialRefund, appliesTo, graceMinutes, currency }
 * @param {Date} params.now
 * @param {string} [params.salonTz="Europe/London"]
 * @returns {Outcome}
 */
export function computeCancellationOutcome({
  appointment,
  policy,
  now,
  salonTz = "Europe/London",
}) {
  const start = dayjs(appointment.start);
  const createdAt = dayjs(
    appointment.createdAt || appointment.updatedAt || appointment.start
  );
  const nowTz = dayjs.tz(now, salonTz);
  const startTz = dayjs.tz(start, salonTz);

  const hoursToStart = startTz.diff(nowTz, "minute") / 60;
  const minutesSinceBooked = nowTz.diff(dayjs.tz(createdAt, salonTz), "minute");

  const mode =
    appointment?.payment?.mode || inferModeFromPayment(appointment?.payment);
  const amountTotal = toInt(appointment?.payment?.amountTotal);
  const amountDeposit = toInt(appointment?.payment?.amountDeposit);

  const appliesTo = policy?.appliesTo || "auto";

  // Determine base amount based on policy
  let base;
  if (appliesTo === "auto") {
    // Smart mode: refund what they paid
    base =
      mode === "pay_now" ? amountTotal : mode === "deposit" ? amountDeposit : 0;
  } else if (appliesTo === "full") {
    // Always refund full amount
    base = amountTotal;
  } else {
    // deposit_only: always refund deposit (or amountTotal for pay_now since that's the deposit)
    base = mode === "pay_now" || mode === "deposit" ? amountDeposit : 0;
  }

  // Default no refund when base is 0
  if (!base) {
    return {
      refundAmount: 0,
      outcomeStatus: "cancelled_no_refund",
      reasonCode: "base_zero",
    };
  }

  const freeH = Number(policy?.freeCancelHours ?? 24);
  const noH = Number(policy?.noRefundHours ?? 2);
  const graceMin = Number(policy?.graceMinutes ?? 15);

  if (minutesSinceBooked <= graceMin) {
    return {
      refundAmount: base,
      outcomeStatus: "cancelled_full_refund",
      reasonCode: "grace_window",
    };
  }
  if (hoursToStart >= freeH) {
    return {
      refundAmount: base,
      outcomeStatus: "cancelled_full_refund",
      reasonCode: "free_window",
    };
  }
  if (hoursToStart <= noH) {
    return {
      refundAmount: 0,
      outcomeStatus: "cancelled_no_refund",
      reasonCode: "inside_no_refund",
    };
  }

  // Partial window
  const partial = policy?.partialRefund || {};
  let amount = 0;
  if (partial.percent != null) {
    amount = Math.round(
      (base * Math.max(0, Math.min(100, partial.percent))) / 100
    );
  } else if (partial.fixed != null) {
    amount = Math.max(0, Math.min(base, toInt(partial.fixed)));
  } else {
    amount = 0;
  }
  const outcomeStatus =
    amount > 0 ? "cancelled_partial_refund" : "cancelled_no_refund";
  return { refundAmount: amount, outcomeStatus, reasonCode: "partial_window" };
}

function toInt(n) {
  const x = Number(n || 0);
  return Number.isFinite(x) ? Math.trunc(x) : 0;
}
function inferModeFromPayment(pay) {
  if (!pay) return "pay_in_salon";
  if (pay.amountDeposit && pay.amountDeposit > 0) return "deposit";
  if (pay.amountTotal && pay.amountTotal > 0) return "pay_now";
  return "pay_in_salon";
}

export default { computeCancellationOutcome };
