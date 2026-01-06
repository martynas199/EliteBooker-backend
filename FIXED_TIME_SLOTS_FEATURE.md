# Fixed Time Slots Feature

## Overview

This feature allows tenants to set specific, fixed appointment times for their services instead of using the automatic time slot generation. For example, if a service should only be available at 9:15, 11:30, and 4:00 PM, you can configure those exact times.

## How It Works

- When a service has `fixedTimeSlots` defined, the system uses those exact times instead of computing slots
- The system still respects:
  - Existing appointments (won't show a slot if already booked)
  - Specialist time-off (won't show a slot during time-off)
  - Service duration and buffers (slot extends based on duration)
- The existing slot engine is **not modified** - this is an alternative path

## Database Schema

### Service Model

A new optional field `fixedTimeSlots` has been added to the Service model:

```javascript
{
  fixedTimeSlots: {
    type: [String],
    default: undefined, // undefined = use computed slots
    validate: {
      validator: function (times) {
        if (!times) return true;
        return times.every((time) => /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time));
      },
      message: 'Fixed time slots must be in HH:MM or H:MM format',
    },
  }
}
```

**Values:**

- `undefined` (default): Use normal computed slots from the slot engine
- `[]` (empty array): No slots available (service cannot be booked)
- `['09:15', '11:30', '16:00']`: Only these exact times are available

## Usage Examples

### Example 1: Set Fixed Times for a Service

Using MongoDB shell or a database tool:

```javascript
db.services.updateOne(
  { _id: ObjectId("YOUR_SERVICE_ID") },
  {
    $set: {
      fixedTimeSlots: ["09:15", "11:30", "14:00", "16:00"],
    },
  }
);
```

### Example 2: Using the API

If you have an admin API endpoint to update services:

```javascript
// PUT /api/admin/services/:serviceId
{
  "fixedTimeSlots": ["09:15", "11:30", "14:00", "16:00"]
}
```

### Example 3: Remove Fixed Times (Go Back to Computed Slots)

```javascript
db.services.updateOne(
  { _id: ObjectId("YOUR_SERVICE_ID") },
  {
    $unset: { fixedTimeSlots: "" },
  }
);
```

### Example 4: Temporarily Disable Bookings

```javascript
db.services.updateOne(
  { _id: ObjectId("YOUR_SERVICE_ID") },
  {
    $set: { fixedTimeSlots: [] },
  }
);
```

## Time Format

**Accepted formats:**

- `"9:15"` - Single digit hour
- `"09:15"` - Two digit hour (recommended)
- `"14:30"` - 24-hour format
- `"23:45"` - Late evening

**Invalid formats:**

- `"9:15 AM"` - No AM/PM (use 24-hour)
- `"24:00"` - Hours must be 0-23
- `"14:60"` - Minutes must be 0-59

## Implementation Details

### Files Modified

1. **`src/models/Service.js`**

   - Added `fixedTimeSlots` field with validation

2. **`src/utils/slotEngine.js`**

   - Added `generateFixedSlots()` function
   - Converts fixed time strings to ISO timestamps
   - Checks for conflicts with appointments and time-off

3. **`src/routes/slots.js`**
   - Updated slot generation to check for `fixedTimeSlots`
   - Three places where slots are computed now check this field
   - Falls back to `computeSlotsForBeautician` if not set

### Logic Flow

```
Service has fixedTimeSlots?
├─ Yes → Use generateFixedSlots()
│         ├─ Convert times to ISO timestamps
│         ├─ Check for appointment conflicts
│         ├─ Check for time-off conflicts
│         └─ Return available fixed slots
│
└─ No → Use computeSlotsForBeautician()
         └─ Use existing slot engine (unchanged)
```

## Testing

### Test Case 1: Basic Fixed Slots

```javascript
// Setup
const service = {
  _id: "...",
  name: "Yoga Class",
  fixedTimeSlots: ["09:00", "12:00", "17:00"],
  variants: [
    {
      durationMin: 60,
      bufferBeforeMin: 0,
      bufferAfterMin: 15,
    },
  ],
};

// Expected: Only 9:00 AM, 12:00 PM, and 5:00 PM slots shown
// Each slot is 75 minutes long (60 + 15 buffer)
```

### Test Case 2: Fixed Slots with Conflicts

```javascript
// Setup: Same service, but 12:00 PM slot is already booked

// Expected: Only 9:00 AM and 5:00 PM slots shown
// 12:00 PM slot is hidden (conflict)
```

### Test Case 3: Fixed Slots During Time-Off

```javascript
// Setup: Specialist has time-off from 11:00 AM to 2:00 PM

// Expected: Only 9:00 AM and 5:00 PM slots shown
// 12:00 PM slot is hidden (time-off conflict)
```

### Manual Test

1. Update a service with fixed time slots:

```bash
mongosh
use your_database_name
db.services.updateOne(
  { name: "Test Service" },
  { $set: { fixedTimeSlots: ["10:00", "14:00", "18:00"] } }
)
```

2. Query the slots API:

```bash
GET /api/slots?serviceId=YOUR_SERVICE_ID&specialistId=YOUR_SPECIALIST_ID&date=2026-01-10&variantName=Standard
```

3. Verify response shows only 10:00 AM, 2:00 PM, and 6:00 PM slots

## API Endpoints Affected

- `GET /api/slots/fully-booked` - Checks fixed slots when determining fully booked days
- `GET /api/slots` - Returns fixed slots instead of computed slots when configured

## Backward Compatibility

✅ **Fully backward compatible**

- Existing services without `fixedTimeSlots` work exactly as before
- Services with `fixedTimeSlots: undefined` use the normal slot engine
- No changes to existing appointment logic
- No database migration required

## Performance Considerations

- Fixed slots are **faster** than computed slots (no complex time calculations)
- Fewer iterations needed (only checking defined times vs. all possible times)
- Same conflict checking logic (appointments, time-off)

## Future Enhancements

Possible future improvements:

1. **Per-variant fixed slots**: Different fixed times for different service variants
2. **Day-specific fixed slots**: Different times for different days of the week
3. **Admin UI**: Frontend interface to set fixed times
4. **Recurring patterns**: e.g., "Every Monday at 9:00, 11:00, 14:00"

## Support

For questions or issues, contact the development team or create a ticket.
