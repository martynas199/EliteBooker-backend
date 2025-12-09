# Google Calendar Integration Setup Guide

## Overview

The Google Calendar integration allows specialists to automatically sync their appointments to their personal Google Calendar. When a booking is made, confirmed, or cancelled, it's automatically reflected in their calendar.

## Setup Steps

### 1. Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the **Google Calendar API**:
   - Go to "APIs & Services" > "Library"
   - Search for "Google Calendar API"
   - Click "Enable"

### 2. Create OAuth 2.0 Credentials

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth client ID"
3. Choose "Web application"
4. Configure:
   - **Name**: "Beauty Booking Calendar Integration"
   - **Authorized JavaScript origins**:
     - `http://localhost:5173` (development)
     - `https://yourdomain.com` (production)
   - **Authorized redirect URIs**:
     - `http://localhost:4000/api/calendar/callback` (development)
     - `https://api.yourdomain.com/api/calendar/callback` (production)
5. Click "Create"
6. Copy the **Client ID** and **Client Secret**

### 3. Configure Environment Variables

Add these to your `.env` file:

```bash
# Google Calendar Integration
GOOGLE_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret-here
GOOGLE_REDIRECT_URI=http://localhost:4000/api/calendar/callback
```

### 4. Install Dependencies

```bash
cd booking-backend
npm install googleapis
```

### 5. Register Routes

In `booking-backend/src/index.js`, add:

```javascript
import calendarRoutes from "./routes/calendar.js";

// ... other routes
app.use("/api/calendar", calendarRoutes);
```

### 6. Restart Backend

```bash
npm run dev
```

## How Specialists Connect Their Calendar

1. **Log in** to the admin dashboard
2. Go to **Settings** page
3. Find the "Google Calendar Integration" section
4. Click **"Connect Google Calendar"**
5. Authorize the application in the Google popup
6. Done! Appointments will now sync automatically

## Features

### Automatic Sync

- ✅ **New bookings** → Event created in Google Calendar
- ✅ **Cancelled bookings** → Event removed from Google Calendar
- ✅ **Rescheduled bookings** → Event updated in Google Calendar

### Event Details

Each calendar event includes:

- Service name and variant
- Customer name, phone, email
- Appointment duration
- Price
- Booking reference ID
- Salon location
- Automatic reminders (1 day before + 30 min before)

### Privacy & Security

- OAuth 2.0 secure authentication
- Tokens stored encrypted in database
- Only specialists can connect their own calendar
- Automatic token refresh (no re-authorization needed)

## Disconnect Calendar

Specialists can disconnect their Google Calendar at any time from the Settings page. This will:

- Stop syncing new appointments
- Remove stored tokens
- NOT delete existing events from their calendar

## Troubleshooting

### "Failed to connect calendar"

- Check that Google Calendar API is enabled in Google Cloud Console
- Verify redirect URI matches exactly (including http/https)
- Make sure CLIENT_ID and CLIENT_SECRET are correct in `.env`

### "Token expired"

- The system automatically refreshes tokens
- If it fails, specialist needs to reconnect their calendar

### Events not syncing

- Check backend logs for errors
- Verify specialist has `googleCalendar.enabled = true` in database
- Check that appointment has `specialistId` set

## API Endpoints

### `GET /api/calendar/connect`

Get Google OAuth URL to connect calendar

- **Auth**: Required (specialist only)
- **Returns**: `{ authUrl: string }`

### `GET /api/calendar/callback`

OAuth callback handler (used by Google after authorization)

- **Query**: `code`, `state`
- **Redirects**: To admin settings page

### `POST /api/calendar/disconnect`

Disconnect Google Calendar

- **Auth**: Required (specialist only)
- **Returns**: `{ success: boolean }`

### `GET /api/calendar/status`

Check if Google Calendar is connected

- **Auth**: Required
- **Returns**: `{ connected: boolean, email: string }`

## Production Checklist

- [ ] Update redirect URIs to production URLs
- [ ] Use HTTPS for all calendar endpoints
- [ ] Set up OAuth consent screen in Google Cloud Console
- [ ] Add privacy policy URL
- [ ] Request verification if needed (for public app)
- [ ] Monitor calendar sync errors and add retry logic
- [ ] Consider rate limiting (Google Calendar API has quotas)

## Next Steps

Once Google Calendar is working, you can add:

- **Outlook Calendar** integration (similar OAuth flow)
- **Apple Calendar** support (via CalDAV)
- **Two-way sync** (import existing calendar events)
- **Team calendars** (sync to salon's shared calendar)
