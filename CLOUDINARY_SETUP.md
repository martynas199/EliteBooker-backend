# Cloudinary Setup Guide

## Error: "Must supply api_key"

This error occurs because Cloudinary credentials are not configured in your `.env` file.

## Quick Setup Steps:

### 1. Get Cloudinary Credentials

If you don't have a Cloudinary account:

1. Go to https://cloudinary.com
2. Sign up for a free account
3. After login, go to Dashboard
4. Copy your credentials:
   - Cloud Name
   - API Key
   - API Secret

### 2. Create `.env` File

In the `beauty-salon-backend` folder, create a `.env` file (copy from `.env.example`):

```bash
# Copy the example file
cp .env.example .env
```

Or on Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

### 3. Add Cloudinary Credentials

Edit the `.env` file and replace these placeholders with your actual credentials:

```bash
# Cloudinary (for image uploads)
CLOUDINARY_CLOUD_NAME=your_actual_cloud_name
CLOUDINARY_API_KEY=your_actual_api_key
CLOUDINARY_API_SECRET=your_actual_api_secret
```

### 4. Restart the Backend Server

After updating `.env`, restart your backend server:

```bash
npm run dev
```

## Alternative: Use URL-based Images (Temporary)

If you don't want to use Cloudinary right now, you can:

1. Use direct image URLs instead
2. Store image URLs in the database
3. Update the hero section with external image URLs

Example:

```javascript
{
  centerImage: {
    url: "https://images.unsplash.com/photo-xxx",
    provider: "url"
  },
  productImage: {
    url: "https://images.unsplash.com/photo-yyy",
    provider: "url"
  }
}
```

## Verify Configuration

After setting up Cloudinary, check the backend logs when starting the server:

- ✅ "Cloudinary configured for hero sections" - Success!
- ⚠️ "Cloudinary not configured" - Check your .env file

## Common Issues

1. **Credentials not loading**: Make sure `.env` is in the root of `beauty-salon-backend` folder
2. **Typos**: Check for extra spaces in credentials
3. **Server restart**: Always restart after changing `.env`
4. **Git**: Make sure `.env` is in `.gitignore` (it should be) - never commit credentials!

## Need Help?

If you're still having issues:

1. Check that `.env` file exists: `ls -la .env` (Linux/Mac) or `dir .env` (Windows)
2. Verify credentials are correct on Cloudinary dashboard
3. Check server console for error messages
