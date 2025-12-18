# Slots API Performance Optimization Plan

## Problem

The `/api/slots/fully-booked` endpoint is slow because it:

- Loops through 28-31 days per month
- Computes slots for EACH day (expensive algorithm)
- Fetches appointments for each day separately
- Results in 30+ database queries and 30+ slot computations per request

## Solution: Optimize /fully-booked endpoint

### Current Approach (Slow)

```javascript
for (let day = 1; day <= daysInMonth; day++) {
  // Fetch appointments for THIS day
  const appts = await Appointment.find({ ... });
  // Compute slots for THIS day
  const slots = computeSlotsForBeautician({ ... });
  if (slots.length === 0) fullyBookedSet.add(dateStr);
}
```

### Optimized Approach (Fast)

```javascript
// 1. Fetch ALL appointments for the ENTIRE month at once
const monthAppts = await Appointment.find({
  specialistId,
  start: { $gte: monthStart, $lt: monthEnd },
  status: { $ne: "cancelled" }
}).lean();

// 2. Group appointments by date
const apptsByDate = {};
monthAppts.forEach(appt => {
  const dateStr = dayjs(appt.start).format('YYYY-MM-DD');
  if (!apptsByDate[dateStr]) apptsByDate[dateStr] = [];
  apptsByDate[dateStr].push(appt);
});

// 3. Compute slots for each day using cached appointments
for (let day = 1; day <= daysInMonth; day++) {
  const dateStr = `${year}-${month}-${day}`;
  const dayAppts = apptsByDate[dateStr] || [];

  // Now compute slots with pre-fetched appointments
  const slots = computeSlotsForBeautician({
    date: dateStr,
    appointments: dayAppts, // Already fetched!
    ...
  });
}
```

### Performance Improvement

- **Before**: 30 database queries (1 per day)
- **After**: 1 database query (entire month)
- **Expected speedup**: 10-20x faster

## Additional Optimizations

### 1. Database Index (✅ Already Added)

```javascript
AppointmentSchema.index({ specialistId: 1, start: 1, status: 1 });
```

### 2. Increase Cache TTL

Current: 60 seconds (CACHE_TTL = 60000)
Recommended: 300 seconds (5 minutes) for better caching

### 3. Add Performance Monitoring (✅ Added)

- Service fetch time
- Specialist fetch time
- Appointments fetch time
- Slot computation time
- Total request time

### 4. Consider Response Streaming

For very large calendars, stream the response as dates are computed

## Implementation Priority

1. **HIGH**: Optimize /fully-booked to fetch all month appointments at once
2. **MEDIUM**: Increase cache TTL to 5 minutes
3. **LOW**: Add streaming for large date ranges

## Expected Results

- `/fully-booked` should go from 2000-5000ms → 200-500ms
- Page load should feel instant
- Calendar navigation should be smooth
