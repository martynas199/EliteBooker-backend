# Email Configuration Guide

## Admin Password Reset Email Not Sending - SOLUTION

The password reset email functionality is already implemented in the backend (`src/routes/auth.js`), but it requires SMTP email server configuration.

### Required Environment Variables

Add these to your `.env` file in the `booking-backend` directory:

```env
# SMTP Email Configuration
SMTP_HOST=smtp.gmail.com              # Your email provider's SMTP server
SMTP_PORT=587                          # Usually 587 for TLS or 465 for SSL
SMTP_USER=your-email@gmail.com        # Your email address
SMTP_PASS=your-app-password           # Your email password or app-specific password
SMTP_FROM="Elite Booker Admin" <noreply@elitebooker.com>  # Display name and from address
FRONTEND_URL=http://localhost:5173     # Your frontend URL for reset links
```

### Gmail Setup (Most Common)

If using Gmail:

1. **Enable 2-Factor Authentication** on your Google account
2. **Generate an App Password**:
   - Go to: https://myaccount.google.com/apppasswords
   - Select "Mail" and "Other (Custom name)"
   - Copy the 16-character password
3. **Update your .env file**:
   ```env
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your-email@gmail.com
   SMTP_PASS=xxxx xxxx xxxx xxxx  # The 16-character app password
   SMTP_FROM="Elite Booker" <your-email@gmail.com>
   FRONTEND_URL=http://localhost:5173
   ```

### Other Email Providers

#### SendGrid

```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
```

#### Mailgun

```env
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_USER=postmaster@your-domain.mailgun.org
SMTP_PASS=your-mailgun-password
```

#### AWS SES

```env
SMTP_HOST=email-smtp.us-east-1.amazonaws.com
SMTP_PORT=587
SMTP_USER=your-ses-access-key-id
SMTP_PASS=your-ses-secret-access-key
```

## Testing

1. Restart your backend server after updating `.env`
2. Go to the admin login page
3. Click "Forgot Password"
4. Enter your admin email
5. Check your email inbox (and spam folder)

## How It Works

The password reset flow:

1. **User requests reset**: `/api/auth/forgot-password` endpoint
2. **Backend generates token**: Creates a cryptographic token valid for 10 minutes
3. **Email sent**: Uses nodemailer with your SMTP configuration
4. **User clicks link**: Opens reset password page with token
5. **Password updated**: `/api/auth/reset-password` endpoint validates token and updates password

## Security Features

- ✅ Reset tokens expire after 10 minutes
- ✅ Tokens are one-time use only
- ✅ Tokens are cryptographically secure (crypto.randomBytes)
- ✅ Doesn't reveal if email exists in database
- ✅ Requires admin account to be active

## Troubleshooting

### Email not sending?

1. **Check logs**: Look for `[AUTH] SMTP not configured` or `[AUTH] Failed to send password reset email`
2. **Verify credentials**: Test SMTP credentials with a tool like https://www.smtper.net/
3. **Check firewall**: Ensure port 587/465 isn't blocked
4. **Gmail specific**: Make sure "Less secure app access" is enabled or use App Password

### Email arrives in spam?

- Add SPF and DKIM records to your domain
- Use a professional email service (SendGrid, Mailgun, AWS SES)
- Use a custom domain instead of Gmail/Yahoo

### Token expired error?

- Tokens expire after 10 minutes
- User must request a new reset link

## Current Implementation Location

**File**: `booking-backend/src/routes/auth.js`

- Lines 680-771: `sendPasswordResetEmail()` function
- Lines 779-838: `/forgot-password` endpoint
- Lines 843-900: `/reset-password` endpoint

**Frontend**:

- `booking-frontend/src/admin/pages/ForgotPassword.jsx`: Request reset page
- `booking-frontend/src/admin/pages/ResetPassword.jsx`: Reset password page (now redesigned to match login)

---

**Note**: The email functionality is fully implemented and working. You just need to configure your SMTP credentials in the `.env` file.

## Test Email Template Rendering

Use these commands to send template previews to your own inbox:

- Gift-card templates only:
  - `npm run emails:test -- --to=you@example.com`
- Gift-card + booking + order templates:
  - `npm run emails:test:all -- --to=you@example.com`

If `--to` is omitted, the script uses `TEST_EMAIL_TO` (or falls back to `SMTP_USER`).
