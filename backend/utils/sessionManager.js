/**
 * Secure Session Management Utility
 * Implements secure session handling with encryption and PCI compliance
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const logger = require('./logger');
const encryptionUtil = require('./encryption');

class SessionManager {
  constructor() {
    // Validate JWT secret
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET environment variable is required');
    }
    
    this.jwtSecret = process.env.JWT_SECRET;
    this.sessionTimeout = parseInt(process.env.SESSION_TIMEOUT) || 3600; // 1 hour default
    this.refreshTokenTimeout = parseInt(process.env.REFRESH_TOKEN_TIMEOUT) || 604800; // 7 days default
    
    // In-memory session store (in production, use Redis or database)
    this.activeSessions = new Map();
    this.refreshTokens = new Map();
    
    // Start cleanup interval
    this.startCleanupInterval();
  }

  /**
   * Create a secure session for a user
   * @param {Object} user - User object
   * @param {Object} options - Session options
   * @returns {Object} Session tokens and metadata
   */
  createSession(user, options = {}) {
    try {
      const sessionId = encryptionUtil.generateSecureToken(32);
      const now = Date.now();
      
      // Create JWT payload with minimal data
      const payload = {
        userId: user.id,
        email: user.email,
        role: user.role,
        sessionId,
        iat: Math.floor(now / 1000),
        exp: Math.floor((now + (this.sessionTimeout * 1000)) / 1000)
      };
      
      // Sign JWT token
      const accessToken = jwt.sign(payload, this.jwtSecret, {
        algorithm: 'HS256',
        issuer: 'bed-texture-ecommerce',
        audience: 'bed-texture-users'
      });
      
      // Create refresh token
      const refreshToken = this.createRefreshToken(user.id, sessionId);
      
      // Store session metadata (encrypted sensitive data)
      const sessionData = {
        userId: user.id,
        sessionId,
        createdAt: now,
        lastActivity: now,
        expiresAt: now + (this.sessionTimeout * 1000),
        ipAddress: options.ipAddress || null,
        userAgent: options.userAgent || null,
        isActive: true,
        // Encrypt sensitive session data
        encryptedData: encryptionUtil.encrypt(JSON.stringify({
          email: user.email,
          fullName: user.full_name || user.name,
          preferences: user.preferences || {}
        }))
      };
      
      // Store in session store
      this.activeSessions.set(sessionId, sessionData);
      
      logger.info('Secure session created', {
        userId: user.id,
        sessionId: encryptionUtil.maskSensitiveData(sessionId),
        expiresAt: new Date(sessionData.expiresAt).toISOString()
      });
      
      return {
        accessToken,
        refreshToken,
        sessionId,
        expiresIn: this.sessionTimeout,
        tokenType: 'Bearer'
      };
    } catch (error) {
      logger.error('Session creation failed', { 
        error: error.message,
        userId: user?.id
      });
      throw new Error('Failed to create secure session');
    }
  }

  /**
   * Validate and refresh a session
   * @param {string} token - JWT access token
   * @param {Object} options - Validation options
   * @returns {Object} Validated session data
   */
  validateSession(token, options = {}) {
    try {
      // Verify JWT token
      const decoded = jwt.verify(token, this.jwtSecret, {
        algorithms: ['HS256'],
        issuer: 'bed-texture-ecommerce',
        audience: 'bed-texture-users'
      });
      
      const sessionId = decoded.sessionId;
      const sessionData = this.activeSessions.get(sessionId);
      
      if (!sessionData || !sessionData.isActive) {
        throw new Error('Session not found or inactive');
      }
      
      // Check session expiration
      if (Date.now() > sessionData.expiresAt) {
        this.destroySession(sessionId);
        throw new Error('Session expired');
      }
      
      // Update last activity
      sessionData.lastActivity = Date.now();
      
      // Decrypt sensitive session data
      const decryptedData = JSON.parse(encryptionUtil.decrypt(sessionData.encryptedData));
      
      // Validate IP address if strict mode is enabled
      if (options.strictIpValidation && options.ipAddress && 
          sessionData.ipAddress && sessionData.ipAddress !== options.ipAddress) {
        logger.warn('Session IP address mismatch', {
          sessionId: encryptionUtil.maskSensitiveData(sessionId),
          originalIp: sessionData.ipAddress,
          currentIp: options.ipAddress
        });
        
        // In strict mode, destroy session on IP mismatch
        this.destroySession(sessionId);
        throw new Error('Session security violation');
      }
      
      logger.info('Session validated successfully', {
        userId: decoded.userId,
        sessionId: encryptionUtil.maskSensitiveData(sessionId)
      });
      
      return {
        userId: decoded.userId,
        email: decoded.email,
        role: decoded.role,
        sessionId,
        sessionData: decryptedData,
        isValid: true
      };
    } catch (error) {
      if (error.name === 'JsonWebTokenError') {
        logger.warn('Invalid JWT token', { error: error.message });
        throw new Error('Invalid session token');
      } else if (error.name === 'TokenExpiredError') {
        logger.info('JWT token expired', { expiredAt: error.expiredAt });
        throw new Error('Session token expired');
      } else {
        logger.error('Session validation failed', { error: error.message });
        throw error;
      }
    }
  }

  /**
   * Create a refresh token
   * @param {string} userId - User ID
   * @param {string} sessionId - Session ID
   * @returns {string} Refresh token
   */
  createRefreshToken(userId, sessionId) {
    const refreshToken = encryptionUtil.generateSecureToken(48);
    const expiresAt = Date.now() + (this.refreshTokenTimeout * 1000);
    
    this.refreshTokens.set(refreshToken, {
      userId,
      sessionId,
      createdAt: Date.now(),
      expiresAt,
      isUsed: false
    });
    
    return refreshToken;
  }

  /**
   * Refresh an access token using refresh token
   * @param {string} refreshToken - Refresh token
   * @param {Object} user - User object
   * @returns {Object} New access token
   */
  refreshAccessToken(refreshToken, user) {
    try {
      const tokenData = this.refreshTokens.get(refreshToken);
      
      if (!tokenData || tokenData.isUsed) {
        throw new Error('Invalid or used refresh token');
      }
      
      if (Date.now() > tokenData.expiresAt) {
        this.refreshTokens.delete(refreshToken);
        throw new Error('Refresh token expired');
      }
      
      if (tokenData.userId !== user.id) {
        throw new Error('Refresh token user mismatch');
      }
      
      // Mark refresh token as used
      tokenData.isUsed = true;
      
      // Create new session
      const newSession = this.createSession(user);
      
      // Remove old refresh token
      this.refreshTokens.delete(refreshToken);
      
      logger.info('Access token refreshed', {
        userId: user.id,
        oldSessionId: encryptionUtil.maskSensitiveData(tokenData.sessionId),
        newSessionId: encryptionUtil.maskSensitiveData(newSession.sessionId)
      });
      
      return newSession;
    } catch (error) {
      logger.error('Token refresh failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Destroy a session
   * @param {string} sessionId - Session ID to destroy
   * @returns {boolean} Success status
   */
  destroySession(sessionId) {
    try {
      const sessionData = this.activeSessions.get(sessionId);
      
      if (sessionData) {
        sessionData.isActive = false;
        this.activeSessions.delete(sessionId);
        
        // Remove associated refresh tokens
        for (const [token, tokenData] of this.refreshTokens.entries()) {
          if (tokenData.sessionId === sessionId) {
            this.refreshTokens.delete(token);
          }
        }
        
        logger.info('Session destroyed', {
          sessionId: encryptionUtil.maskSensitiveData(sessionId),
          userId: sessionData.userId
        });
        
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error('Session destruction failed', { 
        error: error.message,
        sessionId: encryptionUtil.maskSensitiveData(sessionId)
      });
      return false;
    }
  }

  /**
   * Destroy all sessions for a user
   * @param {string} userId - User ID
   * @returns {number} Number of sessions destroyed
   */
  destroyAllUserSessions(userId) {
    let destroyedCount = 0;
    
    try {
      // Find and destroy all user sessions
      for (const [sessionId, sessionData] of this.activeSessions.entries()) {
        if (sessionData.userId === userId) {
          this.destroySession(sessionId);
          destroyedCount++;
        }
      }
      
      logger.info('All user sessions destroyed', {
        userId,
        destroyedCount
      });
      
      return destroyedCount;
    } catch (error) {
      logger.error('Failed to destroy all user sessions', {
        error: error.message,
        userId
      });
      return destroyedCount;
    }
  }

  /**
   * Get active session information
   * @param {string} sessionId - Session ID
   * @returns {Object|null} Session information
   */
  getSessionInfo(sessionId) {
    const sessionData = this.activeSessions.get(sessionId);
    
    if (!sessionData || !sessionData.isActive) {
      return null;
    }
    
    return {
      sessionId: encryptionUtil.maskSensitiveData(sessionId),
      userId: sessionData.userId,
      createdAt: new Date(sessionData.createdAt).toISOString(),
      lastActivity: new Date(sessionData.lastActivity).toISOString(),
      expiresAt: new Date(sessionData.expiresAt).toISOString(),
      ipAddress: sessionData.ipAddress,
      userAgent: sessionData.userAgent
    };
  }

  /**
   * Start cleanup interval for expired sessions
   */
  startCleanupInterval() {
    // Run cleanup every 15 minutes
    setInterval(() => {
      this.cleanupExpiredSessions();
    }, 15 * 60 * 1000);
    
    logger.info('Session cleanup interval started');
  }

  /**
   * Clean up expired sessions and refresh tokens
   */
  cleanupExpiredSessions() {
    const now = Date.now();
    let cleanedSessions = 0;
    let cleanedTokens = 0;
    
    try {
      // Clean expired sessions
      for (const [sessionId, sessionData] of this.activeSessions.entries()) {
        if (now > sessionData.expiresAt) {
          this.activeSessions.delete(sessionId);
          cleanedSessions++;
        }
      }
      
      // Clean expired refresh tokens
      for (const [token, tokenData] of this.refreshTokens.entries()) {
        if (now > tokenData.expiresAt || tokenData.isUsed) {
          this.refreshTokens.delete(token);
          cleanedTokens++;
        }
      }
      
      if (cleanedSessions > 0 || cleanedTokens > 0) {
        logger.info('Session cleanup completed', {
          cleanedSessions,
          cleanedTokens,
          activeSessions: this.activeSessions.size,
          activeRefreshTokens: this.refreshTokens.size
        });
      }
    } catch (error) {
      logger.error('Session cleanup failed', { error: error.message });
    }
  }

  /**
   * Get session statistics
   * @returns {Object} Session statistics
   */
  getSessionStats() {
    return {
      activeSessions: this.activeSessions.size,
      activeRefreshTokens: this.refreshTokens.size,
      sessionTimeout: this.sessionTimeout,
      refreshTokenTimeout: this.refreshTokenTimeout
    };
  }
}

// Export singleton instance
module.exports = new SessionManager();