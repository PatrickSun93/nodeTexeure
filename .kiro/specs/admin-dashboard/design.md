# Admin Dashboard Design Document

## Overview

The admin dashboard will be a comprehensive web-based interface built as a separate Next.js application that provides authorized staff and administrators with powerful tools to manage all aspects of the bed texture e-commerce platform. The dashboard will integrate with the existing backend API infrastructure and provide real-time insights, management capabilities, and administrative functions.

## Architecture

### Integration with Existing Codebase

The admin dashboard will be built as an extension of the existing e-commerce platform, following established patterns and conventions:

**API Integration:**
- Use existing `ResponseFormatter` utility for consistent API responses
- Follow existing route structure and middleware patterns
- Leverage existing authentication middleware with enhanced admin permissions
- Use existing database connection and query patterns

**Frontend Patterns:**
- Follow existing Next.js App Router structure
- Use same Tailwind CSS classes and styling patterns
- Implement same error handling and loading states
- Use existing API calling patterns and response handling

**Database Integration:**
- Extend existing MySQL schema with admin-specific views
- Use existing database utility functions and connection management
- Follow existing transaction patterns and error handling
- Leverage existing audit logging and security measures

### High-Level Architecture

```mermaid
graph TB
    A[Admin Dashboard Frontend] --> B[Authentication Layer]
    B --> C[Backend API Gateway]
    C --> D[Existing Backend Services]
    
    D --> E[Database Layer]
    D --> F[External Services]
    
    E --> G[MySQL Database]
    F --> H[Stripe API]
    F --> I[FedEx API]
    F --> J[AWS SES]
    
    A --> K[Real-time Updates]
    K --> L[WebSocket Connection]
    L --> C
```

### Technology Stack

**Frontend:**
- **Framework:** Next.js 14+ with App Router (following existing frontend patterns)
- **UI Library:** Tailwind CSS (consistent with existing styles)
- **State Management:** React hooks and context (following existing patterns)
- **Charts/Analytics:** ECharts for data visualization and interactive charts
- **API Communication:** Same fetch patterns and response formatting as existing frontend
- **Authentication:** JWT tokens with HttpOnly cookies (using existing auth system)

**Backend Integration:**
- **Framework:** Node.js with Express.js (extending existing backend)
- **API Routes:** New admin routes following existing route structure and patterns
- **Authentication:** Existing auth middleware with enhanced admin permissions
- **Database:** MySQL with existing database connection and query patterns
- **Response Format:** Same ResponseFormatter utility for consistent API responses
- **File Upload:** Integration with existing image service and upload patterns

### Security Architecture

- **Authentication:** Multi-factor authentication for admin accounts
- **Authorization:** Role-based permissions (admin, staff, manager)
- **Session Management:** Secure session handling with automatic timeout
- **CSRF Protection:** Token-based CSRF protection for all admin actions
- **Audit Logging:** Comprehensive logging of all administrative actions
- **IP Restrictions:** Optional IP whitelisting for admin access

## Components and Interfaces

### 1. Authentication System

#### Login Component
```javascript
// AdminLogin.jsx
- Multi-step authentication (username/password + 2FA)
- Remember device functionality
- Password strength requirements
- Account lockout after failed attempts
- Integration with existing auth middleware
```

#### Role Management
- **Admin:** Full system access
- **Manager:** Product and order management
- **Staff:** Limited product and customer support access
- **Viewer:** Read-only access to reports and analytics

### 2. Dashboard Overview

#### Main Dashboard Component
```javascript
// DashboardOverview.jsx
- Real-time KPI widgets (sales, orders, customers)
- ECharts integration for revenue trends and analytics
- Quick action buttons for common tasks
- System health indicators
- Recent activity feed
- Uses existing API patterns and ResponseFormatter
```

#### KPI Widgets
- **Sales Metrics:** Today/Week/Month revenue, conversion rates
- **Order Metrics:** Order count, average order value, fulfillment status
- **Inventory Alerts:** Low stock warnings, out-of-stock items
- **Customer Metrics:** New registrations, active users, support tickets

### 3. Product Management Interface

#### Product List Component
```javascript
// ProductList.jsx
- Searchable and filterable product grid/list view
- Bulk operations (price updates, status changes)
- Quick edit inline functionality
- Image thumbnail previews
- Status indicators (draft, pending, approved)
```

#### Product Editor
```javascript
// ProductEditor.jsx
- Rich text editor for descriptions
- Multi-image upload with drag-and-drop
- Variant management (size, color, pricing)
- SEO optimization fields
- Approval workflow integration
```

#### Bulk Operations
- CSV import/export functionality
- Batch price updates
- Category reassignment
- Status changes for multiple products

### 4. Order Management System

#### Order Dashboard
```javascript
// OrderDashboard.jsx
- Order pipeline view (pending → shipped → delivered)
- Advanced filtering (date, status, customer, amount)
- Bulk status updates
- Export functionality for accounting
```

#### Order Details
```javascript
// OrderDetails.jsx
- Complete order information display
- Customer communication history
- Payment and refund management
- Shipping label generation
- Return processing interface
```

### 5. Customer Management

#### Customer List
```javascript
// CustomerList.jsx
- Searchable customer database
- Customer segmentation tools
- Lifetime value calculations
- Communication history
```

#### Customer Profile
```javascript
// CustomerProfile.jsx
- Complete customer information
- Order history and analytics
- Support ticket management
- Account status controls
```

### 6. Inventory Management

#### Inventory Dashboard
```javascript
// InventoryDashboard.jsx
- Real-time stock levels
- Low stock alerts with reorder suggestions
- Inventory movement tracking
- Supplier management
```

#### Stock Management
```javascript
// StockManagement.jsx
- Manual stock adjustments
- Purchase order generation
- Inventory valuation reports
- Movement history and audit trail
```

### 7. Analytics and Reporting

#### Analytics Dashboard with ECharts
```javascript
// AnalyticsDashboard.jsx
import * as echarts from 'echarts';

// Revenue Trend Chart
const revenueChartOptions = {
  title: { text: 'Revenue Trend' },
  tooltip: { trigger: 'axis' },
  xAxis: { type: 'category', data: ['Jan', 'Feb', 'Mar', ...] },
  yAxis: { type: 'value' },
  series: [{
    name: 'Revenue',
    type: 'line',
    data: [1200, 1900, 3000, ...]
  }]
};

// Order Status Distribution (Pie Chart)
const orderStatusOptions = {
  title: { text: 'Order Status Distribution' },
  tooltip: { trigger: 'item' },
  series: [{
    type: 'pie',
    radius: '50%',
    data: [
      { value: 45, name: 'Pending' },
      { value: 123, name: 'Confirmed' },
      { value: 89, name: 'Shipped' }
    ]
  }]
};

// Top Products Bar Chart
const topProductsOptions = {
  title: { text: 'Top Selling Products' },
  tooltip: { trigger: 'axis' },
  xAxis: { type: 'category', data: ['Product A', 'Product B', ...] },
  yAxis: { type: 'value' },
  series: [{
    type: 'bar',
    data: [120, 200, 150, ...]
  }]
};
```

#### Report Generator
- **Sales Reports:** Revenue, profit margins, tax summaries (ECharts line/bar charts)
- **Inventory Reports:** Turnover, aging, valuation (ECharts heatmaps and gauges)
- **Customer Reports:** Acquisition, retention, lifetime value (ECharts funnel and scatter plots)
- **Financial Reports:** Payment processing, refunds, fees (ECharts pie and area charts)

### 8. System Configuration

#### Settings Panel
```javascript
// SystemSettings.jsx
- Site configuration (name, logo, contact info)
- Payment gateway settings
- Shipping and tax configuration
- Email template management
```

#### User Management
```javascript
// UserManagement.jsx
- Admin user creation and management
- Role assignment and permissions
- Session monitoring and control
- Password policy enforcement
```

## Data Models

### API Response Format (Following Existing Patterns)

All admin API endpoints will use the existing `ResponseFormatter` utility:

```javascript
// Success Response (following existing pattern)
{
  success: true,
  message: "Dashboard data retrieved successfully",
  data: {
    metrics: { ... },
    charts: { ... }
  },
  keyValueTable: {
    timestamp: "2025-01-15T10:30:00Z",
    userId: "USER0000000001"
  }
}

// Error Response (following existing pattern)
{
  success: false,
  message: "Access denied",
  data: null,
  keyValueTable: {
    error: "Insufficient permissions",
    userId: "USER0000000001",
    requiredRole: "admin"
  }
}
```

### Database Query Patterns

Following existing database utility patterns:

```javascript
// Using existing database connection and query patterns
const db = require('../utils/database');

// Example admin analytics query following existing patterns
const getDashboardMetrics = async (dateRange) => {
  const query = `
    SELECT 
      COUNT(*) as total_orders,
      SUM(total_amount) as total_revenue,
      AVG(total_amount) as avg_order_value
    FROM orders 
    WHERE created_at BETWEEN ? AND ?
    AND status NOT IN ('cancelled', 'refunded')
  `;
  
  const results = await db.query(query, [dateRange.start, dateRange.end]);
  return results[0];
};
```

### Admin User Model
```javascript
{
  id: "USER0000000001",
  email: "admin@bedtexture.com",
  role: "admin", // admin, manager, staff, viewer
  permissions: ["products.read", "products.write", "orders.manage"],
  lastLogin: "2025-01-15T10:30:00Z",
  mfaEnabled: true,
  ipRestrictions: ["192.168.1.0/24"]
}
```

### Dashboard Analytics Model
```javascript
{
  period: "today", // today, week, month, custom
  metrics: {
    revenue: { current: 15420.50, previous: 12350.00, change: 24.8 },
    orders: { current: 45, previous: 38, change: 18.4 },
    customers: { current: 12, previous: 8, change: 50.0 },
    conversion: { current: 3.2, previous: 2.8, change: 14.3 }
  },
  charts: {
    salesTrend: [...], // Time series data
    topProducts: [...], // Product performance
    customerSegments: [...] // Customer analytics
  }
}
```

### Product Management Model
```javascript
{
  filters: {
    status: ["draft", "pending", "approved"],
    category: "CAT001",
    priceRange: { min: 0, max: 1000 },
    stockLevel: "low" // all, low, out-of-stock
  },
  sorting: { field: "created_at", direction: "desc" },
  pagination: { page: 1, limit: 50, total: 1250 }
}
```

## Error Handling

### Frontend Error Handling
- **Network Errors:** Retry mechanisms with exponential backoff
- **Validation Errors:** Real-time form validation with clear error messages
- **Permission Errors:** Graceful degradation with appropriate messaging
- **Session Expiry:** Automatic redirect to login with session restoration

### Backend Error Handling
- **Database Errors:** Transaction rollback and error logging
- **External API Errors:** Fallback mechanisms and user notification
- **File Upload Errors:** Progress tracking and error recovery
- **Rate Limiting:** Queue management and user feedback

### Error Logging and Monitoring
```javascript
// Error tracking integration
{
  errorId: "ERR_2025_001",
  timestamp: "2025-01-15T10:30:00Z",
  userId: "USER0000000001",
  action: "product.update",
  error: "Database connection timeout",
  context: { productId: "PROD0000000123", operation: "image_upload" },
  severity: "high"
}
```

## Testing Strategy

### Unit Testing
- **Component Testing:** React Testing Library for UI components
- **Service Testing:** Jest for business logic and API integration
- **Utility Testing:** Pure function testing for calculations and formatting

### Integration Testing
- **API Integration:** Test admin endpoints with different user roles
- **Database Integration:** Test complex queries and transactions
- **External Service Integration:** Mock external APIs (Stripe, FedEx)

### End-to-End Testing
- **User Workflows:** Complete admin tasks from login to completion
- **Cross-browser Testing:** Ensure compatibility across modern browsers
- **Performance Testing:** Load testing for dashboard with large datasets

### Security Testing
- **Authentication Testing:** Test login, session management, and permissions
- **Authorization Testing:** Verify role-based access controls
- **Input Validation:** Test for XSS, SQL injection, and other vulnerabilities
- **Session Security:** Test session timeout and concurrent session handling

## Performance Considerations

### Frontend Optimization
- **Code Splitting:** Lazy load dashboard sections
- **Caching:** Implement intelligent caching for frequently accessed data
- **Virtual Scrolling:** Handle large datasets efficiently
- **Image Optimization:** Lazy loading and responsive images

### Backend Optimization
- **Database Indexing:** Optimize queries for admin operations
- **Caching Layer:** Redis for frequently accessed admin data
- **Pagination:** Efficient pagination for large datasets
- **Background Jobs:** Queue heavy operations (bulk updates, reports)

### Data Updates
- **Polling Strategy:** Regular API polling for dashboard updates (following existing patterns)
- **Selective Updates:** Only fetch changed data to minimize server load
- **Caching:** Client-side caching of frequently accessed data

## Deployment and Infrastructure

### Development Environment
- **Local Development:** Docker Compose setup with hot reloading
- **Environment Variables:** Separate config for admin-specific settings
- **Database Seeding:** Admin user creation and test data

### Production Deployment
- **Separate Subdomain:** admin.bedtexture.com for admin interface
- **SSL/TLS:** Enhanced security for admin access
- **CDN Integration:** Static asset optimization
- **Monitoring:** Application performance and error tracking

### Security Hardening
- **IP Whitelisting:** Restrict admin access to specific IP ranges
- **VPN Requirements:** Optional VPN access for enhanced security
- **Regular Security Audits:** Automated vulnerability scanning
- **Backup and Recovery:** Regular backups with disaster recovery procedures