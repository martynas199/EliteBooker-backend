# OAuth Configuration Guide

## Google OAuth Setup

1. Go to Google Cloud Console: https://console.cloud.google.com/
2. Create a new project or select existing one
3. Enable Google+ API
4. Go to "Credentials" → "Create Credentials" → "OAuth client ID"
5. Configure OAuth consent screen (add your domain)
6. Create OAuth Client ID:
   - Application type: Web application
   - Authorized redirect URIs:
     - Development: http://localhost:4000/api/auth/google/callback
     - Production: https://yourdomain.com/api/auth/google/callback
7. Copy Client ID and Client Secret

Add to .env:

```
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
```

## Apple OAuth Setup

1. Go to Apple Developer Console: https://developer.apple.com/
2. Create an App ID with Sign In with Apple capability
3. Create a Services ID:
   - Identifier: com.yourcompany.webapp
   - Enable Sign In with Apple
   - Configure domains and return URLs:
     - Domain: yourdomain.com
     - Return URLs:
       - Development: http://localhost:4000/api/auth/apple/callback
       - Production: https://yourdomain.com/api/auth/apple/callback
4. Create a Key:
   - Enable Sign In with Apple
   - Download the .p8 key file
5. Get your Team ID from membership details

Add to .env:

```
APPLE_CLIENT_ID=com.yourcompany.webapp
APPLE_TEAM_ID=YOUR10CHARTEAMID
APPLE_KEY_ID=YOUR10CHARKEYID
APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY_CONTENT\n-----END PRIVATE KEY-----"
```

## Required Environment Variables

Make sure these are also set:

```
BACKEND_URL=http://localhost:4000  # or your production URL
FRONTEND_URL=http://localhost:5173  # or your production URL
JWT_SECRET=your_jwt_secret_key_here
```

## Testing OAuth Locally

For local development:

1. Google OAuth works with localhost
2. Apple OAuth requires HTTPS - use ngrok or similar for local testing:
   ```
   ngrok http 4000
   ```
   Then update BACKEND_URL and Apple return URLs to use the ngrok URL

## Production Deployment

1. Ensure all URLs use HTTPS
2. Update OAuth provider callback URLs to production domain
3. Set BACKEND_URL and FRONTEND_URL to production values
4. Keep secrets secure (use environment variables, not committed .env file)
