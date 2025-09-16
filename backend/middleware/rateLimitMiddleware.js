const rateLimit = require('express-rate-limit');
const ResponseFormatter = require('../utils/responseFormatter');

/**
 * Rate Limiting Middleware for API Security
 * 
 * Implements multiple rate limiting strategies:
 * - Global API rate limiting (1000/15min, 10000/hour)
 * - Endpoint-specific rate limiting for sensitive operations
 * - IP-based and user-based rate limiting
 */

/**
 * Custom rate limit handler that uses our response formatter
 */
const rateLimitHandler = (req, res) => {
  const keyValueTable = {
    error: 'Too many requests',
    retryAfter: req.rateLimit.resetTime,
    limit: req.rateLimit.limit,
    remaining: req.rateLimit.remaining
  };
  
  res.status(429).json(
    ResponseFormatter.failure('Rate limit exceeded', keyValueTable)
  );
};

/**
 * Global API rate limiter - applies to all API routes
 * 1000 requests per 15 minutes, 10000 requests per hour
 */
const globalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: rateLimitHandler
});

/**
 * Hourly rate limiter for additional protection
 * 10000 requests per hour
 */
const hourlyRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10000, // Limit each IP to 10000 requests per hour
  message: 'Hourly rate limit exceeded, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler
});

/**
 * Strict rate limiter for authentication endpoints
 * 10 attempts per 15 minutes
 */
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 login attempts per windowMs
  message: 'Too many authentication attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  skipSuccessfulRequests: true // Don't count successful requests
});

/**
 * Admin operation rate limiter
 * 100 requests per 15 minutes for admin operations
 */
const adminRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit admin operations
  message: 'Too many admin requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler
});

/**
 * Payment operation rate limiter
 * 20 payment attempts per hour
 */
const paymentRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // Limit payment attempts
  message: 'Too many payment attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler
});

/**
 * Email operation rate limiter
 * 50 emails per hour
 */
const emailRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // Limit email sending
  message: 'Too many email requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler
});

/**
 * Image upload rate limiter
 * 20 uploads per 15 minutes
 */
const imageUploadRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit image uploads
  message: 'Too many image uploads, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler
});

/**
 * Search rate limiter
 * 200 searches per 15 minutes
 */
const searchRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // Limit search requests
  message: 'Too many search requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler
});

/**
 * Combined rate limiting middleware that applies both 15-minute and hourly limits
 */
const combinedRateLimit = [globalRateLimit, hourlyRateLimit];

module.exports = {
  globalRateLimit,
  hourlyRateLimit,
  combinedRateLimit,
  authRateLimit,
  adminRateLimit,
  paymentRateLimit,
  emailRateLimit,
  imageUploadRateLimit,
  searchRateLimit
};