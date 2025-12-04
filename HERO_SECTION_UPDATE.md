# Hero Section Update - Simplified 3-Box Layout

## Summary of Changes

Updated the hero section feature to use a simpler 3-box layout:

- **Box 1**: Text content (title, subtitle, CTA link)
- **Box 2**: Center image (Image 1)
- **Box 3**: Right image (Image 2)

Removed product title/subtitle fields to simplify the structure.

## Backend Changes

### 1. Model Update (`src/models/HeroSection.js`)

- ✅ Removed: `productTitle` field
- ✅ Removed: `productSubtitle` field
- ✅ Renamed: `productImage` → `rightImage`
- ✅ Updated comments to reflect "Image 1" and "Image 2"

### 2. Routes Update (`src/routes/heroSections.js`)

- ✅ Renamed endpoint: `upload-product-image` → `upload-right-image`
- ✅ Updated all references from `productImage` to `rightImage`
- ✅ Updated delete logic to handle `rightImage`

## Frontend Changes

### 1. API Client (`src/features/heroSections/heroSections.api.js`)

- ✅ Renamed: `uploadProductImage()` → `uploadRightImage()`
- ✅ Updated endpoint URL

### 2. Display Component (`src/features/heroSections/HeroSectionDisplay.jsx`)

- ✅ Removed product title/subtitle display
- ✅ Changed right section to show only image
- ✅ Updated to use `section.rightImage` instead of `section.productImage`
- ✅ Simplified layout to 3 equal boxes

### 3. Admin Page (`src/admin/pages/HeroSections.jsx`)

- ✅ Removed product title/subtitle input fields
- ✅ Renamed all `productImage` variables to `rightImage`
- ✅ Updated form section title: "Product Showcase" → "Image 2"
- ✅ Simplified form to only have image upload
- ✅ Updated list view to show image status instead of product title

## New Structure

```
┌─────────────────┬─────────────────┬─────────────────┐
│   Box 1         │   Box 2         │   Box 3         │
│   TEXT          │   IMAGE 1       │   IMAGE 2       │
│                 │                 │                 │
│ - Title         │ (Center/Staff)  │ (Right/Product) │
│ - Subtitle      │                 │                 │
│ - CTA Link      │                 │                 │
└─────────────────┴─────────────────┴─────────────────┘
```

## Database Schema (Updated)

```javascript
{
  // Box 1 - Text
  title: String,
  subtitle: String,
  ctaText: String,
  ctaLink: String,

  // Box 2 - Image 1
  centerImage: {
    url: String,
    publicId: String,
    provider: String
  },

  // Box 3 - Image 2
  rightImage: {
    url: String,
    publicId: String,
    provider: String
  },

  // Settings
  active: Boolean,
  order: Number
}
```

## Migration Notes

**Important**: Existing hero sections with `productImage` field will need to be migrated:

- The old `productImage` field will still exist in the database
- New sections will use `rightImage`
- You may want to run a migration script or manually update existing records

## Testing Checklist

After restarting both servers:

- [ ] Create new hero section with all 3 boxes
- [ ] Upload center image (Box 2)
- [ ] Upload right image (Box 3)
- [ ] Verify all 3 boxes display correctly on services page
- [ ] Check that old sections still work (backward compatibility)
- [ ] Test edit functionality
- [ ] Test delete functionality
- [ ] Verify images are uploaded to Cloudinary
- [ ] Check responsive layout on mobile

## Next Steps

1. **Restart backend server** to load new model and routes
2. **Restart frontend server** to load updated components
3. **Test the updated feature** in admin panel
4. **Migrate existing data** if you have old hero sections
