const ResponseFormatter = require('../utils/responseFormatter');

/**
 * Input Validation and Sanitization Middleware
 * 
 * Provides comprehensive input validation, sanitization, and security checks
 * to prevent XSS, SQL injection, and other security vulnerabilities.
 */

/**
 * HTML entities to escape for XSS prevention
 */
const HTML_ENTITIES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;'
};

/**
 * Escape HTML entities to prevent XSS attacks
 */
const escapeHtml = (str) => {
  if (typeof str !== 'string') return str;
  return str.replace(/[&<>"'\/]/g, (s) => HTML_ENTITIES[s]);
};

/**
 * Remove potentially dangerous SQL injection patterns
 */
const sanitizeSql = (str) => {
  if (typeof str !== 'string') return str;
  
  // Remove common SQL injection patterns
  const sqlPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION|SCRIPT)\b)/gi,
    /(--|\/\*|\*\/|;|'|"|`)/g,
    /(\bOR\b|\bAND\b)\s+\d+\s*=\s*\d+/gi,
    /(\bOR\b|\bAND\b)\s+['"].*['"].*=/gi
  ];
  
  let sanitized = str;
  sqlPatterns.forEach(pattern => {
    sanitized = sanitized.replace(pattern, '');
  });
  
  return sanitized.trim();
};

/**
 * Validate email format
 */
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate password strength
 */
const isValidPassword = (password) => {
  if (typeof password !== 'string' || password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters long' };
  }
  
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  
  if (!hasUpperCase) {
    return { valid: false, message: 'Password must contain at least one uppercase letter' };
  }
  
  if (!hasLowerCase) {
    return { valid: false, message: 'Password must contain at least one lowercase letter' };
  }
  
  if (!hasNumbers) {
    return { valid: false, message: 'Password must contain at least one number' };
  }
  
  if (!hasSpecialChar) {
    return { valid: false, message: 'Password must contain at least one special character' };
  }
  
  return { valid: true };
};

/**
 * Validate phone number format
 */
const isValidPhone = (phone) => {
  const phoneRegex = /^\+?[\d\s\-\(\)]{10,}$/;
  return phoneRegex.test(phone);
};

/**
 * Validate URL format
 */
const isValidUrl = (url) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

/**
 * Sanitize object recursively
 */
const sanitizeObject = (obj, options = {}) => {
  if (obj === null || obj === undefined) return obj;
  
  const {
    escapeHtml: shouldEscapeHtml = true,
    sanitizeSql: shouldSanitizeSql = true,
    maxStringLength = 10000,
    maxDepth = 10,
    currentDepth = 0
  } = options;
  
  // Prevent deep recursion
  if (currentDepth > maxDepth) {
    return '[MAX_DEPTH_EXCEEDED]';
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, { ...options, currentDepth: currentDepth + 1 }));
  }
  
  if (typeof obj === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      const sanitizedKey = sanitizeString(key, options);
      sanitized[sanitizedKey] = sanitizeObject(value, { ...options, currentDepth: currentDepth + 1 });
    }
    return sanitized;
  }
  
  if (typeof obj === 'string') {
    return sanitizeString(obj, options);
  }
  
  return obj;
};

/**
 * Sanitize string value
 */
const sanitizeString = (str, options = {}) => {
  if (typeof str !== 'string') return str;
  
  const {
    escapeHtml: shouldEscapeHtml = true,
    sanitizeSql: shouldSanitizeSql = true,
    maxStringLength = 10000
  } = options;
  
  let sanitized = str;
  
  // Truncate if too long
  if (sanitized.length > maxStringLength) {
    sanitized = sanitized.substring(0, maxStringLength);
  }
  
  // Remove null bytes and control characters
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  
  // Sanitize SQL if enabled
  if (shouldSanitizeSql) {
    sanitized = sanitizeSql(sanitized);
  }
  
  // Escape HTML if enabled
  if (shouldEscapeHtml) {
    sanitized = escapeHtml(sanitized);
  }
  
  return sanitized;
};

/**
 * Validation schemas for different endpoints
 */
const validationSchemas = {
  userRegistration: {
    email: { required: true, type: 'email' },
    password: { required: true, type: 'password' },
    firstName: { required: true, type: 'string', maxLength: 50 },
    lastName: { required: true, type: 'string', maxLength: 50 },
    phone: { required: false, type: 'phone' }
  },
  
  userLogin: {
    email: { required: true, type: 'email' },
    password: { required: true, type: 'string' }
  },
  
  productCreate: {
    name: { required: true, type: 'string', maxLength: 200 },
    description: { required: true, type: 'string', maxLength: 5000 },
    price: { required: true, type: 'number', min: 0 },
    category: { required: true, type: 'string', maxLength: 100 },
    sku: { required: false, type: 'string', maxLength: 50 }
  },
  
  orderCreate: {
    items: { required: true, type: 'array' },
    shippingAddress: { required: true, type: 'object' },
    billingAddress: { required: false, type: 'object' },
    paymentMethod: { required: true, type: 'string' }
  },
  
  couponCreate: {
    code: { required: true, type: 'string', maxLength: 50 },
    type: { required: true, type: 'string', enum: ['percentage', 'fixed', 'free_shipping'] },
    value: { required: true, type: 'number', min: 0 },
    expiresAt: { required: false, type: 'date' },
    usageLimit: { required: false, type: 'number', min: 1 }
  }
};

/**
 * Validate field based on schema
 */
const validateField = (value, fieldSchema, fieldName) => {
  const errors = [];
  
  // Check required fields
  if (fieldSchema.required && (value === undefined || value === null || value === '')) {
    errors.push(`${fieldName} is required`);
    return errors;
  }
  
  // Skip validation if field is not required and empty
  if (!fieldSchema.required && (value === undefined || value === null || value === '')) {
    return errors;
  }
  
  // Type validation
  switch (fieldSchema.type) {
    case 'email':
      if (!isValidEmail(value)) {
        errors.push(`${fieldName} must be a valid email address`);
      }
      break;
      
    case 'password':
      const passwordValidation = isValidPassword(value);
      if (!passwordValidation.valid) {
        errors.push(`${fieldName}: ${passwordValidation.message}`);
      }
      break;
      
    case 'phone':
      if (!isValidPhone(value)) {
        errors.push(`${fieldName} must be a valid phone number`);
      }
      break;
      
    case 'url':
      if (!isValidUrl(value)) {
        errors.push(`${fieldName} must be a valid URL`);
      }
      break;
      
    case 'string':
      if (typeof value !== 'string') {
        errors.push(`${fieldName} must be a string`);
      }
      break;
      
    case 'number':
      if (typeof value !== 'number' || isNaN(value)) {
        errors.push(`${fieldName} must be a valid number`);
      }
      break;
      
    case 'array':
      if (!Array.isArray(value)) {
        errors.push(`${fieldName} must be an array`);
      }
      break;
      
    case 'object':
      if (typeof value !== 'object' || Array.isArray(value)) {
        errors.push(`${fieldName} must be an object`);
      }
      break;
      
    case 'date':
      if (!(value instanceof Date) && !Date.parse(value)) {
        errors.push(`${fieldName} must be a valid date`);
      }
      break;
  }
  
  // Length validation
  if (fieldSchema.maxLength && typeof value === 'string' && value.length > fieldSchema.maxLength) {
    errors.push(`${fieldName} must not exceed ${fieldSchema.maxLength} characters`);
  }
  
  if (fieldSchema.minLength && typeof value === 'string' && value.length < fieldSchema.minLength) {
    errors.push(`${fieldName} must be at least ${fieldSchema.minLength} characters`);
  }
  
  // Number range validation
  if (fieldSchema.min !== undefined && typeof value === 'number' && value < fieldSchema.min) {
    errors.push(`${fieldName} must be at least ${fieldSchema.min}`);
  }
  
  if (fieldSchema.max !== undefined && typeof value === 'number' && value > fieldSchema.max) {
    errors.push(`${fieldName} must not exceed ${fieldSchema.max}`);
  }
  
  // Enum validation
  if (fieldSchema.enum && !fieldSchema.enum.includes(value)) {
    errors.push(`${fieldName} must be one of: ${fieldSchema.enum.join(', ')}`);
  }
  
  return errors;
};

/**
 * Main validation middleware factory
 */
const validateInput = (schemaName) => {
  return (req, res, next) => {
    const schema = validationSchemas[schemaName];
    if (!schema) {
      console.error(`Validation schema '${schemaName}' not found`);
      return next();
    }
    
    const errors = [];
    
    // Validate each field in the schema
    for (const [fieldName, fieldSchema] of Object.entries(schema)) {
      const value = req.body[fieldName];
      const fieldErrors = validateField(value, fieldSchema, fieldName);
      errors.push(...fieldErrors);
    }
    
    // If there are validation errors, return them
    if (errors.length > 0) {
      const keyValueTable = { 
        validationErrors: errors,
        receivedFields: Object.keys(req.body)
      };
      return res.status(400).json(
        ResponseFormatter.failure('Validation failed', keyValueTable)
      );
    }
    
    next();
  };
};

/**
 * General input sanitization middleware
 */
const sanitizeInput = (options = {}) => {
  return (req, res, next) => {
    try {
      // Sanitize request body
      if (req.body) {
        req.body = sanitizeObject(req.body, options);
      }
      
      // Sanitize query parameters
      if (req.query) {
        req.query = sanitizeObject(req.query, options);
      }
      
      // Sanitize URL parameters
      if (req.params) {
        req.params = sanitizeObject(req.params, options);
      }
      
      next();
    } catch (error) {
      console.error('Input sanitization error:', error);
      const keyValueTable = { error: 'Input sanitization failed' };
      return res.status(400).json(
        ResponseFormatter.failure('Invalid input format', keyValueTable)
      );
    }
  };
};

module.exports = {
  sanitizeInput,
  validateInput,
  validationSchemas,
  escapeHtml,
  sanitizeSql,
  isValidEmail,
  isValidPassword,
  isValidPhone,
  isValidUrl,
  sanitizeObject,
  sanitizeString
};