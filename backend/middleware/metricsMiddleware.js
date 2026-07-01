const promClient = require('prom-client');

// Create a Registry to register the metrics
const register = new promClient.Registry();

// Add default metrics
promClient.collectDefaultMetrics({
  app: 'ecommerce-backend',
  timeout: 10000,
  gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
  register
});

// Custom metrics
const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10]
});

const httpRequestsTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

const activeConnections = new promClient.Gauge({
  name: 'active_connections',
  help: 'Number of active connections'
});

const paymentFailures = new promClient.Counter({
  name: 'payment_failures_total',
  help: 'Total number of payment failures',
  labelNames: ['error_type']
});

const emailQueueSize = new promClient.Gauge({
  name: 'email_queue_size',
  help: 'Number of emails in queue'
});

const inventoryLowStock = new promClient.Gauge({
  name: 'inventory_low_stock_count',
  help: 'Number of products with low stock'
});

const databaseConnections = new promClient.Gauge({
  name: 'database_connections_active',
  help: 'Number of active database connections'
});

// Register custom metrics
register.registerMetric(httpRequestDuration);
register.registerMetric(httpRequestsTotal);
register.registerMetric(activeConnections);
register.registerMetric(paymentFailures);
register.registerMetric(emailQueueSize);
register.registerMetric(inventoryLowStock);
register.registerMetric(databaseConnections);

// Middleware to collect HTTP metrics
const metricsMiddleware = (req, res, next) => {
  const start = Date.now();
  
  // Increment active connections
  activeConnections.inc();
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route ? req.route.path : req.path;
    
    // Record metrics
    httpRequestDuration
      .labels(req.method, route, res.statusCode)
      .observe(duration);
    
    httpRequestsTotal
      .labels(req.method, route, res.statusCode)
      .inc();
    
    // Decrement active connections
    activeConnections.dec();
  });
  
  next();
};

// Function to update custom metrics
const updateCustomMetrics = async () => {
  try {
    // Update email queue size
    const emailQueue = require('../services/emailQueueService');
    const queueSize = await emailQueue.getQueueSize();
    emailQueueSize.set(queueSize);
    
    // Update low stock count
    const inventoryService = require('../services/inventoryService');
    const lowStockCount = await inventoryService.getLowStockCount();
    inventoryLowStock.set(lowStockCount);
    
    // Update database connections
    const db = require('../utils/database');
    const connectionCount = await db.getActiveConnectionCount();
    databaseConnections.set(connectionCount);
    
  } catch (error) {
    console.error('Error updating custom metrics:', error);
  }
};

// Update custom metrics every 30 seconds
setInterval(updateCustomMetrics, 30000);

module.exports = {
  metricsMiddleware,
  register,
  metrics: {
    httpRequestDuration,
    httpRequestsTotal,
    activeConnections,
    paymentFailures,
    emailQueueSize,
    inventoryLowStock,
    databaseConnections
  }
};