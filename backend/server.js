const { Sentry } = require('./instrument'); // must load before express
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

// Default-deny env gate: protection is ACTIVE unless we are explicitly in
// development or test. An unset/misconfigured NODE_ENV is treated as production.
const isDev = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';

// Fail fast in production if JWT_SECRET is missing, too short, or a known
// placeholder. The same secret signs auth JWTs and the CSRF HMAC, so a weak or
// guessable value means trivial admin-token forgery. Dev/test may use a local
// placeholder so the stack still boots.
const jwtSecret = process.env.JWT_SECRET || '';
const jwtLooksPlaceholder = /your-super-secret|change[_-]?me|placeholder|example|min-32-chars/i.test(jwtSecret);
if (!isDev && (jwtSecret.length < 32 || jwtLooksPlaceholder)) {
  console.error('FATAL: JWT_SECRET is missing, too short, or a placeholder value. Set a strong, random 32+ character secret before starting in production.');
  process.exit(1);
}

// req.ip — the key of every rate limiter — honours X-Forwarded-For only for the
// TRUST_PROXY hops (default 0: the socket peer). See utils/trustProxy.js.
app.set('trust proxy', require('./utils/trustProxy').parseTrustProxy(process.env.TRUST_PROXY));

// Global rate limiter for all API routes (configurable via RATE_LIMIT_* env vars).
// Enforced everywhere except dev/test (or when DISABLE_RATE_LIMIT=true) so local
// dev, automated tests, and screenshot capture aren't throttled.
const globalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'FAIL', message: 'Too many requests, please try again later' },
  skip: () => isDev || process.env.DISABLE_RATE_LIMIT === 'true',
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
// Stripe needs the raw request body to verify webhook signatures, so the global
// JSON parser must skip the webhook route (paymentRoutes mounts express.raw() on
// it). Every other route is parsed as JSON exactly as before.
app.use((req, res, next) => {
  if (req.originalUrl.startsWith('/api/payments/webhook')) return next();
  return express.json()(req, res, next);
});
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
const { protect, admin, staffOrAdmin } = require('./middleware/authMiddleware');
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

// Journal (editorial blog) routes — public
app.use('/api/journal', require('./routes/journalRoutes'));

// Unsubscribe / email-suppression routes — public (one-click email links)
app.use('/api/unsubscribe', require('./routes/unsubscribeRoutes'));

// Contact form — public (enqueues a support message)
app.use('/api/contact', require('./routes/contactRoutes'));

// Newsletter subscription — public (idempotent signup)
app.use('/api/newsletter', require('./routes/newsletterRoutes'));

// Abandoned-cart recovery — public (token-authorized recovery links)
app.use('/api/abandoned-cart', require('./routes/abandonedCartRoutes'));

// Analytics routes (admin only - protected in routes file)
app.use('/api/admin/analytics', require('./routes/analyticsRoutes'));

// Email queue routes (admin only - protected in routes file)
app.use('/api/admin/email-queue', require('./routes/emailQueueRoutes'));

// Bulk operations routes (admin only)
app.use('/api/admin/bulk', protect, admin, require('./routes/bulkOperationsRoutes'));

// Email Template routes (protected admin)
app.use('/api/admin/email-templates', protect, admin, require('./routes/emailTemplateRoutes'));

// Admin routes (protected). Staff reach only the routes that opt in with
// staffOrAdmin; everything else declares `admin` (see routes/admin/index.js).
app.use('/api/admin', protect, staffOrAdmin, require('./routes/admin'));

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

// Report unhandled errors to Sentry when configured (see instrument.js)
if (Sentry) Sentry.setupExpressErrorHandler(app);

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

// Start server (skipped when required by the test suite, which drives `app` directly)
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Backend server running on http://localhost:${PORT}`);
    console.log(`📡 API endpoints available at http://localhost:${PORT}/api`);
    console.log(`✅ Server ready to accept connections`);
  });

  // Return stock held by abandoned checkouts. Runs under a MySQL named lock
  // shared with the Rust worker, so any number of instances is safe; with
  // BACKGROUND_JOBS=off the worker alone runs it (utils/jobLock.js). Low-stock
  // alerts stay in scripts/cleanup-expired-reservations.js (cron, if wanted).
  const { LOCKS, withJobLock, backgroundJobsEnabled } = require('./utils/jobLock');
  if (backgroundJobsEnabled()) {
    const InventoryService = require('./services/inventoryService');
    const releaseExpired = () => withJobLock(LOCKS.releaseReservations, () => InventoryService.releaseExpiredReservations())
      .then(({ ran, result: r }) => {
        if (!ran) return;
        if (!r.success) console.error('Reservation cleanup failed:', r.error);
        else if (r.data.released_count) console.log(`♻️  Released ${r.data.released_count} expired stock reservation(s)`);
      })
      .catch((err) => console.error('Reservation cleanup failed:', err.message));
    setInterval(releaseExpired, 15 * 60 * 1000).unref();
    releaseExpired();
  } else {
    console.log('⏸️  Background jobs off (BACKGROUND_JOBS=off): the Rust worker runs them');
  }
}

module.exports = app;