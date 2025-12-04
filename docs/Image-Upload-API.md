# Image Upload API Documentation

## Overview

The service routes now support uploading images to Cloudinary for both main service images and gallery images.

## Prerequisites

1. **Cloudinary Account**: Sign up at https://cloudinary.com
2. **Environment Variables**: Add these to your `.env` file:
   ```bash
   CLOUDINARY_CLOUD_NAME=your_cloud_name
   CLOUDINARY_API_KEY=your_api_key
   CLOUDINARY_API_SECRET=your_api_secret
   ```

## Endpoints

### 1. Upload Main Service Image

**POST** `/api/services/:id/upload-image`

Upload or replace the main image for a service.

**Headers:**

```
Content-Type: multipart/form-data
Authorization: Bearer <admin_token>
```

**Body:** (form-data)

- `image`: File (required) - The image file to upload

**Example with cURL:**

```bash
curl -X POST http://localhost:4000/api/services/68ee0681ded002672811c089/upload-image \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -F "image=@/path/to/image.jpg"
```

**Response:** (200 OK)

```json
{
  "ok": true,
  "message": "Image uploaded successfully",
  "image": {
    "provider": "cloudinary",
    "id": "beauty-salon/services/abc123",
    "url": "https://res.cloudinary.com/your-cloud/image/upload/v1234567890/beauty-salon/services/abc123.jpg",
    "alt": "Service Name",
    "width": 1200,
    "height": 800
  }
}
```

**Notes:**

- If the service already has an image, the old one will be deleted from Cloudinary
- Images are uploaded to `beauty-salon/services/` folder in Cloudinary
- Temporary local files are automatically cleaned up

---

### 2. Upload Gallery Images

**POST** `/api/services/:id/upload-gallery`

Upload multiple images to the service gallery.

**Headers:**

```
Content-Type: multipart/form-data
Authorization: Bearer <admin_token>
```

**Body:** (form-data)

- `images[]`: File[] (required) - Up to 10 image files

**Example with cURL:**

```bash
curl -X POST http://localhost:4000/api/services/68ee0681ded002672811c089/upload-gallery \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -F "images=@/path/to/image1.jpg" \
  -F "images=@/path/to/image2.jpg" \
  -F "images=@/path/to/image3.jpg"
```

**Response:** (200 OK)

```json
{
  "ok": true,
  "message": "3 image(s) uploaded successfully",
  "gallery": [
    {
      "provider": "cloudinary",
      "id": "beauty-salon/services/gallery/xyz789",
      "url": "https://res.cloudinary.com/your-cloud/image/upload/v1234567890/beauty-salon/services/gallery/xyz789.jpg",
      "alt": "Service Name",
      "width": 800,
      "height": 600
    }
    // ... more images
  ]
}
```

**Notes:**

- Supports up to 10 images per request
- Images are appended to the existing gallery
- Images are uploaded to `beauty-salon/services/gallery/` folder in Cloudinary
- Failed uploads are skipped (partial success is possible)

---

## Frontend Integration Example

### Using Fetch API

```javascript
// Upload main service image
async function uploadServiceImage(serviceId, imageFile) {
  const formData = new FormData();
  formData.append("image", imageFile);

  const response = await fetch(`/api/services/${serviceId}/upload-image`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${adminToken}`,
    },
    body: formData,
  });

  return response.json();
}

// Upload gallery images
async function uploadGalleryImages(serviceId, imageFiles) {
  const formData = new FormData();
  imageFiles.forEach((file) => {
    formData.append("images", file);
  });

  const response = await fetch(`/api/services/${serviceId}/upload-gallery`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${adminToken}`,
    },
    body: formData,
  });

  return response.json();
}
```

### React Component Example

```jsx
function ServiceImageUpload({ serviceId }) {
  const [uploading, setUploading] = useState(false);

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      const result = await uploadServiceImage(serviceId, file);
      console.log("Upload successful:", result);
      // Update UI with new image URL
    } catch (error) {
      console.error("Upload failed:", error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <input
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        disabled={uploading}
      />
      {uploading && <span>Uploading...</span>}
    </div>
  );
}
```

---

## Error Responses

### 400 Bad Request

```json
{
  "error": "No image file provided"
}
```

### 404 Not Found

```json
{
  "error": "Service not found"
}
```

### 500 Internal Server Error

```json
{
  "error": "Failed to upload image to Cloudinary"
}
```

---

## File Storage Flow

1. **Client uploads file** → Sent as multipart/form-data
2. **Multer saves to `uploads/`** → Temporary local storage
3. **Cloudinary upload** → File sent to cloud storage
4. **Database update** → Service record updated with Cloudinary URL
5. **Cleanup** → Temporary local file deleted

---

## Image Format Support

Supported formats: JPG, PNG, GIF, WebP, SVG, BMP, TIFF

Cloudinary automatically optimizes images for web delivery.

---

## Best Practices

1. **Optimize before upload**: Resize large images on the client side first
2. **Validate file types**: Check file extensions before uploading
3. **Limit file size**: Recommend max 5-10MB per image
4. **Handle errors gracefully**: Show user-friendly messages
5. **Show upload progress**: Use progress indicators for better UX

---

## Cloudinary Dashboard

View and manage all uploaded images at:
https://cloudinary.com/console/media_library

You can:

- Browse uploaded images by folder
- Delete unused images
- Generate transformation URLs
- Monitor storage usage
