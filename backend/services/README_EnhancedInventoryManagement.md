# Enhanced Inventory Management System

## Overview

The enhanced inventory management system provides comprehensive stock tracking, automatic inventory updates, low stock alerts, and detailed audit trails for all inventory movements.

## Key Features

### 1. Stock Reservation During Checkout
- Automatically reserves stock when customers proceed to checkout
- Reservations expire after 1 hour if not confirmed
- Prevents overselling by temporarily holding inventory
- Automatic cleanup of expired reservations

### 2. Inventory Movement Logging with Audit Trail
- Comprehensive logging of all inventory changes
- Tracks before/after quantities for complete audit trail
- Records movement type, reference information, and user details
- Supports various movement types: restock, sale, adjustment, return, damage

### 3. Low Stock Alert System
- Automatic detection of low stock items based on reorder points
- Email notifications sent to admin users
- Cooldown period to prevent spam (24 hours between alerts for same product)
- Configurable alert thresholds and settings

### 4. Automatic Inventory Updates
- Inventory automatically updated when orders are confirmed
- Integration with payment processing system
- Handles both individual products and variants
- Error handling and rollback capabilities

## API Endpoints

### Enhanced Inventory Routes

#### POST /api/inventory/update-with-logging
Updates inventory with automatic movement logging.

**Request Body:**
```json
{
  "product_id": "PROD0000000001",
  "variant_id": "PROD0000000001-VAR-1", // optional
  "quantity_change": 10,
  "movement_type": "restock",
  "reference_type": "manual",
  "reference_id": "RESTOCK001",
  "details": {
    "notes": "Weekly restock",
    "supplier": "ABC Supplier"
  }
}
```

#### POST /api/inventory/process-order
Processes inventory updates for completed orders.

**Request Body:**
```json
{
  "order_id": "ORDER0000000001",
  "order_items": [
    {
      "product_id": "PROD0000000001",
      "variant_id": "PROD0000000001-VAR-1",
      "quantity": 2
    }
  ]
}
```

#### GET /api/inventory/movement-history
Retrieves inventory movement history with filtering options.

**Query Parameters:**
- `inventory_id`: Filter by specific inventory record
- `product_id`: Filter by product
- `movement_type`: Filter by movement type
- `reference_type`: Filter by reference type
- `date_from`: Start date filter
- `date_to`: End date filter
- `limit`: Limit number of results

#### POST /api/inventory/trigger-low-stock-alerts
Manually triggers low stock alerts for all items below reorder point.

### Existing Enhanced Routes

#### POST /api/inventory/reserve
Reserves stock during checkout process.

#### POST /api/inventory/confirm/:cartId
Confirms stock reservations (converts to sales).

#### POST /api/inventory/release-expired
Releases expired stock reservations.

## Service Methods

### InventoryService Class

#### updateInventoryWithLogging(productId, variantId, quantityChange, movementType, referenceType, referenceId, createdBy, details)
Updates inventory with automatic movement logging and low stock checking.

#### processOrderInventoryUpdate(orderId, orderItems, processedBy)
Processes inventory updates for multiple order items with comprehensive error handling.

#### checkAndTriggerLowStockAlert(inventoryId)
Checks if inventory item is low stock and triggers alert if needed.

#### triggerLowStockAlert(inventoryItem)
Sends low stock alert emails to admin users with cooldown protection.

#### getMovementHistory(inventoryId, filters)
Retrieves detailed movement history with filtering and pagination.

## Movement Types

- **restock**: Adding inventory (positive quantity)
- **sale**: Selling inventory (reduces available, increases sold)
- **adjustment**: Manual inventory adjustments
- **return**: Customer returns (increases available, reduces sold)
- **damage**: Damaged goods removal (reduces available)

## Reference Types

- **order**: Related to order processing
- **manual**: Manual adjustments by staff
- **return**: Customer returns
- **damage**: Damage reports

## Low Stock Alert System

### Configuration
System settings control alert behavior:
- `inventory_low_stock_alert_enabled`: Enable/disable alerts
- `inventory_reservation_timeout_minutes`: Reservation timeout (default: 60)
- `inventory_low_stock_alert_cooldown_hours`: Alert cooldown period (default: 24)

### Alert Process
1. Inventory update triggers low stock check
2. If quantity ≤ reorder point, alert is triggered
3. System checks for recent alerts (24-hour cooldown)
4. Email notifications sent to all active admin users
5. Alert details stored in email queue

### Email Template
Low stock alerts include:
- Product name and SKU
- Variant details (size, color, pattern)
- Current stock level
- Reorder point
- Suggested reorder quantity

## Database Schema

### Enhanced Tables

#### inventory_movements
```sql
CREATE TABLE inventory_movements (
    id VARCHAR(50) PRIMARY KEY,
    inventory_id VARCHAR(50) NOT NULL,
    movement_type ENUM('restock', 'sale', 'adjustment', 'return', 'damage') NOT NULL,
    quantity_change INT NOT NULL,
    reference_type ENUM('order', 'manual', 'return', 'damage') NOT NULL,
    reference_id VARCHAR(50) NULL,
    movement_details JSON,
    created_by VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### stock_reservations
```sql
CREATE TABLE stock_reservations (
    id VARCHAR(50) PRIMARY KEY,
    product_id VARCHAR(50) NOT NULL,
    variant_id VARCHAR(50) NULL,
    cart_id VARCHAR(50) NULL,
    user_id VARCHAR(50) NULL,
    quantity INT UNSIGNED NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Database Views

#### inventory_summary
Provides comprehensive inventory overview with stock status.

#### recent_inventory_movements
Shows recent inventory movements with product and user details.

## Automated Tasks

### Cleanup Script
`backend/scripts/cleanup-expired-reservations.js`

**Purpose:**
- Releases expired stock reservations
- Checks for low stock items and sends alerts
- Should be run every 15 minutes via cron job

**Cron Job Example:**
```bash
# Run every 15 minutes
*/15 * * * * /usr/bin/node /path/to/backend/scripts/cleanup-expired-reservations.js
```

## Integration Points

### Payment Processing
- Inventory automatically updated when payments are confirmed
- Stock reservations converted to sales
- Failed payments release reservations

### Order Management
- Order completion triggers inventory updates
- Order cancellation can restore inventory
- Refunds handled through return movements

### Admin Dashboard
- Real-time inventory levels
- Low stock alerts and notifications
- Movement history and audit trails
- Bulk inventory operations

## Error Handling

### Insufficient Stock
- Prevents negative inventory
- Clear error messages for insufficient stock
- Automatic rollback on failures

### Concurrent Updates
- Database-level constraints prevent race conditions
- Proper transaction handling
- Retry logic for temporary failures

### Logging Failures
- Movement logging failures don't block inventory updates
- Error logging for troubleshooting
- Graceful degradation when logging fails

## Testing

### Test Scripts
- `backend/scripts/test-inventory.js`: Comprehensive functionality testing
- `backend/scripts/test-low-stock-scenario.js`: Low stock alert testing

### Test Coverage
- Stock reservation and confirmation
- Inventory updates with logging
- Low stock detection and alerts
- Movement history retrieval
- Error handling scenarios

## Performance Considerations

### Database Indexes
- Optimized queries for inventory lookups
- Indexes on frequently queried fields
- Efficient movement history retrieval

### Caching
- Consider Redis caching for frequently accessed inventory data
- Cache invalidation on inventory updates

### Monitoring
- Track inventory update performance
- Monitor alert system effectiveness
- Database query optimization

## Security

### Access Control
- Admin-only access to sensitive inventory operations
- User authentication for all inventory modifications
- Audit trail for all changes

### Data Validation
- Input validation for all inventory operations
- Prevent SQL injection and XSS attacks
- Proper error handling without information disclosure

## Future Enhancements

### Planned Features
- Automated reordering based on reorder points
- Supplier integration for purchase orders
- Inventory forecasting and analytics
- Multi-location inventory support
- Barcode scanning integration

### Scalability
- Horizontal scaling considerations
- Database sharding strategies
- Microservice architecture migration path