# Shopping Cart Feature Documentation

## Overview

Complete shopping cart functionality for the beauty salon e-commerce platform, allowing customers to add products to their cart, manage quantities, and proceed to checkout.

## Features Implemented

### 1. Cart State Management (Redux)

- **Local Storage Persistence**: Cart data saved to localStorage and restored on page load
- **Add to Cart**: Add products with specific variants and quantities
- **Update Quantity**: Increase/decrease item quantities
- **Remove Items**: Delete items from cart
- **Cart Toggle**: Open/close cart sidebar
- **Item Count Badge**: Display total item count in header

### 2. Product Detail Modal Integration

- **Quantity Selector**: +/- buttons with input field
- **Stock Validation**: Prevents adding more than available stock
- **Add to Cart Button**:
  - Shows loading state while adding
  - Displays cart icon
  - Disabled when out of stock
  - Opens cart sidebar after adding
- **Variant Support**: Works with product variants (different sizes/prices)

### 3. Cart Sidebar

- **Slide-in Panel**: Smooth animation from right side
- **Item List**: Display all cart items with images and details
- **Quantity Controls**: Inline +/- buttons for each item
- **Remove Button**: Delete individual items
- **Price Calculation**:
  - Individual item totals
  - Cart subtotal
  - Price per unit display
- **Empty State**: Friendly message when cart is empty
- **Checkout Button**: Proceeds to checkout (placeholder)
- **Continue Shopping**: Closes cart to continue browsing

### 4. Header Integration

- **Cart Icon**: Shopping bag icon in header
- **Item Count Badge**: Red badge showing total item count
- **Click to Open**: Opens cart sidebar on click
- **Mobile Support**: Cart button in mobile menu

## File Structure

```
src/
├── features/
│   └── cart/
│       ├── cartSlice.js          # Redux slice with all cart logic
│       └── CartSidebar.jsx       # Cart UI component
├── app/
│   ├── store.js                  # Redux store (updated)
│   └── routes.jsx                # Header with cart button
└── features/
    └── products/
        └── ProductDetailModal.jsx # Updated with cart integration
```

## Redux Store Structure

### Cart State

```javascript
{
  items: [
    {
      productId: string,
      variantId: string | null,
      quantity: number,
      product: {
        title: string,
        image: string,
        price: number,
        size: string
      },
      addedAt: ISO string
    }
  ],
  isOpen: boolean
}
```

### Available Actions

```javascript
addToCart({ productId, variantId, quantity, product });
removeFromCart({ productId, variantId });
updateQuantity({ productId, variantId, quantity });
clearCart();
toggleCart();
openCart();
closeCart();
```

## Usage Examples

### Adding a Product to Cart

In ProductDetailModal:

```javascript
dispatch(
  addToCart({
    productId: product._id,
    variantId: hasVariants ? product.variants[selectedVariantIndex]._id : null,
    quantity: 2,
    product: {
      title: product.title,
      image: product.image?.url,
      price: displayPrice,
      size: displaySize,
    },
  })
);
```

### Opening the Cart

From anywhere in the app:

```javascript
import { useDispatch } from "react-redux";
import { openCart } from "../features/cart/cartSlice";

const dispatch = useDispatch();
dispatch(openCart());
```

### Getting Cart Data

```javascript
import { useSelector } from "react-redux";

const cartItems = useSelector((state) => state.cart.items);
const isCartOpen = useSelector((state) => state.cart.isOpen);
const itemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
```

## Component Details

### CartSidebar Component

**Props**: None (uses Redux for state)

**Features**:

- Fixed position sidebar (right side)
- Backdrop with click-to-close
- Scrollable item list
- Sticky header and footer
- Escape key to close
- Prevents body scroll when open

**Layout**:

```
┌─────────────────────┐
│ Header (sticky)     │
│ - Title & Item Count│
│ - Close Button      │
├─────────────────────┤
│                     │
│ Scrollable Items    │
│ - Image             │
│ - Title & Size      │
│ - Quantity Controls │
│ - Price & Remove    │
│                     │
├─────────────────────┤
│ Footer (sticky)     │
│ - Subtotal          │
│ - Checkout Button   │
│ - Continue Shopping │
└─────────────────────┘
```

### ProductDetailModal Updates

**New Features**:

1. **Quantity Selector**:

   - Minus button (disabled at 1)
   - Number input (min: 1, max: stock)
   - Plus button (disabled at max stock)
   - Stock display

2. **Add to Cart Button**:
   - Loading spinner while adding
   - Cart icon when ready
   - Disabled states
   - Auto-opens cart on success

**State Variables**:

```javascript
const [quantity, setQuantity] = useState(1);
const [addingToCart, setAddingToCart] = useState(false);
```

## Styling

### Brand Colors

- Primary: `#76540E` (gold)
- Cart Badge: `bg-brand-600`
- Buttons: `bg-brand-600 hover:bg-brand-700`

### Animations

- Sidebar: Smooth slide-in from right
- Backdrop: Fade-in with blur
- Button hovers: Color transitions

### Responsive Design

- Desktop: 400px max width sidebar
- Mobile: Full width sidebar with padding
- Touch-friendly buttons (min 44px height)

## Local Storage

### Storage Key

`cart` - Contains stringified array of cart items

### Data Persistence

- Automatically saved on every cart action
- Loaded on app initialization
- Survives page refreshes
- Error handling for corrupted data

### Example Stored Data

```json
[
  {
    "productId": "690678bd813ab51cde93b77c",
    "variantId": "690678bd813ab51cde93b77d",
    "quantity": 2,
    "product": {
      "title": "Chanel No. 5 Eau de Parfum",
      "image": "https://res.cloudinary.com/...",
      "price": 125.0,
      "size": "100ml"
    },
    "addedAt": "2025-11-02T10:30:00.000Z"
  }
]
```

## User Flow

### Adding Product to Cart

1. **Browse Products**: Customer views product cards on homepage
2. **View Details**: Clicks product to open modal
3. **Select Variant**: Chooses size (if multiple available)
4. **Set Quantity**: Adjusts quantity using +/- buttons
5. **Add to Cart**: Clicks "Add to Cart" button
6. **Feedback**: Button shows loading spinner
7. **Cart Opens**: Sidebar slides in showing added item
8. **Continue**: Customer can continue shopping or checkout

### Managing Cart

1. **View Cart**: Click cart icon in header
2. **Update Quantity**: Use +/- buttons on each item
3. **Remove Items**: Click trash icon
4. **Close Cart**: Click backdrop, X button, or "Continue Shopping"

### Checkout (To Be Implemented)

1. **Review Cart**: Customer views items and total
2. **Click Checkout**: Proceeds to checkout page
3. **Enter Details**: Shipping and payment info
4. **Place Order**: Confirms and places order

## Error Handling

### Edge Cases Handled

- **Out of Stock**: Add to cart button disabled
- **Quantity Limits**: Cannot add more than available stock
- **Corrupted Storage**: Falls back to empty cart
- **Missing Images**: Shows placeholder icon
- **Invalid Quantities**: Clamped to valid range (1 to stock)

### User Feedback

- Loading states during operations
- Success feedback (cart opens)
- Visual disabled states
- Stock warnings ("Only X left")

## Integration Points

### With Product System

- Uses product ID and variant ID for cart items
- Stores product details for display
- Respects stock levels

### With Checkout (Future)

- Cart data available via Redux store
- Can be sent to checkout page
- Supports order creation

### With Backend (Future)

- Can sync cart to server for logged-in users
- Validate stock availability
- Calculate taxes and shipping

## Performance Considerations

### Optimizations

- Cart saved to localStorage asynchronously
- Redux for efficient state updates
- No unnecessary re-renders
- Lazy loading of cart sidebar

### Bundle Size

- CartSidebar only loaded when needed
- Redux Toolkit minimizes boilerplate
- No heavy dependencies

## Accessibility

### Features

- Keyboard navigation (Escape to close)
- ARIA labels on buttons
- Focus management
- Screen reader friendly
- Touch-friendly tap targets

### Keyboard Shortcuts

- `Escape`: Close cart sidebar
- `Tab`: Navigate between elements
- `Enter`: Activate buttons

## Mobile Responsiveness

### Adaptations

- Full-width sidebar on small screens
- Touch-friendly buttons
- Scrollable content area
- Reduced padding on mobile
- Cart button in mobile menu

## Future Enhancements

### Potential Features

1. **Save for Later**: Move items to wishlist
2. **Recently Viewed**: Show recently browsed products
3. **Cart Expiry**: Auto-remove old items
4. **Guest Checkout**: Proceed without account
5. **Promo Codes**: Apply discount codes
6. **Estimated Shipping**: Show shipping cost
7. **Recommended Products**: Suggest related items
8. **Cart Analytics**: Track abandonment rates
9. **Persistent Cart**: Sync across devices
10. **Mini Cart Preview**: Hover preview in header

### Technical Improvements

1. **API Integration**: Save cart to backend
2. **Optimistic Updates**: Instant UI feedback
3. **Undo Actions**: Restore removed items
4. **Batch Operations**: Update multiple items
5. **Stock Monitoring**: Real-time availability check

## Testing Checklist

### Functionality

- [x] Add product to cart
- [x] Update quantity (increase/decrease)
- [x] Remove item from cart
- [x] Cart persists on refresh
- [x] Open/close cart sidebar
- [x] Item count badge updates
- [x] Total price calculates correctly
- [x] Stock limits enforced
- [x] Empty cart state displays
- [x] Variant selection works

### UI/UX

- [x] Smooth animations
- [x] Responsive on mobile
- [x] Buttons have hover states
- [x] Loading states show
- [x] Images display properly
- [x] Prices formatted correctly
- [x] Accessible via keyboard
- [x] Cart icon badge visible

### Edge Cases

- [x] Add item with max stock
- [x] Remove last item
- [x] Open cart when empty
- [x] Corrupted localStorage
- [x] Product without image
- [x] Very long product names
- [x] Large quantity numbers

## Conclusion

The shopping cart feature provides a complete, production-ready solution for managing customer purchases. It integrates seamlessly with the existing product system, provides excellent UX with smooth animations and feedback, and maintains data persistence across sessions. The implementation follows React and Redux best practices, is fully responsive, and provides a solid foundation for future e-commerce features.
