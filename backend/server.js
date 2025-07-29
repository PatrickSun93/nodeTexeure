const express = require('express');
const cors = require('cors');
const path = require('path');
const LoggingMiddleware = require('./middleware/loggingMiddleware');

const app = express();
const PORT = process.env.PORT || 6666;

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'], // Frontend URLs
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Comprehensive logging middleware
app.use(LoggingMiddleware.middleware());



// Import routes
const statusRoutes = require('./routes/statusRoutes');
const databaseRoutes = require('./routes/databaseRoutes');
const userRoutes = require('./routes/userRoutes');

// Routes
// Status routes (health, hello)
app.use('/api/status', statusRoutes);

// Database routes (connection testing, data retrieval)
app.use('/api/database', databaseRoutes);

// User routes
app.use('/api/users', userRoutes);

// Product routes
app.use('/api/products', require('./routes/productRoutes'));

// Cart routes
app.use('/api/cart', require('./routes/cartRoutes'));

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
  res.status(404).json({ 
    error: 'Endpoint not found',
    path: req.originalUrl,
    timestamp: new Date().toISOString()
  });
});

// Logging error middleware (logs errors before handling them)
app.use(LoggingMiddleware.errorMiddleware());

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Backend server running on http://localhost:${PORT}`);
  console.log(`📡 API endpoints available at http://localhost:${PORT}/api`);
  console.log(`🔗 Frontend should connect from http://localhost:3000`);
  console.log(`✅ Server ready to accept connections`);
});

module.exports = app;