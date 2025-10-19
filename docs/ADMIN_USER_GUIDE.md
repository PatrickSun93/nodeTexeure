# Admin User Guide

## Overview

This guide provides comprehensive instructions for administrators to manage the bed texture e-commerce platform effectively. It covers all administrative functions from product management to order processing and system monitoring.

## Getting Started

### Accessing the Admin Dashboard

1. Navigate to `https://admin.yourdomain.com`
2. Log in with your admin credentials
3. You'll be redirected to the main dashboard

### Dashboard Overview

The main dashboard provides:
- **Sales Analytics**: Revenue, orders, and conversion metrics
- **Quick Actions**: Common administrative tasks
- **System Status**: Health indicators for critical services
- **Recent Activity**: Latest orders, user registrations, and system events

## Product Management

### Adding New Products

1. **Navigate to Products > Add New**
2. **Fill in Product Details:**
   - Product Name (English and Chinese)
   - Description (rich text editor)
   - Category selection
   - Price and currency
   - SKU (auto-generated if left blank)
   - Weight and dimensions

3. **Upload Images:**
   - Primary image (required)
   - Additional images (up to 10)
   - Images are automatically optimized and thumbnails generated

4. **Set Inventory:**
   - Initial stock quantity
   - Low stock threshold
   - Reorder point

5. **Configure Variants (if applicable):**
   - Size options
   - Color options
   - Variant-specific pricing and inventory

6. **Save as Draft or Submit for Approval**

### Product Approval Workflow

**For Staff Users:**
1. Products are automatically set to "Pending Approval" status
2. Admin users receive notifications for pending products
3. Products are not visible to customers until approved

**For Admin Users:**
1. **Navigate to Products > Pending Approval**
2. **Review Product Details:**
   - Check all information for accuracy
   - Verify image quality and appropriateness
   - Ensure pricing is correct

3. **Make Decision:**
   - **Approve**: Product becomes visible to customers
   - **Reject**: Product returns to draft with notes
   - **Request Changes**: Send back with specific feedback

4. **Add Approval Notes** (optional but recommended)

### Managing Existing Products

**Bulk Operations:**
- Select multiple products using checkboxes
- Available actions: Delete, Update Category, Change Status, Export

**Individual Product Actions:**
- **Edit**: Modify any product details
- **Duplicate**: Create a copy with similar settings
- **Archive**: Hide from customers but keep in system
- **Delete**: Permanently remove (use with caution)

### Inventory Management

**Stock Levels:**
1. **Navigate to Inventory > Stock Levels**
2. **View Current Stock** for all products and variants
3. **Update Stock:**
   - Manual adjustment with reason
   - Bulk import via CSV
   - Automatic updates from sales

**Low Stock Alerts:**
- Automatic notifications when stock falls below threshold
- Configure alert recipients in Settings > Notifications
- Set custom thresholds per product

**Inventory Movements:**
- Complete audit trail of all stock changes
- Filter by date, product, or reason
- Export reports for accounting

## Order Management

### Order Processing Workflow

**New Orders:**
1. Orders appear in **Orders > New** section
2. **Review Order Details:**
   - Customer information
   - Items ordered
   - Payment status
   - Shipping address

3. **Process Order:**
   - Verify payment confirmation
   - Check inventory availability
   - Update status to "Processing"

**Order Status Updates:**
- **Pending**: Awaiting payment confirmation
- **Confirmed**: Payment received, ready for processing
- **Processing**: Being prepared for shipment
- **Shipped**: Dispatched with tracking information
- **Delivered**: Confirmed delivery
- **Cancelled**: Order cancelled (with reason)
- **Refunded**: Payment refunded

### Shipping Management

**Creating Shipments:**
1. **Select orders ready for shipping**
2. **Generate Shipping Labels:**
   - FedEx integration automatically calculates rates
   - Print shipping labels directly
   - Tracking numbers generated automatically

3. **Update Order Status:**
   - Status changes to "Shipped"
   - Customer receives email notification with tracking info

**Tracking Management:**
- Real-time tracking updates from FedEx
- Customer notifications for delivery milestones
- Handle delivery exceptions and issues

### Refunds and Returns

**Processing Refunds:**
1. **Navigate to Orders > Refunds**
2. **Select Order** requiring refund
3. **Choose Refund Type:**
   - Full refund
   - Partial refund
   - Store credit

4. **Process Through Stripe:**
   - Automatic refund processing
   - Customer notification sent
   - Inventory restored if applicable

**Return Management:**
- Track return requests
- Generate return labels
- Process returns upon receipt
- Update inventory accordingly

## Customer Management

### User Accounts

**View Customer Information:**
- Personal details
- Order history
- Payment methods
- Shipping addresses
- Account status

**Account Actions:**
- **Activate/Deactivate**: Enable or disable customer accounts
- **Reset Password**: Send password reset email
- **Update Information**: Modify customer details
- **View Activity**: See login history and actions

### Customer Support

**Communication Tools:**
- Send direct emails to customers
- View customer support tickets
- Access order-related communications
- Track customer satisfaction metrics

## Marketing and Promotions

### Coupon Management

**Creating Coupons:**
1. **Navigate to Marketing > Coupons**
2. **Set Coupon Details:**
   - Coupon code (or auto-generate)
   - Discount type (percentage or fixed amount)
   - Discount value
   - Minimum order amount

3. **Configure Restrictions:**
   - Expiration date
   - Usage limits (total and per customer)
   - Product/category restrictions
   - First-time customer only

4. **Activate Coupon**

**Monitoring Coupon Performance:**
- Usage statistics
- Revenue impact
- Customer acquisition metrics
- Popular coupon types

### Email Marketing

**Abandoned Cart Recovery:**
- Automatic email sequences
- Customizable templates
- Performance tracking
- A/B testing capabilities

**Newsletter Management:**
- Customer segmentation
- Email template editor
- Scheduling and automation
- Open and click-through rates

## Analytics and Reporting

### Sales Analytics

**Revenue Reports:**
- Daily, weekly, monthly, and yearly views
- Product performance analysis
- Category-wise sales breakdown
- Geographic sales distribution

**Key Metrics:**
- Total revenue
- Average order value
- Conversion rates
- Customer lifetime value
- Return customer rate

### Inventory Reports

**Stock Reports:**
- Current inventory levels
- Low stock alerts
- Inventory turnover rates
- Dead stock identification

**Movement Reports:**
- Inventory changes over time
- Supplier performance
- Seasonal trends
- Reorder recommendations

### Customer Analytics

**Customer Insights:**
- New vs. returning customers
- Customer acquisition costs
- Geographic distribution
- Purchase behavior patterns

**Engagement Metrics:**
- Email open rates
- Website engagement
- Cart abandonment rates
- Customer support interactions

## System Administration

### User Management

**Admin Users:**
- Create new admin accounts
- Assign roles and permissions
- Monitor admin activity
- Deactivate accounts when needed

**Role-Based Access:**
- **Super Admin**: Full system access
- **Admin**: Most administrative functions
- **Staff**: Limited product and order management
- **Support**: Customer service functions only

### System Settings

**General Settings:**
- Site name and description
- Contact information
- Business hours
- Currency and language settings

**Payment Settings:**
- Stripe configuration
- Payment method availability
- Tax calculation settings
- Shipping rate configuration

**Email Settings:**
- SMTP configuration
- Email templates
- Notification preferences
- Automated email schedules

### Security Management

**Security Monitoring:**
- Failed login attempts
- Suspicious activity alerts
- IP blocking and whitelisting
- Two-factor authentication setup

**Data Protection:**
- Customer data encryption
- PCI compliance monitoring
- Regular security audits
- Backup verification

## Troubleshooting

### Common Issues

**Payment Problems:**
1. **Check Stripe Dashboard** for failed payments
2. **Verify webhook configuration** is working
3. **Review payment logs** for error details
4. **Contact customer** if payment method issues

**Inventory Discrepancies:**
1. **Check inventory movements** for recent changes
2. **Verify order processing** didn't miss updates
3. **Review manual adjustments** for errors
4. **Reconcile with physical inventory** if needed

**Email Delivery Issues:**
1. **Check email queue** for pending messages
2. **Verify AWS SES configuration** and limits
3. **Review bounce and complaint rates**
4. **Test email templates** for formatting issues

### Performance Monitoring

**System Health:**
- Monitor response times
- Check error rates
- Review resource usage
- Verify backup completion

**Database Performance:**
- Query performance analysis
- Connection pool monitoring
- Index optimization
- Storage usage tracking

## Best Practices

### Daily Tasks

- **Review new orders** and process promptly
- **Check inventory levels** and reorder as needed
- **Monitor system alerts** and resolve issues
- **Review customer feedback** and respond appropriately

### Weekly Tasks

- **Analyze sales performance** and trends
- **Review marketing campaign** effectiveness
- **Update product information** as needed
- **Check system backups** and security logs

### Monthly Tasks

- **Generate comprehensive reports** for stakeholders
- **Review and update** coupon strategies
- **Analyze customer feedback** for improvements
- **Plan inventory** for upcoming seasons

## Support and Resources

### Getting Help

- **Technical Issues**: Contact IT support at [email]
- **Business Questions**: Contact management at [email]
- **Training Requests**: Schedule sessions with [contact]

### Documentation

- [API Documentation](./API_DOCUMENTATION.md)
- [Deployment Guide](./DEPLOYMENT_GUIDE.md)
- [Security Guidelines](./SECURITY_GUIDELINES.md)
- [Troubleshooting Guide](./TROUBLESHOOTING.md)

### Training Resources

- Video tutorials available in admin dashboard
- Regular training sessions scheduled monthly
- Best practices documentation updated quarterly
- Community forum for admin users

## Appendix

### Keyboard Shortcuts

- `Ctrl + S`: Save current form
- `Ctrl + N`: Create new item (context-dependent)
- `Ctrl + F`: Search within current page
- `Esc`: Close modal dialogs

### Status Codes Reference

**Order Status Codes:**
- `PENDING`: Awaiting payment
- `CONFIRMED`: Payment received
- `PROCESSING`: Being prepared
- `SHIPPED`: Dispatched
- `DELIVERED`: Completed
- `CANCELLED`: Cancelled
- `REFUNDED`: Refunded

**Product Status Codes:**
- `DRAFT`: Not published
- `PENDING`: Awaiting approval
- `APPROVED`: Live and visible
- `ARCHIVED`: Hidden but not deleted
- `REJECTED`: Approval denied