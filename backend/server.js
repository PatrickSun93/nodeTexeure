const express = require('express');
const cors = require('cors');
const path = require('path');
// Load environment variables early so downstream modules (e.g., encryption) see them
require('dotenv').config({ path: path.join(__dirname, '.env') });

const cookieParser = require('cookie-parser');
const LoggingMiddleware = require('./middleware/loggingMiddleware');
const PerformanceMiddleware = require('./middleware/performanceMiddleware');
const ResponseFormatter = require('./utils/responseFormatter');
const { basicSecurity, enhancedSecurity, adminSecurity } = require('./middleware/securityMiddleware');
const { validatePciEnvironment } = require('./middleware/pciComplianceMiddleware');
const secureEnv = require('./utils/secureEnv');
const sslConfig = require('./utils/sslConfig');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 6666;

// Validate PCI compliance and environment security on startup
try {
  validatePciEnvironment();
  logger.info('PCI compliance and environment validation passed');
} catch (error) {
  logger.error('Startup validation failed', { error: error.message });
  if (process.env.NODE_ENV === 'production') {
    process.exit(1); // Fail hard in production
  }
}

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-CSRF-Token']
}));

// Apply basic security middleware to all routes
app.use(basicSecurity);

// Performance optimization middleware
app.use(PerformanceMiddleware.compression());
app.use(PerformanceMiddleware.requestTiming());
app.use(PerformanceMiddleware.memoryMonitoring());
app.use(PerformanceMiddleware.connectionPooling());
app.use(PerformanceMiddleware.responseOptimization());
app.use(PerformanceMiddleware.requestSizeLimit({ maxSize: 10 * 1024 * 1024 })); // 10MB limit

app.use(express.json({ limit: '10mb' })); // Set JSON payload limit
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // Set URL-encoded payload limit
app.use(cookieParser());

// Comprehensive logging middleware
app.use(LoggingMiddleware.middleware());

// Static file serving for uploaded assets
// Ensure the uploads directory exists before serving
const fs = require('fs');
const uploadsRoot = path.join(__dirname, 'uploads');
const productUploads = path.join(uploadsRoot, 'products');
try {
  fs.mkdirSync(productUploads, { recursive: true });
} catch (e) {
  console.error('Failed to ensure uploads directory exists:', e);
}
// Serve /uploads/* as static assets
app.use('/uploads', express.static(uploadsRoot, { index: false, maxAge: '1d' }));



// Import middleware and routes
const { protect, admin } = require('./middleware/authMiddleware');
const statusRoutes = require('./routes/statusRoutes');
const databaseRoutes = require('./routes/databaseRoutes');
const userRoutes = require('./routes/userRoutes');
const systemSettingsRoutes = require('./routes/systemSettingsRoutes');

// Routes
// Status routes (health, hello)
app.use('/api/status', statusRoutes);

// Database routes (connection testing, data retrieval)
app.use('/api/database', databaseRoutes);

// User routes
app.use('/api/users', userRoutes);

// Admin routes (with enhanced security)
const adminRoutes = require('./routes/adminRoutes');
app.use('/api/admin', enhancedSecurity, adminRoutes);

// Admin product routes (with enhanced security)
const adminProductRoutes = require('./routes/adminProductRoutes');
app.use('/api/admin/products', enhancedSecurity, adminProductRoutes);

// Admin order routes (with enhanced security)
const adminOrderRoutes = require('./routes/adminOrderRoutes');
app.use('/api/admin/orders', enhancedSecurity, adminOrderRoutes);

// Admin customer routes (with enhanced security)
const adminCustomerRoutes = require('./routes/adminCustomerRoutes');
app.use('/api/admin', enhancedSecurity, adminCustomerRoutes);

// Admin inventory routes (with enhanced security)
const adminInventoryRoutes = require('./routes/adminInventoryRoutes');
app.use('/api/admin/inventory', enhancedSecurity, adminInventoryRoutes);

// Dashboard routes (admin only with enhanced security)
const dashboardRoutes = require('./routes/dashboardRoutes');
app.use('/api/dashboard', enhancedSecurity, dashboardRoutes);

// Admin reports routes (with enhanced security)
const adminReportsRoutes = require('./routes/adminReportsRoutes');
app.use('/api/admin/reports', enhancedSecurity, adminReportsRoutes);

// System settings routes
app.use('/api/settings', systemSettingsRoutes);

// Product routes
app.use('/api/products', require('./routes/productRoutes'));

// Cart routes
app.use('/api/cart', require('./routes/cartRoutes'));

// Order routes
app.use('/api/orders', require('./routes/orderRoutes'));


// Image routes (protected with enhanced security)
const imageRoutes = require('./routes/imageRoutes');
app.use('/api/images', enhancedSecurity, protect, admin, imageRoutes);

// Inventory routes
const inventoryRoutes = require('./routes/inventoryRoutes');
app.use('/api/inventory', inventoryRoutes);

// Payment routes (with enhanced security)
const paymentRoutes = require('./routes/paymentRoutes');
app.use('/api/payments', enhancedSecurity, paymentRoutes);

// Email routes
const emailRoutes = require('./routes/emailRoutes');
app.use('/api/emails', emailRoutes);

// Abandoned cart routes
const abandonedCartRoutes = require('./routes/abandonedCartRoutes');
app.use('/api/abandoned-cart', abandonedCartRoutes);

// Shipping routes
const shippingRoutes = require('./routes/shippingRoutes');
app.use('/api/shipping', shippingRoutes);

// Tax routes
const taxRoutes = require('./routes/taxRoutes');
app.use('/api/tax', taxRoutes);

// FedEx routes
const fedexRoutes = require('./routes/fedexRoutes');
app.use('/api/fedex', fedexRoutes);

// Coupon routes
const couponRoutes = require('./routes/couponRoutes');
app.use('/api/coupons', couponRoutes);

// Currency routes
const currencyRoutes = require('./routes/currencyRoutes');
app.use('/api/currency', currencyRoutes);

// Search routes
const searchRoutes = require('./routes/searchRoutes');
app.use('/api/search', searchRoutes);

// Session management routes (with enhanced security)
const sessionRoutes = require('./routes/sessionRoutes');
app.use('/api/sessions', sessionRoutes);

// Performance monitoring routes (admin only)
const performanceRoutes = require('./routes/performanceRoutes');
app.use('/api/performance', performanceRoutes);

// Backward compatibility - redirect old endpoints to new structure
app.get('/api/health', (req, res) => {
  res.redirect(301, '/api/status/health');
});

app.get('/api/hello', (req, res) => {
  res.redirect(301, '/api/status/hello');
});

app.post('/api/hello', (req, res) => {
  res.redirect(307, '/api/status/hello');
});



// 404 handler
app.use('*', (req, res) => {
  const keyValueTable = { 
    path: req.originalUrl,
    timestamp: new Date().toISOString()
  };
  res.status(404).json(ResponseFormatter.failure('Endpoint not found', keyValueTable));
});

// Logging error middleware (logs errors before handling them)
app.use(LoggingMiddleware.errorMiddleware());

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  const keyValueTable = { 
    timestamp: new Date().toISOString(),
    error: err.message || 'Internal server error'
  };
  res.status(500).json(ResponseFormatter.failure('Internal server error', keyValueTable));
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Backend server running on http://localhost:${PORT}`);
  console.log(`📡 API endpoints available at http://localhost:${PORT}/api`);
  console.log(`✅ Server ready to accept connections`);
});

module.exports = app;