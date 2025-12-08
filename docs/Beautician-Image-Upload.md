# Beautician Image Upload API

## Endpoint

### Upload Profile Image

**POST** `/api/specialists/:id/upload-image`

Upload a profile image for a specialist to Cloudinary.

#### Requirements

- Admin authentication required
- Multipart form-data
- Single file upload with field name `image`

#### Parameters

- `id` (path): Beautician MongoDB ObjectId

#### Request Body

- `image` (file): Image file (JPEG, PNG, etc.)

#### Success Response (200)

```json
{
  "message": "Image uploaded successfully",
  "image": {
    "provider": "cloudinary",
    "id": "specialists/abc123...",
    "url": "https://res.cloudinary.com/your-cloud/image/upload/v123/specialists/abc.jpg",
    "alt": "Beautician Name",
    "width": 1200,
    "height": 1200
  }
}
```

#### Error Responses

- **400 Bad Request**: Invalid ID or no file provided
- **404 Not Found**: Beautician not found
- **401 Unauthorized**: Admin authentication required

## Example Usage

### cURL

```bash
curl -X POST http://localhost:4000/api/specialists/507f1f77bcf86cd799439011/upload-image \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -F "image=@/path/to/profile-photo.jpg"
```

### JavaScript (FormData)

```javascript
const formData = new FormData();
formData.append("image", fileInput.files[0]);

const response = await fetch(`/api/specialists/${beauticianId}/upload-image`, {
  method: "POST",
  headers: {
    Authorization: "Bearer YOUR_ADMIN_TOKEN",
  },
  body: formData,
});

const result = await response.json();
console.log("Uploaded:", result.image.url);
```

## Database Schema

The `Beautician` model stores images in the following format:

```javascript
{
  image: {
    provider: "cloudinary",        // Always "cloudinary" for uploaded images
    id: "specialists/abc123...",   // Cloudinary public_id (for deletion)
    url: "https://res.cloudinary.com/...", // Full image URL
    alt: "Beautician Name",        // Alt text (defaults to specialist name)
    width: 1200,                   // Image width in pixels
    height: 1200                   // Image height in pixels
  }
}
```

## Features

1. **Automatic Old Image Deletion**: When uploading a new image, the old image is automatically deleted from Cloudinary
2. **Temporary File Cleanup**: Temporary files are always cleaned up, even on error
3. **Cloudinary Organization**: Images are uploaded to the `specialists` folder
4. **Metadata Storage**: Width, height, and public_id are stored for future use

## Frontend Integration

The frontend uses a two-step process:

1. **Save Beautician**: Create/update specialist without image
2. **Upload Image**: If a new image was selected, upload it separately

This ensures the specialist is saved even if image upload fails.

See `src/admin/pages/Staff.jsx` for implementation example.

## Environment Variables

Ensure these are set in your `.env` file:

```env
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

**Important**: Do NOT use quotes around the values in `.env` files.

## Testing

To verify Cloudinary is configured correctly:

```bash
node scripts/check-env.js
node scripts/test-cloudinary.js
```
