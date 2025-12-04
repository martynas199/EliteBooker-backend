# Checkout and Order Management Feature

## Overview

Complete e-commerce checkout system with order management for both customers and administrators.

## Customer Features

### Checkout Page (`/product-checkout`)

- **Shipping Information Form**:

  - First Name, Last Name, Email, Phone
  - Full address (Address, City, Postal Code, Country)
  - Optional order notes
  - Form validation with required fields

- **Order Summary**:

  - Cart items with images, quantities, and prices
  - Real-time calculations:
    - Subtotal
    - Shipping: FREE over £50, else £5.99
    - VAT: 20% tax on subtotal
    - Total amount
  - Free shipping indicator

- **Responsive Design**:
  - Mobile-first approach
  - Sticky order summary on desktop
  - Mobile/desktop optimized buttons

### Order Success Page (`/order-success/:orderNumber`)

- **Order Confirmation**:

  - Success icon and message
  - Order number display
  - Email confirmation notice

- **Order Details**:

  - Complete item list with images
  - Price breakdown (subtotal, shipping, tax, total)
  - Shipping address
  - Order notes (if provided)

- **Order Status Timeline**:

  - Order placed (timestamp)
  - Processing status
  - Tracking number (when available)
  - Visual status indicators

- **Actions**:
  - Continue Shopping button
  - Print Order button
  - Contact support link

## Admin Features

### Orders Management (`/admin/orders`)

- **Order List**:

  - All orders with key information
  - Order number, customer name, email, phone
  - Item count and total amount
  - Order date/time
  - Status badges (order status + payment status)

- **Status Filters**:

  - All orders
  - Pending
  - Processing
  - Shipped
  - Delivered
  - Cancelled

- **Quick Actions**:

  - View full order details
  - Mark as Processing (from Pending)
  - Mark as Shipped (from Processing)
  - Mark as Delivered (from Shipped)
  - Cancel order (restores stock)

- **Order Detail Modal**:
  - Complete order information
  - All items with images
  - Full shipping address
  - Add/update tracking number
  - Order timeline with timestamps
  - Customer notes
  - Status update buttons

## Backend API

### Order Model Schema

```javascript
OrderSchema {
  orderNumber: String (auto-generated: "ORD-YYMM-XXXX")
  items: [{
    productId: ObjectId (ref: Product)
    variantId: ObjectId
    title: String
    size: String
    price: Number
    quantity: Number
    image: String
  }]
  shippingAddress: {
    firstName, lastName, email, phone
    address, city, postalCode, country
  }
  subtotal: Number
  shipping: Number (0 or 5.99)
  tax: Number (20% VAT)
  total: Number
  paymentMethod: String (card/paypal/cash)
  paymentStatus: String (pending/paid/failed/refunded)
  orderStatus: String (pending/processing/shipped/delivered/cancelled/refunded)
  stripePaymentIntentId: String
  notes: String
  trackingNumber: String
  shippedAt: Date
  deliveredAt: Date
}
```

### API Endpoints

#### Customer Endpoints

- `POST /api/orders` - Create new order
  - Validates stock availability
  - Calculates shipping and tax
  - Deducts stock from products/variants
  - Returns complete order with order number

#### Admin Endpoints

- `GET /api/orders` - List all orders

  - Query params: `orderStatus`, `paymentStatus`, `limit`
  - Returns sorted by creation date (newest first)

- `GET /api/orders/:id` - Get single order by ID

- `GET /api/orders/number/:orderNumber` - Get order by order number

  - Used for customer order lookup

- `PATCH /api/orders/:id` - Update order

  - Update status, tracking number, payment status
  - Auto-sets `shippedAt` when status = "shipped"
  - Auto-sets `deliveredAt` when status = "delivered"

- `POST /api/orders/:id/cancel` - Cancel order

  - Changes status to "cancelled"
  - Restores stock to products/variants
  - Only allowed if not already delivered/cancelled/refunded

- `DELETE /api/orders/:id` - Delete order
  - Only allowed for pending orders
  - Permanent deletion

## Business Logic

### Stock Management

- **On Order Creation**:

  - Validates stock for each item (variant or product level)
  - Returns 400 error if any item out of stock
  - Deducts ordered quantity from stock
  - Atomic operation (all or nothing)

- **On Order Cancellation**:
  - Restores stock for each item
  - Updates variant or product stock accordingly

### Pricing Calculations

- **Subtotal**: Sum of (item price × quantity) for all items
- **Shipping**:
  - FREE if subtotal ≥ £50
  - £5.99 otherwise
- **Tax**: 20% VAT on subtotal only
- **Total**: subtotal + shipping + tax

### Order Number Generation

- Format: `ORD-YYMM-XXXX`
- Example: `ORD-2501-4521`
- YY: Last 2 digits of year
- MM: Month (01-12)
- XXXX: Random 4-digit number
- Generated automatically on order creation

## User Flow

### Customer Journey

1. Browse products → Add to cart
2. Open cart → Click "Proceed to Checkout"
3. Fill shipping information form
4. Review order summary
5. Click "Place Order"
6. Order created, cart cleared
7. Redirected to success page with order number
8. Receive email confirmation (backend ready)

### Admin Journey

1. Navigate to Admin → Orders
2. See all orders or filter by status
3. Click "View Details" on any order
4. Review complete order information
5. Update order status as needed:
   - Mark as Processing
   - Add tracking number
   - Mark as Shipped
   - Mark as Delivered
6. Cancel order if needed (restores stock)

## Integration Points

### Frontend

- **Redux Store**: Cart state management
- **React Router**: Navigation and order number routing
- **API Client**: Centralized axios instance with error handling

### Backend

- **Product Integration**: Stock validation and deduction
- **Cloudinary**: Image URLs for order items
- **MongoDB**: Order storage with indexes on key fields

## Status Badges

### Order Status Colors

- Pending: Yellow
- Processing: Blue
- Shipped: Purple
- Delivered: Green
- Cancelled: Red
- Refunded: Gray

### Payment Status Colors

- Pending: Yellow
- Paid: Green
- Failed: Red
- Refunded: Gray

## Files Created

### Backend

- `src/models/Order.js` - Order schema and model
- `src/routes/orders.js` - Order API endpoints
- `src/server.js` - Registered orders routes

### Frontend

- `src/features/orders/orders.api.js` - Orders API client
- `src/features/orders/ProductCheckoutPage.jsx` - Checkout page
- `src/features/orders/OrderSuccessPage.jsx` - Order confirmation
- `src/admin/pages/Orders.jsx` - Admin orders management
- `src/features/cart/CartSidebar.jsx` - Updated with checkout navigation
- `src/app/routes.jsx` - Added checkout and order routes
- `src/admin/AdminLayout.jsx` - Added Orders menu item

## Future Enhancements

- [ ] Payment integration (Stripe Elements)
- [ ] Email notifications (order confirmation, shipping updates)
- [ ] Order tracking page for customers
- [ ] Export orders to CSV
- [ ] Order search and advanced filters
- [ ] Refund processing
- [ ] Bulk order actions
- [ ] Customer order history page
- [ ] Invoice generation and PDF export
- [ ] Inventory alerts for low stock

## Testing Checklist

- [x] Create order with valid data
- [x] Validate stock availability
- [x] Calculate shipping and tax correctly
- [x] Generate unique order numbers
- [x] Display order confirmation
- [x] Admin can view all orders
- [x] Admin can filter orders by status
- [x] Admin can update order status
- [x] Admin can add tracking numbers
- [x] Cancel order restores stock
- [ ] Payment processing (when integrated)
- [ ] Email notifications (when integrated)

## Notes

- Free shipping threshold: £50
- VAT rate: 20%
- Standard shipping cost: £5.99
- Order numbers are unique and sequential by month
- Stock is deducted immediately on order creation
- Cancelled orders restore stock automatically
- Admin can only delete pending orders
- Delivered/cancelled/refunded orders cannot be cancelled again
