# DateTimePicker - Production Implementation Guide

Complete, production-ready date and time picker with availability checking for beauty salon booking system.

## 📦 Components Delivered

### Frontend Components

1. **`DateTimePicker.jsx`** - Main date/time picker with calendar and slots
2. **`useAvailableDates.js`** - Hook for fetching and caching fully-booked dates

### Backend Endpoints

1. **`GET /api/slots/fully-booked`** - Returns fully booked dates for a month
2. **`GET /api/slots`** - Enhanced existing endpoint with validation

### Tests

1. **`DateTimePicker.test.js`** - Frontend component logic tests
2. **`slotGenerator.test.js`** - Backend slot generation validation tests

## 🚀 Quick Start

### 1. Install Dependencies

```bash
# Frontend
cd beauty-salon-frontend
npm install react-day-picker dayjs

# Backend (already installed)
cd beauty-salon-backend
# dayjs, zod already present
```

### 2. Update Server Routes

Ensure `src/server.js` imports the slots route:

```javascript
import slotsRouter from "./routes/slots.js";
app.use("/api/slots", slotsRouter);
```

### 3. Use the Component

```jsx
import DateTimePicker from "../components/DateTimePicker";

function BookingPage() {
  const [selectedSlot, setSelectedSlot] = useState(null);

  const handleSlotSelect = (slot) => {
    console.log("Selected slot:", slot);
    // slot = { startISO, endISO, specialistId }
    setSelectedSlot(slot);
    // Proceed to confirmation/payment
  };

  return (
    <DateTimePicker
      specialistId="507f1f77bcf86cd799439011"
      serviceId="507f1f77bcf86cd799439012"
      variantName="Standard"
      salonTz="Europe/London"
      stepMin={15}
      beauticianWorkingHours={[
        { dayOfWeek: 1, start: "09:00", end: "17:00" },
        { dayOfWeek: 2, start: "09:00", end: "17:00" },
        // ... other days
      ]}
      onSelect={handleSlotSelect}
    />
  );
}
```

## 📡 API Reference

### GET /api/slots/fully-booked

Returns dates that are fully booked (no available slots) for a specialist in a specific month.

**Query Parameters:**

- `specialistId` (string, required) - MongoDB ObjectId of specialist
- `year` (number, required) - e.g., 2025
- `month` (number, required) - 1-12

**Response:**

```json
{
  "fullyBooked": ["2025-10-15", "2025-10-16", "2025-10-20"]
}
```

**Caching:**

- Responses cached for 60 seconds server-side
- Additional client-side caching with 60s TTL

**Example:**

```javascript
const response = await fetch(
  "/api/slots/fully-booked?specialistId=507f1f77bcf86cd799439011&year=2025&month=10"
);
const { fullyBooked } = await response.json();
```

### GET /api/slots

Returns available time slots for a specific date/specialist/service combination.

**Query Parameters:**

- `specialistId` (string, required) - MongoDB ObjectId
- `serviceId` (string, required) - MongoDB ObjectId
- `variantName` (string, optional) - Service variant name
- `date` (string, required) - Format: YYYY-MM-DD

**Response:**

```json
{
  "slots": [
    {
      "startISO": "2025-10-14T09:00:00.000Z",
      "endISO": "2025-10-14T10:10:00.000Z",
      "specialistId": "507f1f77bcf86cd799439011"
    }
  ]
}
```

**Example:**

```javascript
const response = await fetch(
  "/api/slots?specialistId=507f...&serviceId=507f...&variantName=Standard&date=2025-10-14"
);
const { slots } = await response.json();
```

## ✅ Validation Rules

All slots are validated against these business rules:

### Rule 1: Valid ISO Strings

- `startISO` and `endISO` must be valid ISO 8601 datetime strings
- Must parse correctly with `new Date()` or `dayjs()`

### Rule 2: Temporal Ordering

- `endISO` must be after `startISO`
- Slot duration = bufferBefore + serviceDuration + bufferAfter

### Rule 3: Correct Date

- Slot start must be on the requested date in salon timezone
- No date leakage (slots bleeding into next/previous day)

### Rule 4: Within Working Hours

- Slot must fit entirely within specialist's working hours for that weekday
- Use specialist.workingHours array: `[{ dayOfWeek: 1, start: "09:00", end: "17:00" }]`

### Rule 5: No Break Overlaps

- Slot must not overlap any break periods
- Breaks are defined per working day (future feature)

### Rule 6: No Time-Off Overlaps

- Slot must not overlap any specialist time-off windows
- Check `specialist.timeOff`: `[{ start: Date, end: Date, reason: string }]`

### Rule 7: No Appointment Overlaps

- Slot must not overlap any confirmed appointments
- Exclude cancelled appointments

### Rule 8: Step Alignment

- Slot start time must align to `stepMin` grid (e.g., 15-minute intervals)
- Example: with stepMin=15, valid starts are :00, :15, :30, :45

## 🧪 Running Tests

### Frontend Tests

```bash
cd beauty-salon-frontend
node tests/DateTimePicker.test.js
```

Tests cover:

- ✅ Disabled days logic (past dates, non-working days, fully booked)
- ✅ Slot validation (valid ISO, ordering, date matching)
- ✅ DST edge cases (spring forward, fall back)
- ✅ Time formatting for display

### Backend Tests

```bash
cd beauty-salon-backend
node tests/slotGenerator.test.js
```

Tests cover:

- ✅ Basic slot generation within working hours
- ✅ Non-working days return empty
- ✅ Step interval alignment
- ✅ Appointment overlap exclusion
- ✅ Break overlap exclusion
- ✅ Time-off overlap exclusion
- ✅ Buffer time inclusion
- ✅ DST transitions (spring forward, fall back)
- ✅ Edge cases (short hours, midnight crossing)

## 🎨 Styling & Customization

### Tailwind CSS Classes

The component uses standard Tailwind utilities. Key classes:

```css
/* Selected date */
.rdp-selected-custom {
  background-color: #2563eb;
  color: white;
  font-weight: 600;
}

/* Disabled dates */
.rdp-disabled-custom {
  color: #d1d5db;
  cursor: not-allowed;
  opacity: 0.5;
}

/* Today */
.rdp-today-custom {
  font-weight: 700;
  border: 2px solid #2563eb;
}
```

### Brand Color Customization

Update `tailwind.config.js`:

```javascript
module.exports = {
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eff6ff",
          600: "#2563eb", // Primary action color
          700: "#1d4ed8",
        },
      },
    },
  },
};
```

### Mobile Responsiveness

- On desktop: calendar and slots shown side-by-side
- On mobile (`lg:` breakpoint): calendar collapsed into button
- Tap button to open fullscreen calendar overlay
- Slots displayed in scrollable grid

## 🔧 Performance Optimizations

### 1. Caching Strategy

**Server-side (60s TTL):**

```javascript
const fullyBookedCache = new Map();
const CACHE_TTL = 60000; // 60 seconds
```

**Client-side (60s TTL + key-based):**

```javascript
const cacheKey = `${specialistId}:${year}-${month}`;
cache.set(cacheKey, { data, timestamp: Date.now() });
```

### 2. Debouncing

Month navigation debounced by 200ms to prevent rapid API calls:

```javascript
debounceTimerRef.current = setTimeout(() => {
  fetchFullyBooked();
}, 200);
```

### 3. Request Cancellation

Previous requests aborted when new month selected:

```javascript
if (abortControllerRef.current) {
  abortControllerRef.current.abort();
}
```

### 4. Lazy Slot Loading

Slots only fetched when date selected (not pre-fetched for entire month).

### Optional: Adjacent Day Pre-fetch

Add this to `DateTimePicker.jsx` for smoother UX:

```javascript
useEffect(() => {
  if (selectedDate) {
    // Pre-fetch adjacent days
    const tomorrow = dayjs(selectedDate).add(1, "day").format("YYYY-MM-DD");
    api.get("/slots", {
      params: { specialistId, serviceId, variantName, date: tomorrow },
    });
  }
}, [selectedDate]);
```

## 🌍 DST Handling

### Strategy

- All slots stored/transmitted in UTC (ISO 8601 format)
- Display times converted to salon timezone on client
- Backend validates slots in salon timezone context

### Spring Forward (Clocks Ahead)

```javascript
// March 30, 2025 - 1:00 AM doesn't exist
// Slot at 00:30 would end at 01:30 (invalid)
// Backend skips slots that fall in "lost hour"
```

### Fall Back (Clocks Behind)

```javascript
// October 26, 2025 - 1:00-2:00 AM occurs twice
// Using UTC avoids ambiguity
// Slots ordered by UTC timestamp
```

### Testing DST

Mock dayjs timezone for tests:

```javascript
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

// Test spring forward
const dstDate = dayjs.tz("2025-03-30", "Europe/London");
```

## ♿ Accessibility Features

### Keyboard Navigation

- ✅ Tab through calendar days
- ✅ Arrow keys to navigate calendar
- ✅ Enter/Space to select date
- ✅ Tab through time slots
- ✅ Enter/Space to select slot

### ARIA Attributes

```jsx
<button
  role="option"
  aria-selected={isSelected}
  aria-label={`Time slot ${formatSlotTime(slot.startISO)}`}
  aria-describedby={errors ? "slot-error" : undefined}
>
```

### Screen Reader Labels

```jsx
<div role="listbox" aria-label="Available time slots">
  {/* Slots */}
</div>

<div role="status" aria-label="Loading time slots">
  {/* Loading skeleton */}
</div>

<div role="alert">
  {/* Error messages */}
</div>
```

### Focus Management

- Selected date/slot receives focus ring
- Error states announced to screen readers
- Loading states have aria-live regions

## 🐛 Error Handling

### Network Errors

```jsx
{
  availableDatesError && (
    <div
      role="alert"
      className="bg-red-50 border border-red-200 rounded-lg p-4"
    >
      <p>Failed to load available dates: {availableDatesError}</p>
      <button onClick={handleRetryAvailableDates}>Retry</button>
    </div>
  );
}
```

### Validation Errors

```jsx
// Too many invalid slots
if (validatedSlots.length < fetchedSlots.length * 0.8) {
  setSlotsError("Temporary error fetching slots — please try another date");
}
```

### Graceful Degradation

- If fully-booked endpoint fails: all future dates shown as available
- If slots endpoint fails: retry button + error message
- Invalid slots filtered out, remaining slots shown

## 🔐 Security Considerations

### Rate Limiting

Add to `server.js`:

```javascript
import rateLimit from "express-rate-limit";

const slotsLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute per IP
  message: "Too many requests, please try again later",
});

app.use("/api/slots", slotsLimiter, slotsRouter);
```

### Input Validation

All inputs validated with zod schemas (already implemented in routes).

### Public Access

Slots endpoint is public (required for booking flow). Admin endpoints remain protected.

## 📊 Monitoring & Logging

### Key Metrics to Track

1. **Fully-Booked Response Time**

   - Target: < 500ms for cached, < 2s for uncached

2. **Slot Generation Time**

   - Target: < 300ms per date

3. **Invalid Slot Rate**

   - Alert if > 5% of generated slots fail validation

4. **Cache Hit Rate**
   - Target: > 80% for fully-booked endpoint

### Logging

```javascript
console.error("Invalid slot generated:", slot, validation.reasons);
console.warn(
  `High rate of invalid slots (${invalidSlots.length}/${slots.length})`
);
console.error("Error computing slots for ${dateStr}:", err.message);
```

## 🚀 Deployment Checklist

- [ ] Install `react-day-picker` dependency
- [ ] Update server.js to include slots routes
- [ ] Test DST dates (March 30, October 26)
- [ ] Configure rate limiting
- [ ] Set up error logging/monitoring
- [ ] Test on mobile devices
- [ ] Test with screen readers
- [ ] Load test fully-booked endpoint
- [ ] Verify cache TTL appropriate for your use case
- [ ] Test with real specialist schedules
- [ ] Verify timezone handling (Europe/London)

## 🔄 Integration with Existing Booking Flow

### Step 1: Service Selection

User selects service and variant (existing flow).

### Step 2: Specialist Selection

User selects specialist (existing flow).

### Step 3: Date/Time Selection (NEW)

```jsx
<DateTimePicker
  specialistId={selectedSpecialist._id}
  serviceId={selectedService._id}
  variantName={selectedVariant.name}
  salonTz="Europe/London"
  stepMin={15}
  beauticianWorkingHours={selectedSpecialist.workingHours}
  onSelect={(slot) => {
    // Store selected slot
    setBookingDetails({
      ...bookingDetails,
      startTime: slot.startISO,
      endTime: slot.endISO,
      specialistId: slot.specialistId,
    });
    // Navigate to confirmation page
    navigate("/booking/confirm");
  }}
/>
```

### Step 4: Confirmation & Payment

Show selected date/time, collect customer details, proceed to Stripe checkout.

## 📝 Environment Variables

```env
# Salon timezone
SALON_TZ=Europe/London

# Slot step interval (minutes)
SLOTS_STEP_MIN=15
```

## 🤝 Support & Troubleshooting

### Common Issues

**Issue**: Calendar shows no available dates

- Check specialist has working hours configured
- Check specialist has services assigned
- Check dates are not in the past
- Check `workingHours` array format: `[{ dayOfWeek: 1, start: "09:00", end: "17:00" }]`

**Issue**: Slots not loading

- Check browser console for API errors
- Verify service has variants array
- Check appointments are not blocking all slots
- Verify date format is YYYY-MM-DD

**Issue**: Times display incorrectly

- Verify SALON_TZ environment variable
- Check dayjs timezone plugin is loaded
- Verify slots are in ISO 8601 format

**Issue**: DST dates show incorrect times

- Ensure using dayjs.tz() for timezone conversions
- Verify slots stored in UTC, displayed in local time
- Check test cases for DST dates

---

## 📚 Additional Resources

- [react-day-picker Documentation](https://react-day-picker.js.org/)
- [dayjs Timezone Plugin](https://day.js.org/docs/en/plugin/timezone)
- [ISO 8601 Format](https://en.wikipedia.org/wiki/ISO_8601)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)

**Production Ready**: This implementation has been designed for real-world use with proper validation, error handling, accessibility, performance optimization, and comprehensive testing.
