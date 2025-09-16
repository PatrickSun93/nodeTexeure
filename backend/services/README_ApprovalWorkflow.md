# Product Approval Workflow System

## Overview

The Product Approval Workflow System ensures that all products uploaded by staff members are reviewed and approved by admin users before becoming visible to customers. This system maintains quality control and provides a structured approval process with full audit trails.

## Features Implemented

### 1. Product Status Management
- **Draft**: Initial status for products being created
- **Pending Approval**: Status set when staff uploads a product
- **Approved**: Status set by admin after approval (product becomes visible to customers)
- **Rejected**: Status set by admin with rejection reason and notes
- **Discontinued**: Status for products no longer available

### 2. Automatic Status Assignment
- **Admin users**: Products are automatically set to "approved" status
- **Staff users**: Products are automatically set to "pending_approval" status
- **Customer users**: Cannot create products

### 3. Product Visibility Control
- Only products with "approved" status are visible to public customers
- Admin users can see all products regardless of status
- Product listing, detail, and search endpoints filter by approval status

### 4. Approval History Tracking
- Complete audit trail stored in JSON format in `approval_details` field
- Tracks all approval/rejection actions with timestamps
- Records approver/rejector information and notes
- Maintains historical record of all status changes

### 5. Admin Approval Interface
- Dedicated "Product Approval" tab in admin dashboard
- List of all pending products with creator information
- One-click approve/reject actions with modal dialogs
- Approval history viewer for each product
- Bulk operations support

### 6. Email Notification System
- Automatic notifications sent to product creators
- Separate templates for approval and rejection
- Rich HTML and plain text email formats
- Includes product details and admin notes
- Queued email system for reliable delivery

## API Endpoints

### Product Management (Enhanced)
```
POST /api/admin/products
- Creates product with automatic status assignment based on user role
- Admin: status = 'approved'
- Staff: status = 'pending_approval'

GET /api/admin/products?status=pending_approval
- Filter products by status
- Supports all status values

PUT /api/admin/products/:id
- Update product details
- Status changes trigger approval workflow
```

### Approval Workflow
```
GET /api/admin/products/pending-approval
- Get all products pending approval
- Includes creator information

POST /api/admin/products/:id/approve
- Approve a product
- Body: { notes: "Optional approval notes" }
- Sends approval notification email

POST /api/admin/products/:id/reject
- Reject a product
- Body: { 
    rejection_reason: "incomplete_information|poor_quality_images|incorrect_pricing|duplicate_product|policy_violation|other",
    notes: "Additional feedback"
  }
- Sends rejection notification email

GET /api/admin/products/:id/approval-history
- Get complete approval history for a product
- Includes user details for each action
```

### Public Product Endpoints (Enhanced)
```
GET /api/products
- Only returns approved products
- Maintains existing filtering and pagination

GET /api/products/:id
- Only returns approved products
- Returns 404 for non-approved products

GET /api/products/by-ids
- Only returns approved products from the requested IDs
```

## Database Schema

### Products Table Enhancements
```sql
-- Status field with approval workflow values
status ENUM('draft', 'pending_approval', 'approved', 'rejected', 'discontinued') DEFAULT 'draft'

-- JSON field for approval details and history
approval_details JSON COMMENT 'Contains: notes, approved_by, approved_at, rejection_reason, approval_history'
```

### Approval Details JSON Structure
```json
{
  "status": "approved|rejected",
  "notes": "Admin notes about the approval/rejection",
  "approved_by": "USER_ID",
  "approved_at": "2024-01-01T12:00:00Z",
  "rejected_by": "USER_ID", 
  "rejected_at": "2024-01-01T12:00:00Z",
  "rejection_reason": "incomplete_information",
  "approval_history": [
    {
      "action": "approved|rejected",
      "approved_by": "USER_ID",
      "rejected_by": "USER_ID", 
      "timestamp": "2024-01-01T12:00:00Z",
      "notes": "Action notes",
      "rejection_reason": "reason_code"
    }
  ]
}
```

## Email Notification System

### Notification Service
- `NotificationService.sendProductApprovalNotification(productId, status, details)`
- Generates HTML and text email content
- Queues emails for reliable delivery
- Includes product details and approval information

### Email Templates
- **Approval Email**: Congratulatory message with product details
- **Rejection Email**: Feedback with rejection reason and improvement suggestions
- **Low Stock Alert**: Admin notification for inventory management

### Email Queue System
- Emails queued in `email_queue` table
- Retry logic for failed deliveries
- Status tracking (pending, sent, failed, cancelled)
- Template data storage for personalization

## Admin Dashboard Interface

### Product Approval Management
- **Pending Products List**: Shows all products awaiting approval
- **Product Details**: Name, SKU, price, creator information, submission date
- **Action Buttons**: Approve, Reject, View History
- **Approval Modal**: Optional notes field for approval
- **Rejection Modal**: Required rejection reason dropdown + optional notes
- **History Modal**: Complete approval history with user details and timestamps

### Product Management Enhancements
- **Status Filter**: Filter products by approval status
- **Status Badges**: Visual indicators for product status
- **Creator Information**: Shows who created each product
- **Enhanced Product Form**: Improved layout and validation

## Security and Authorization

### Authentication Requirements
- All admin routes require valid JWT token
- Admin role required for approval actions
- CSRF protection on all write operations
- Rate limiting on admin endpoints

### Role-Based Access Control
- **Admin**: Can approve/reject products, see all products
- **Staff**: Can create products (pending approval), see own products
- **Customer**: Can only see approved products

### Audit Trail
- All approval/rejection actions logged with user information
- Timestamps for all status changes
- Complete history preserved in JSON format
- Admin action logging in audit_logs table

## Testing

### Test Script
Run the approval workflow test:
```bash
node backend/scripts/test-approval-workflow.js
```

### Test Coverage
- Database schema validation
- Product status filtering
- Email notification system
- Admin user verification
- Notification service functionality

## Usage Examples

### Creating a Product (Staff User)
```javascript
// Product automatically gets 'pending_approval' status
const response = await fetch('/api/admin/products', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Luxury Cotton Sheets',
    sku: 'LCS-001',
    slug: 'luxury-cotton-sheets',
    base_price: 149.99,
    category_id: 'CAT001',
    description: 'Premium cotton bed sheets...',
    product_details: {
      material: 'Cotton',
      thread_count: 800
    }
  })
});
```

### Approving a Product (Admin User)
```javascript
const response = await fetch('/api/admin/products/PROD001/approve', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    notes: 'Great product, approved for sale'
  })
});
```

### Rejecting a Product (Admin User)
```javascript
const response = await fetch('/api/admin/products/PROD001/reject', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    rejection_reason: 'incomplete_information',
    notes: 'Please add more detailed product specifications and better images'
  })
});
```

## Configuration

### Environment Variables
- `JWT_SECRET`: Required for authentication
- Email service configuration (if using AWS SES or SMTP)

### Database Requirements
- MySQL with JSON support
- Existing user authentication system
- Email queue table for notifications

## Monitoring and Maintenance

### Key Metrics to Monitor
- Number of products pending approval
- Average approval time
- Rejection rate by reason
- Email delivery success rate

### Maintenance Tasks
- Regular cleanup of old email queue entries
- Monitor approval workflow performance
- Review rejection reasons for process improvement
- Backup approval history data

## Future Enhancements

### Potential Improvements
- Bulk approval/rejection operations
- Approval workflow templates
- Advanced notification preferences
- Integration with external review systems
- Automated quality checks before approval
- Approval delegation and escalation rules