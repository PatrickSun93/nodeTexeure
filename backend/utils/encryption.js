/**
 * Encryption Utility Module
 * Provides AES-256-GCM encryption for sensitive customer data
 * Implements PCI DSS compliant data protection
 */

const crypto = require('crypto');
const logger = require('./logger');

class EncryptionUtil {
  constructor() {
    // Ensure encryption key is available
    if (!process.env.ENCRYPTION_KEY) {
      throw new Error('ENCRYPTION_KEY environment variable is required for data encryption');
    }
    
    this.algorithm = 'aes-256-gcm';
    this.keyLength = 32; // 256 bits
    this.ivLength = 16; // 128 bits
    this.tagLength = 16; // 128 bits
    
    // Derive encryption key from environment variable
    this.encryptionKey = this.deriveKey(process.env.ENCRYPTION_KEY);
  }

  /**
   * Derive a consistent encryption key from the provided secret
   * @param {string} secret - Base secret from environment
   * @returns {Buffer} Derived encryption key
   */
  deriveKey(secret) {
    return crypto.pbkdf2Sync(secret, 'bed-texture-salt', 100000, this.keyLength, 'sha256');
  }

  /**
   * Encrypt sensitive data using AES-256-GCM
   * @param {string} plaintext - Data to encrypt
   * @returns {string} Encrypted data in format: iv:tag:ciphertext (base64 encoded)
   */
  encrypt(plaintext) {
    try {
      if (!plaintext || typeof plaintext !== 'string') {
        throw new Error('Invalid plaintext provided for encryption');
      }

      // Generate random IV for each encryption
      const iv = crypto.randomBytes(this.ivLength);
      
      // Create cipher
      const cipher = crypto.createCipher(this.algorithm, this.encryptionKey);
      cipher.setAAD(Buffer.from('bed-texture-aad')); // Additional authenticated data
      
      // Encrypt the data
      let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
      ciphertext += cipher.final('base64');
      
      // Get authentication tag
      const tag = cipher.getAuthTag();
      
      // Combine IV, tag, and ciphertext
      const encrypted = `${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext}`;
      
      logger.info('Data encrypted successfully', { 
        dataLength: plaintext.length,
        encryptedLength: encrypted.length
      });
      
      return encrypted;
    } catch (error) {
      logger.error('Encryption failed', { error: error.message });
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt data encrypted with encrypt method
   * @param {string} encryptedData - Encrypted data in format: iv:tag:ciphertext
   * @returns {string} Decrypted plaintext
   */
  decrypt(encryptedData) {
    try {
      if (!encryptedData || typeof encryptedData !== 'string') {
        throw new Error('Invalid encrypted data provided for decryption');
      }

      // Split the encrypted data
      const parts = encryptedData.split(':');
      if (parts.length !== 3) {
        throw new Error('Invalid encrypted data format');
      }

      const [ivBase64, tagBase64, ciphertext] = parts;
      
      // Convert from base64
      const iv = Buffer.from(ivBase64, 'base64');
      const tag = Buffer.from(tagBase64, 'base64');
      
      // Create decipher
      const decipher = crypto.createDecipher(this.algorithm, this.encryptionKey);
      decipher.setAAD(Buffer.from('bed-texture-aad'));
      decipher.setAuthTag(tag);
      
      // Decrypt the data
      let plaintext = decipher.update(ciphertext, 'base64', 'utf8');
      plaintext += decipher.final('utf8');
      
      logger.info('Data decrypted successfully', { 
        encryptedLength: encryptedData.length,
        decryptedLength: plaintext.length
      });
      
      return plaintext;
    } catch (error) {
      logger.error('Decryption failed', { error: error.message });
      throw new Error('Failed to decrypt data');
    }
  }

  /**
   * Hash sensitive data using SHA-256 (one-way)
   * Used for data that needs to be compared but not retrieved
   * @param {string} data - Data to hash
   * @param {string} salt - Optional salt (will generate if not provided)
   * @returns {Object} Hash result with salt and hash
   */
  hash(data, salt = null) {
    try {
      if (!data || typeof data !== 'string') {
        throw new Error('Invalid data provided for hashing');
      }

      // Generate salt if not provided
      if (!salt) {
        salt = crypto.randomBytes(16).toString('hex');
      }
      
      // Create hash
      const hash = crypto.pbkdf2Sync(data, salt, 100000, 64, 'sha256').toString('hex');
      
      logger.info('Data hashed successfully', { 
        dataLength: data.length,
        saltLength: salt.length
      });
      
      return {
        hash,
        salt
      };
    } catch (error) {
      logger.error('Hashing failed', { error: error.message });
      throw new Error('Failed to hash data');
    }
  }

  /**
   * Verify hashed data
   * @param {string} data - Original data to verify
   * @param {string} hash - Stored hash
   * @param {string} salt - Salt used for hashing
   * @returns {boolean} True if data matches hash
   */
  verifyHash(data, hash, salt) {
    try {
      const result = this.hash(data, salt);
      return result.hash === hash;
    } catch (error) {
      logger.error('Hash verification failed', { error: error.message });
      return false;
    }
  }

  /**
   * Generate secure random token
   * @param {number} length - Token length in bytes (default: 32)
   * @returns {string} Random token in hex format
   */
  generateSecureToken(length = 32) {
    try {
      const token = crypto.randomBytes(length).toString('hex');
      
      logger.info('Secure token generated', { 
        tokenLength: token.length,
        byteLength: length
      });
      
      return token;
    } catch (error) {
      logger.error('Token generation failed', { error: error.message });
      throw new Error('Failed to generate secure token');
    }
  }

  /**
   * Encrypt credit card data (PCI DSS compliant)
   * Note: In production, use tokenization instead of encryption for card data
   * @param {Object} cardData - Card data object
   * @returns {Object} Encrypted card data
   */
  encryptCardData(cardData) {
    try {
      // In production, this should use tokenization, not encryption
      logger.warn('Card data encryption used - consider tokenization for production');
      
      const sensitiveFields = ['number', 'cvc', 'exp_month', 'exp_year'];
      const encrypted = { ...cardData };
      
      sensitiveFields.forEach(field => {
        if (encrypted[field]) {
          encrypted[field] = this.encrypt(encrypted[field].toString());
        }
      });
      
      // Add encryption metadata
      encrypted._encrypted = true;
      encrypted._timestamp = new Date().toISOString();
      
      return encrypted;
    } catch (error) {
      logger.error('Card data encryption failed', { error: error.message });
      throw new Error('Failed to encrypt card data');
    }
  }

  /**
   * Mask sensitive data for logging
   * @param {string} data - Sensitive data to mask
   * @param {number} visibleChars - Number of characters to show (default: 4)
   * @returns {string} Masked data
   */
  maskSensitiveData(data, visibleChars = 4) {
    if (!data || typeof data !== 'string') {
      return '[INVALID_DATA]';
    }
    
    if (data.length <= visibleChars) {
      return '*'.repeat(data.length);
    }
    
    const masked = '*'.repeat(data.length - visibleChars) + data.slice(-visibleChars);
    return masked;
  }

  /**
   * Validate encryption key strength
   * @param {string} key - Key to validate
   * @returns {Object} Validation result
   */
  validateKeyStrength(key) {
    const result = {
      valid: false,
      score: 0,
      issues: []
    };
    
    if (!key || typeof key !== 'string') {
      result.issues.push('Key must be a non-empty string');
      return result;
    }
    
    // Check length
    if (key.length < 32) {
      result.issues.push('Key should be at least 32 characters long');
    } else {
      result.score += 25;
    }
    
    // Check for uppercase letters
    if (!/[A-Z]/.test(key)) {
      result.issues.push('Key should contain uppercase letters');
    } else {
      result.score += 25;
    }
    
    // Check for lowercase letters
    if (!/[a-z]/.test(key)) {
      result.issues.push('Key should contain lowercase letters');
    } else {
      result.score += 25;
    }
    
    // Check for numbers
    if (!/\d/.test(key)) {
      result.issues.push('Key should contain numbers');
    } else {
      result.score += 25;
    }
    
    // Check for special characters
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(key)) {
      result.issues.push('Key should contain special characters');
    } else {
      result.score += 25;
    }
    
    result.valid = result.score >= 75 && result.issues.length === 0;
    
    return result;
  }
}

// Export singleton instance
module.exports = new EncryptionUtil();