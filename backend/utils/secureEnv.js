/**
 * Secure Environment Variable Manager
 * Handles secure loading and validation of environment variables for PCI compliance
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('./logger');

class SecureEnvManager {
  constructor() {
    this.sensitiveKeys = new Set([
      'DB_PASSWORD',
      'JWT_SECRET',
      'ENCRYPTION_KEY',
      'STRIPE_SECRET_KEY',
      'STRIPE_WEBHOOK_SECRET',
      'AWS_SECRET_ACCESS_KEY',
      'SMTP_PASSWORD',
      'FEDEX_SECRET_KEY',
      'REDIS_PASSWORD',
      'CLOUDINARY_API_SECRET'
    ]);
    
    this.requiredKeys = new Set([
      'DB_HOST',
      'DB_USER',
      'DB_PASSWORD',
      'DB_NAME',
      'JWT_SECRET',
      'ENCRYPTION_KEY'
    ]);
    
    this.validationRules = {
      'JWT_SECRET': { minLength: 32, pattern: /^[A-Za-z0-9+/=]+$/ },
      'ENCRYPTION_KEY': { minLength: 32, complexity: true },
      'DB_PASSWORD': { minLength: 8, complexity: true },
      'STRIPE_SECRET_KEY': { pattern: /^sk_(test_|live_)[a-zA-Z0-9]+$/ },
      'STRIPE_WEBHOOK_SECRET': { pattern: /^whsec_[a-zA-Z0-9]+$/ }
    };
  }

  /**
   * Load and validate environment variables
   * @param {string} envPath - Path to .env file
   * @returns {Object} Validation result
   */
  loadAndValidate(envPath = '.env') {
    try {
      const result = {
        loaded: false,
        valid: false,
        errors: [],
        warnings: [],
        missingRequired: [],
        weakSecrets: [],
        envPath: envPath
      };

      // Check if .env file exists
      if (!fs.existsSync(envPath)) {
        result.errors.push(`Environment file not found: ${envPath}`);
        return result;
      }

      // Load environment variables
      require('dotenv').config({ path: envPath });
      result.loaded = true;

      // Validate required variables
      for (const key of this.requiredKeys) {
        if (!process.env[key]) {
          result.missingRequired.push(key);
          result.errors.push(`Required environment variable missing: ${key}`);
        }
      }

      // Validate sensitive variables
      for (const [key, rules] of Object.entries(this.validationRules)) {
        if (process.env[key]) {
          const validation = this.validateSecret(process.env[key], rules);
          if (!validation.valid) {
            result.weakSecrets.push({
              key,
              issues: validation.issues
            });
            result.warnings.push(`Weak secret for ${key}: ${validation.issues.join(', ')}`);
          }
        }
      }

      // Check for development secrets in production
      if (process.env.NODE_ENV === 'production') {
        const devSecrets = this.checkForDevelopmentSecrets();
        if (devSecrets.length > 0) {
          result.errors.push(`Development secrets detected in production: ${devSecrets.join(', ')}`);
        }
      }

      // Overall validation status
      result.valid = result.errors.length === 0;

      // Log validation results
      if (result.valid) {
        logger.info('Environment variables validated successfully', {
          envPath: this.maskPath(envPath),
          requiredCount: this.requiredKeys.size,
          sensitiveCount: this.sensitiveKeys.size,
          warningCount: result.warnings.length
        });
      } else {
        logger.error('Environment validation failed', {
          envPath: this.maskPath(envPath),
          errorCount: result.errors.length,
          missingRequired: result.missingRequired.length,
          weakSecrets: result.weakSecrets.length
        });
      }

      return result;
    } catch (error) {
      logger.error('Failed to load environment variables', { 
        error: error.message,
        envPath: this.maskPath(envPath)
      });
      
      return {
        loaded: false,
        valid: false,
        errors: [error.message],
        warnings: [],
        missingRequired: [],
        weakSecrets: []
      };
    }
  }

  /**
   * Validate a secret against security rules
   * @param {string} secret - Secret to validate
   * @param {Object} rules - Validation rules
   * @returns {Object} Validation result
   */
  validateSecret(secret, rules) {
    const result = {
      valid: true,
      issues: []
    };

    if (!secret || typeof secret !== 'string') {
      result.valid = false;
      result.issues.push('Secret is empty or not a string');
      return result;
    }

    // Check minimum length
    if (rules.minLength && secret.length < rules.minLength) {
      result.valid = false;
      result.issues.push(`Minimum length ${rules.minLength} required`);
    }

    // Check pattern
    if (rules.pattern && !rules.pattern.test(secret)) {
      result.valid = false;
      result.issues.push('Does not match required pattern');
    }

    // Check complexity
    if (rules.complexity) {
      const complexity = this.checkPasswordComplexity(secret);
      if (!complexity.valid) {
        result.valid = false;
        result.issues.push(...complexity.issues);
      }
    }

    return result;
  }

  /**
   * Check password complexity
   * @param {string} password - Password to check
   * @returns {Object} Complexity check result
   */
  checkPasswordComplexity(password) {
    const result = {
      valid: true,
      issues: [],
      score: 0
    };

    // Length check
    if (password.length >= 12) {
      result.score += 25;
    } else if (password.length >= 8) {
      result.score += 15;
    } else {
      result.issues.push('Password should be at least 8 characters long');
    }

    // Character type checks
    if (/[a-z]/.test(password)) {
      result.score += 15;
    } else {
      result.issues.push('Should contain lowercase letters');
    }

    if (/[A-Z]/.test(password)) {
      result.score += 15;
    } else {
      result.issues.push('Should contain uppercase letters');
    }

    if (/\d/.test(password)) {
      result.score += 15;
    } else {
      result.issues.push('Should contain numbers');
    }

    if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      result.score += 15;
    } else {
      result.issues.push('Should contain special characters');
    }

    // Entropy check
    const entropy = this.calculateEntropy(password);
    if (entropy >= 50) {
      result.score += 15;
    } else if (entropy >= 30) {
      result.score += 10;
    } else {
      result.issues.push('Password has low entropy (predictable)');
    }

    result.valid = result.score >= 60 && result.issues.length === 0;

    return result;
  }

  /**
   * Calculate password entropy
   * @param {string} password - Password to analyze
   * @returns {number} Entropy score
   */
  calculateEntropy(password) {
    const charFreq = {};
    for (const char of password) {
      charFreq[char] = (charFreq[char] || 0) + 1;
    }

    let entropy = 0;
    const length = password.length;

    for (const freq of Object.values(charFreq)) {
      const probability = freq / length;
      entropy -= probability * Math.log2(probability);
    }

    return entropy * length;
  }

  /**
   * Check for development secrets in production
   * @returns {Array} List of development secrets found
   */
  checkForDevelopmentSecrets() {
    const devPatterns = [
      { key: 'JWT_SECRET', pattern: /^(test|dev|development|secret|password|123)/i },
      { key: 'ENCRYPTION_KEY', pattern: /^(test|dev|development|secret|password|123)/i },
      { key: 'DB_PASSWORD', pattern: /^(test|dev|development|secret|password|123)/i },
      { key: 'STRIPE_SECRET_KEY', pattern: /^sk_test_/ }
    ];

    const found = [];

    for (const { key, pattern } of devPatterns) {
      if (process.env[key] && pattern.test(process.env[key])) {
        found.push(key);
      }
    }

    return found;
  }

  /**
   * Generate secure environment template
   * @returns {string} Environment template content
   */
  generateSecureTemplate() {
    const template = `# Secure Environment Configuration
# Copy this file to .env and fill in your actual values
# NEVER commit .env files to version control

# Database Configuration (Required)
DB_HOST=localhost
DB_PORT=3306
DB_NAME=bed_texture_ecommerce
DB_USER=your_db_user
DB_PASSWORD=your_secure_db_password_min_8_chars

# Security Keys (Required - Generate strong random values)
JWT_SECRET=your_jwt_secret_min_32_chars_base64_encoded
ENCRYPTION_KEY=your_encryption_key_min_32_chars_complex

# Stripe Configuration (Required for payments)
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_publishable_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret

# AWS Configuration (Required for email and file storage)
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=us-east-1
AWS_S3_BUCKET=your_s3_bucket_name

# Email Configuration (AWS SES)
AWS_SES_REGION=us-east-1
FROM_EMAIL=noreply@yourdomain.com

# FedEx API Configuration (Required for shipping)
FEDEX_API_URL=https://apis-sandbox.fedex.com
FEDEX_API_KEY=your_fedex_api_key
FEDEX_SECRET_KEY=your_fedex_secret_key
FEDEX_ACCOUNT_NUMBER=your_fedex_account_number
FEDEX_METER_NUMBER=your_fedex_meter_number

# SSL Configuration (Production)
SSL_ENABLED=false
SSL_CERT_PATH=/path/to/certificate.crt
SSL_KEY_PATH=/path/to/private.key
SSL_CA_PATH=/path/to/ca-bundle.crt

# Security Configuration
SESSION_TIMEOUT=3600
REFRESH_TOKEN_TIMEOUT=604800
HIGH_VALUE_THRESHOLD=1000.00
BLACKLISTED_IPS=

# Application Configuration
NODE_ENV=development
PORT=6666
FRONTEND_URL=http://localhost:3000
ADMIN_URL=http://localhost:3005

# Company Information
COMPANY_NAME=Bed Texture Store
COMPANY_ADDRESS=123 Main Street
COMPANY_CITY=New York
COMPANY_STATE=NY
COMPANY_POSTAL_CODE=10001
COMPANY_COUNTRY_CODE=US
COMPANY_PHONE=555-123-4567

# Security Notes:
# 1. Use strong, unique passwords for all secrets
# 2. Rotate secrets regularly (every 90 days recommended)
# 3. Use different secrets for development and production
# 4. Never use default or example values in production
# 5. Consider using a secret management service for production
`;

    return template;
  }

  /**
   * Mask sensitive environment variables for logging
   * @param {Object} env - Environment variables object
   * @returns {Object} Masked environment variables
   */
  maskEnvironmentVariables(env = process.env) {
    const masked = {};

    for (const [key, value] of Object.entries(env)) {
      if (this.sensitiveKeys.has(key)) {
        if (value && typeof value === 'string') {
          if (value.length <= 8) {
            masked[key] = '*'.repeat(value.length);
          } else {
            masked[key] = value.substring(0, 4) + '*'.repeat(value.length - 8) + value.substring(value.length - 4);
          }
        } else {
          masked[key] = '[REDACTED]';
        }
      } else {
        masked[key] = value;
      }
    }

    return masked;
  }

  /**
   * Generate secure random secret
   * @param {number} length - Secret length
   * @param {boolean} base64 - Whether to return base64 encoded
   * @returns {string} Generated secret
   */
  generateSecureSecret(length = 32, base64 = true) {
    const bytes = crypto.randomBytes(length);
    return base64 ? bytes.toString('base64') : bytes.toString('hex');
  }

  /**
   * Mask file path for logging
   * @param {string} filePath - File path to mask
   * @returns {string} Masked path
   */
  maskPath(filePath) {
    if (!filePath) return 'undefined';
    
    const parts = filePath.split('/');
    if (parts.length <= 2) return filePath;
    
    return `${parts[0]}/.../${parts[parts.length - 1]}`;
  }

  /**
   * Get environment security status
   * @returns {Object} Security status report
   */
  getSecurityStatus() {
    const status = {
      environment: process.env.NODE_ENV || 'development',
      requiredVariables: {
        total: this.requiredKeys.size,
        present: 0,
        missing: []
      },
      sensitiveVariables: {
        total: this.sensitiveKeys.size,
        present: 0,
        weak: []
      },
      overallScore: 0,
      recommendations: []
    };

    // Check required variables
    for (const key of this.requiredKeys) {
      if (process.env[key]) {
        status.requiredVariables.present++;
      } else {
        status.requiredVariables.missing.push(key);
      }
    }

    // Check sensitive variables
    for (const key of this.sensitiveKeys) {
      if (process.env[key]) {
        status.sensitiveVariables.present++;
        
        // Check if validation rules exist and validate
        if (this.validationRules[key]) {
          const validation = this.validateSecret(process.env[key], this.validationRules[key]);
          if (!validation.valid) {
            status.sensitiveVariables.weak.push({
              key,
              issues: validation.issues
            });
          }
        }
      }
    }

    // Calculate overall score
    const requiredScore = (status.requiredVariables.present / status.requiredVariables.total) * 60;
    const sensitiveScore = (status.sensitiveVariables.present / status.sensitiveVariables.total) * 30;
    const weaknessDeduction = status.sensitiveVariables.weak.length * 5;
    
    status.overallScore = Math.max(0, requiredScore + sensitiveScore - weaknessDeduction);

    // Generate recommendations
    if (status.requiredVariables.missing.length > 0) {
      status.recommendations.push('Configure missing required environment variables');
    }
    
    if (status.sensitiveVariables.weak.length > 0) {
      status.recommendations.push('Strengthen weak secrets and passwords');
    }
    
    if (status.overallScore < 80) {
      status.recommendations.push('Review and improve environment security configuration');
    }

    return status;
  }
}

// Export singleton instance
module.exports = new SecureEnvManager();