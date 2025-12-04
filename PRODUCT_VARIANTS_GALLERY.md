# Product Variants & Gallery Images Feature

## Overview

This document describes the implementation of product variants (size/price combinations) and multiple image gallery support for the beauty salon e-commerce system.

## Features Implemented

### 1. Product Variants

- **Multiple Size Options**: Each product can have multiple variants with different sizes
- **Individual Pricing**: Each variant has its own price, original price, stock level, and SKU
- **Backward Compatibility**: Legacy single size/price fields maintained for existing products
- **Validation**: At least one variant is required per product

### 2. Multiple Image Gallery

- **Main Image**: Primary product image for thumbnails and listings
- **Gallery Images**: Array of additional images (up to 10 per upload)
- **Image Management**: Upload multiple images at once or delete individual gallery images
- **Cloudinary Storage**: All images stored securely on Cloudinary with automatic cleanup

## Backend Changes

### Database Schema (`src/models/Product.js`)

#### VariantSchema

```javascript
{
  size: String (required),
  price: Number (required, min: 0),
  originalPrice: Number (nullable, min: 0),
  stock: Number (default: 0, min: 0),
  sku: String (optional),
  _id: true
}
```

#### Updated ProductSchema

```javascript
{
  // ... existing fields
  variants: [VariantSchema] (required, min length: 1),
  images: [ImageSchema] (array of gallery images),
  // Legacy fields kept for backward compatibility
  size: String,
  price: Number,
  originalPrice: Number,
  stock: Number
}
```

### API Endpoints (`src/routes/products.js`)

#### Existing Endpoints (Updated)

- `POST /api/products/:id/upload-image` - Upload main product image
- `DELETE /api/products/:id` - Now deletes all gallery images on Cloudinary

#### New Endpoints

- `POST /api/products/:id/upload-images` - Upload multiple gallery images (max 10)
- `DELETE /api/products/:id/images/:imageIndex` - Delete specific gallery image

### Route Details

**Upload Multiple Images**

```http
POST /api/products/:id/upload-images
Content-Type: multipart/form-data

Body: images[] (array of files, max 10)
```

**Delete Gallery Image**

```http
DELETE /api/products/:id/images/:imageIndex
```

## Frontend Changes

### Admin Products Page (`src/admin/pages/Products.jsx`)

#### New State Variables

```javascript
const [galleryFiles, setGalleryFiles] = useState([]);
const [galleryPreviews, setGalleryPreviews] = useState([]);
const [existingGalleryImages, setExistingGalleryImages] = useState([]);
```

#### Variant Management UI

- **Add/Remove Variants**: Dynamic form to manage multiple size/price combinations
- **Variant Table**: Grid layout showing size, price, original price, stock, and SKU
- **Validation**: Ensures at least one variant with size and price

#### Gallery Management UI

- **Multiple File Selection**: File input with `multiple` attribute
- **Preview Grid**: 4-column grid showing existing and new images
- **Delete Controls**: Hover to reveal delete button on each image
- **Visual Separation**: Existing images vs new images to upload

### Product Card (`src/features/products/ProductCard.jsx`)

#### Price Display Logic

```javascript
// Single variant: £99.99
// Multiple variants: from £45.00
// With discount: £45.00 (£60.00 line-through)
```

#### Size Display

- Single variant: Shows size (e.g., "50ml")
- Multiple variants: "3 sizes available"

### Product Detail Modal (`src/features/products/ProductDetailModal.jsx`)

#### Image Gallery

- **Main Image Display**: Large image with navigation arrows
- **Thumbnail Grid**: 4-column grid of clickable thumbnails
- **Active State**: Selected thumbnail highlighted with brand color
- **Navigation**: Previous/Next arrows to cycle through images

#### Size Selector

- **Grid Layout**: 3-column button grid for size selection
- **Active State**: Selected size highlighted with brand color
- **Price Display**: Each size button shows its price
- **Stock Indicator**: Out of stock sizes shown as disabled and line-through
- **Dynamic Updates**: Price and stock change based on selected size

### API Client (`src/features/products/products.api.js`)

#### New Methods

```javascript
ProductsAPI.uploadImages(id, files); // Upload multiple images
ProductsAPI.deleteImage(id, imageIndex); // Delete single gallery image
```

## Usage Examples

### Creating a Product with Variants (Admin)

1. **Fill Basic Info**: Title, description, category, etc.
2. **Add Variants**:
   - Click "+ Add Variant"
   - Enter size (e.g., "50ml")
   - Enter price (e.g., "45.00")
   - Optional: original price for discount
   - Set stock level
   - Optional: SKU code
3. **Upload Images**:
   - Main Image: Single file upload for thumbnail
   - Gallery: Multiple file upload for detail view
4. **Set Options**: Featured, active, display order
5. **Submit**: Product saved with all variants and images

### Managing Existing Product

1. **Edit Product**: Click edit button in product list
2. **Modify Variants**:
   - Edit existing variant fields
   - Add new variants with "+ Add Variant"
   - Remove variants with trash icon (min 1 required)
3. **Manage Gallery**:
   - View existing images in grid
   - Hover and click X to delete
   - Upload additional images via file selector
4. **Save Changes**: All updates applied

### Customer Experience

1. **Browse Products**: See price ranges ("from £45.00") for multi-variant products
2. **View Details**: Click product card to open modal
3. **Navigate Gallery**: Use arrows or thumbnails to view all images
4. **Select Size**: Choose from available sizes (disabled if out of stock)
5. **See Updated Info**: Price and stock update based on selected size
6. **Add to Cart**: Button disabled if selected size out of stock

## Technical Details

### Image Storage

- **Provider**: Cloudinary
- **Folder**: `products/`
- **Format**: Original format preserved
- **Cleanup**: Automatic deletion when product/image removed

### Validation Rules

- **Variants**: Minimum 1 variant required
- **Size**: Required for each variant
- **Price**: Required, must be ≥ 0
- **Stock**: Default 0, must be ≥ 0
- **Images**: Maximum 10 images per upload request

### Performance Considerations

- **Lazy Loading**: Images loaded on demand
- **Optimized Uploads**: Multiple images uploaded in parallel
- **Efficient Storage**: Only one database write per batch upload
- **Cleanup**: Old images deleted before new ones uploaded

## Migration Notes

### Existing Products

- Legacy fields (`size`, `price`, `originalPrice`, `stock`) preserved
- Admin edit will convert to variant format automatically
- Single `image` field still used for main product image
- New `images` array for gallery (backward compatible)

### Data Flow

```
Create Product
├── Save product with variants to MongoDB
├── Upload main image → Cloudinary
├── Upload gallery images → Cloudinary
└── Update product with image URLs

Edit Product
├── Load existing product data
├── Convert legacy fields to variant if needed
├── Display existing gallery images
├── Allow adding/removing gallery images
└── Save all changes atomically
```

## Future Enhancements

### Potential Improvements

1. **Image Reordering**: Drag-and-drop to reorder gallery images
2. **Bulk Variant Import**: CSV upload for many variants
3. **Variant Images**: Different images per variant
4. **Image Zoom**: Lightbox or magnifier on modal
5. **Image Optimization**: Automatic compression and resizing
6. **Video Support**: Add product video to gallery
7. **Color Variants**: Support color swatches in addition to sizes
8. **Variant-Specific Stock Alerts**: Email notifications per variant

## Testing Checklist

### Backend

- [x] Create product with single variant
- [x] Create product with multiple variants
- [x] Update product variants
- [x] Delete product (cleans up all images)
- [x] Upload multiple images
- [x] Delete individual gallery image
- [x] Handle invalid variant data
- [x] Backward compatibility with legacy fields

### Frontend Admin

- [x] Add/remove variants in form
- [x] Validate minimum 1 variant
- [x] Upload multiple gallery images
- [x] Preview gallery images before upload
- [x] Delete existing gallery images
- [x] Edit product loads all data correctly
- [x] Form reset clears gallery state

### Frontend Customer

- [x] Product card shows price range
- [x] Product card shows "X sizes available"
- [x] Modal displays image gallery
- [x] Navigate gallery with arrows
- [x] Select images via thumbnails
- [x] Size selector updates price
- [x] Size selector updates stock
- [x] Out of stock sizes disabled
- [x] Responsive on mobile devices

## Conclusion

This feature provides a complete e-commerce experience with:

- **Flexible Pricing**: Different prices for different sizes
- **Rich Product Display**: Multiple images showcase products better
- **Professional UX**: Size selectors and image galleries match modern e-commerce standards
- **Easy Management**: Admin can easily manage variants and images
- **Backward Compatible**: Existing products continue to work

The implementation follows best practices for file uploads, image storage, and responsive design while maintaining code quality and user experience.
