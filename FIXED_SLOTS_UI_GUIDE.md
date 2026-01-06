# Admin UI Integration for Fixed Time Slots

## Overview
This document provides guidance on adding a UI for tenants to configure fixed time slots for their services.

## Frontend Component Example (React)

### 1. Service Form Component

Add to your existing service form component:

```jsx
import { useState } from 'react';

function ServiceForm({ service, onSubmit }) {
  const [useFixedSlots, setUseFixedSlots] = useState(
    service?.fixedTimeSlots !== undefined
  );
  const [fixedTimes, setFixedTimes] = useState(
    service?.fixedTimeSlots || []
  );
  const [newTime, setNewTime] = useState('');

  const handleAddTime = () => {
    const time = newTime.trim();
    if (!time) return;
    
    // Validate time format
    if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time)) {
      alert('Please enter time in HH:MM format (e.g., 09:15)');
      return;
    }
    
    // Check for duplicates
    if (fixedTimes.includes(time)) {
      alert('This time is already added');
      return;
    }
    
    // Add and sort
    const updated = [...fixedTimes, time].sort();
    setFixedTimes(updated);
    setNewTime('');
  };

  const handleRemoveTime = (time) => {
    setFixedTimes(fixedTimes.filter(t => t !== time));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    const serviceData = {
      ...service,
      // If using fixed slots, include the array
      // If not using fixed slots, explicitly set to undefined
      fixedTimeSlots: useFixedSlots ? fixedTimes : undefined,
    };
    
    onSubmit(serviceData);
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Other service fields... */}
      
      <div className="mb-6">
        <label className="flex items-center gap-2 mb-3">
          <input
            type="checkbox"
            checked={useFixedSlots}
            onChange={(e) => setUseFixedSlots(e.target.checked)}
            className="w-4 h-4"
          />
          <span className="font-medium">Use Fixed Time Slots</span>
        </label>
        
        <p className="text-sm text-gray-600 mb-3">
          Enable this to set specific appointment times instead of automatic slot generation.
          For example: 9:15 AM, 11:30 AM, 4:00 PM
        </p>

        {useFixedSlots && (
          <div className="border rounded-lg p-4 bg-gray-50">
            <div className="mb-3">
              <label className="block text-sm font-medium mb-2">
                Add Time Slot (24-hour format)
              </label>
              <div className="flex gap-2">
                <input
                  type="time"
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                  className="flex-1 px-3 py-2 border rounded"
                  placeholder="09:15"
                />
                <button
                  type="button"
                  onClick={handleAddTime}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Add
                </button>
              </div>
            </div>

            {fixedTimes.length > 0 ? (
              <div>
                <p className="text-sm font-medium mb-2">Configured Times:</p>
                <div className="space-y-2">
                  {fixedTimes.map((time) => (
                    <div
                      key={time}
                      className="flex items-center justify-between bg-white p-2 rounded border"
                    >
                      <span className="font-mono font-medium">
                        {time}
                        <span className="ml-2 text-gray-500 text-sm">
                          ({formatTimeDisplay(time)})
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveTime(time)}
                        className="text-red-600 hover:text-red-800"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500 italic">
                No fixed times set. Add at least one time slot.
              </p>
            )}
          </div>
        )}
      </div>

      <button type="submit" className="px-6 py-2 bg-green-600 text-white rounded">
        Save Service
      </button>
    </form>
  );
}

// Helper function to format time for display
function formatTimeDisplay(time24) {
  const [hours, minutes] = time24.split(':');
  const hour = parseInt(hours);
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour}:${minutes} ${period}`;
}

export default ServiceForm;
```

## API Integration

### Update Service Endpoint

Ensure your service update endpoint handles the `fixedTimeSlots` field:

```javascript
// Backend: PUT /api/admin/services/:id
router.put('/services/:id', async (req, res) => {
  try {
    const { fixedTimeSlots, ...otherFields } = req.body;
    
    const updateData = { ...otherFields };
    
    // Handle fixed time slots
    if (fixedTimeSlots !== undefined) {
      if (Array.isArray(fixedTimeSlots) && fixedTimeSlots.length > 0) {
        // Validate each time
        for (const time of fixedTimeSlots) {
          if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time)) {
            return res.status(400).json({
              error: `Invalid time format: ${time}. Use HH:MM format.`
            });
          }
        }
        updateData.fixedTimeSlots = fixedTimeSlots;
      } else {
        // Empty array or null - remove fixed slots
        updateData.$unset = { fixedTimeSlots: "" };
      }
    }
    
    const service = await Service.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );
    
    res.json(service);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

## UX Considerations

### 1. Visual Indicators

Show a badge or icon on services that use fixed slots:

```jsx
{service.fixedTimeSlots && (
  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
    <ClockIcon className="w-3 h-3 mr-1" />
    Fixed Times
  </span>
)}
```

### 2. Preview Slots

Show what the slots will look like:

```jsx
<div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded">
  <p className="text-sm font-medium mb-2">Preview:</p>
  <p className="text-sm text-gray-700">
    Customers will see appointments available at:
  </p>
  <div className="flex flex-wrap gap-2 mt-2">
    {fixedTimes.map(time => (
      <span key={time} className="px-3 py-1 bg-white border rounded-full text-sm">
        {formatTimeDisplay(time)}
      </span>
    ))}
  </div>
</div>
```

### 3. Warnings

Alert users about potential issues:

```jsx
{useFixedSlots && fixedTimes.length === 0 && (
  <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded">
    <p className="text-sm text-yellow-800">
      ⚠️ Warning: No fixed times configured. This service won't be bookable until you add at least one time slot.
    </p>
  </div>
)}

{useFixedSlots && fixedTimes.length < 3 && (
  <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded">
    <p className="text-sm text-blue-800">
      💡 Tip: Consider adding more time slots to give customers more booking options.
    </p>
  </div>
)}
```

## Quick Actions

Add preset options for common scenarios:

```jsx
<div className="mb-3">
  <p className="text-sm font-medium mb-2">Quick presets:</p>
  <div className="flex gap-2">
    <button
      type="button"
      onClick={() => setFixedTimes(['09:00', '12:00', '15:00', '18:00'])}
      className="text-xs px-3 py-1 bg-gray-200 rounded hover:bg-gray-300"
    >
      Every 3 hours (9-6)
    </button>
    <button
      type="button"
      onClick={() => setFixedTimes(['10:00', '14:00', '16:00'])}
      className="text-xs px-3 py-1 bg-gray-200 rounded hover:bg-gray-300"
    >
      Morning + Afternoon
    </button>
    <button
      type="button"
      onClick={() => setFixedTimes([])}
      className="text-xs px-3 py-1 bg-gray-200 rounded hover:bg-gray-300"
    >
      Clear All
    </button>
  </div>
</div>
```

## Bulk Operations

For tenants with many services:

```jsx
function BulkFixedSlotsModal({ services, onUpdate }) {
  const [selectedServices, setSelectedServices] = useState([]);
  const [fixedTimes, setFixedTimes] = useState([]);

  const handleBulkUpdate = async () => {
    const promises = selectedServices.map(serviceId =>
      fetch(`/api/admin/services/${serviceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fixedTimeSlots: fixedTimes })
      })
    );
    
    await Promise.all(promises);
    onUpdate();
  };

  return (
    <div className="modal">
      <h2>Apply Fixed Time Slots to Multiple Services</h2>
      {/* Service selection checkboxes */}
      {/* Time slot configuration */}
      <button onClick={handleBulkUpdate}>
        Apply to {selectedServices.length} services
      </button>
    </div>
  );
}
```

## Testing Checklist

- [ ] Can enable fixed time slots for a service
- [ ] Can add time slots in HH:MM format
- [ ] Invalid time formats show error
- [ ] Duplicate times are prevented
- [ ] Times are displayed in sorted order
- [ ] Can remove individual time slots
- [ ] Can disable fixed slots (revert to computed)
- [ ] Changes persist after save
- [ ] Frontend shows correct slot times after update
- [ ] API returns only fixed slots (not computed)

## Mobile Responsive

Ensure the UI works well on mobile:

```jsx
<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
  {fixedTimes.map((time) => (
    <div key={time} className="flex items-center justify-between bg-white p-3 rounded border">
      {/* Responsive layout */}
    </div>
  ))}
</div>
```
