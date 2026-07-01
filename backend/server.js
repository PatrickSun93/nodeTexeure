const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const cookieParser = require('cookie-parser');
const LoggingMiddleware = require('./middleware/loggingMiddleware');
const ResponseFormatter = require('./utils/responseFormatter');

const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 6666;

// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // API server, CSP not needed for JSON responses
  crossOriginEmbedderPolicy: false, // Allow cross-origin for image serving
}));

// Global rate limiter for all API routes (configurable via RATE_LIMIT_* env vars)
const globalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'FAIL', message: 'Too many requests, please try again later' },
});
app.use('/api', globalLimiter);

// CORS - use env-based origins in production
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
  : ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:3005'];

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-CSRF-Token']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
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

// System settings routes
app.use('/api/settings', systemSettingsRoutes);

// Product routes
app.use('/api/products', require('./routes/productRoutes'));

// Cart routes
app.use('/api/cart', require('./routes/cartRoutes'));

// Order routes
app.use('/api/orders', require('./routes/orderRoutes'));

// Search routes (public - autocomplete, suggestions)
app.use('/api/search', require('./routes/searchRoutes'));

// Review routes
app.use('/api/reviews', require('./routes/reviewRoutes'));

// Analytics routes (admin only - protected in routes file)
app.use('/api/admin/analytics', require('./routes/analyticsRoutes'));

// Bulk operations routes (admin only)
app.use('/api/admin/bulk', protect, admin, require('./routes/bulkOperationsRoutes'));

// Email Template routes (protected admin)
app.use('/api/admin/email-templates', protect, admin, require('./routes/emailTemplateRoutes'));

// Admin routes (protected)
const adminRoutes = require('./routes/adminRoutes');
app.use('/api/admin', protect, admin, adminRoutes);

// Payment routes (Stripe)
app.use('/api/payments', require('./routes/paymentRoutes'));

// Image upload routes (S3)
app.use('/api/images', require('./routes/imageRoutes'));

// Shipping routes (FedEx)
app.use('/api/shipping', require('./routes/shippingRoutes'));

// Wishlist routes
app.use('/api/wishlist', require('./routes/wishlistRoutes'));

// Return/RMA routes
app.use('/api/returns', require('./routes/returnRoutes'));

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

// Error handler - never leak internal errors to clients
app.use((err, req, res, next) => {
  console.error('Error:', err);
  const isProd = process.env.NODE_ENV === 'production';
  const keyValueTable = {
    timestamp: new Date().toISOString(),
    error: isProd ? 'Internal server error' : (err.message || 'Internal server error'),
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