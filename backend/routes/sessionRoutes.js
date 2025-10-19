/**
 * Session Management Routes
 * Handles secure session operations for PCI compliance
 */

const express = require('express');
const router = express.Router();
const sessionManager = require('../utils/sessionManager');
const { protect } = require('../middleware/authMiddleware');
const { enhancedSecurity } = require('../middleware/securityMiddleware');
const ResponseFormatter = require('../utils/responseFormatter');
const logger = require('../utils/logger');

// Apply enhanced security to all session routes
router.use(enhancedSecurity);

/**
 * GET /api/sessions/info
 * Get current session information
 */
router.get('/info', protect, (req, res) => {
  try {
    const sessionInfo = sessionManager.getSessionInfo(req.user.sessionId);
    
    if (!sessionInfo) {
      const keyValueTable = { error: 'Session not found' };
      return res.status(404).json(
        ResponseFormatter.failure('Session information not available', keyValueTable)
      );
    }

    const keyValueTable = {
      session: sessionInfo,
      user: {
        id: req.user.id,
        email: req.user.email,
        role: req.user.role
      }
    };

    res.json(ResponseFormatter.success('Session information retrieved', keyValueTable));
  } catch (error) {
    logger.error('Failed to get session info', { 
      error: error.message,
      userId: req.user?.id,
      sessionId: req.user?.sessionId
    });

    const keyValueTable = { error: 'Failed to retrieve session information' };
    res.status(500).json(
      ResponseFormatter.failure('Internal server error', keyValueTable)
    );
  }
});

/**
 * POST /api/sessions/refresh
 * Refresh access token using refresh token
 */
router.post('/refresh', (req, res) => {
  try {
    const { refreshToken, userId } = req.body;

    if (!refreshToken || !userId) {
      const keyValueTable = { 
        error: 'Refresh token and user ID required',
        required: ['refreshToken', 'userId']
      };
      return res.status(400).json(
        ResponseFormatter.failure('Missing required fields', keyValueTable)
      );
    }

    // In a real implementation, you would fetch user data from database
    // For now, we'll use a mock user object
    const user = { id: userId, email: 'user@example.com', role: 'customer' };

    const newSession = sessionManager.refreshAccessToken(refreshToken, user);

    const keyValueTable = {
      accessToken: newSession.accessToken,
      refreshToken: newSession.refreshToken,
      expiresIn: newSession.expiresIn,
      tokenType: newSession.tokenType
    };

    logger.info('Session refreshed successfully', {
      userId: user.id,
      newSessionId: newSession.sessionId,
      ip: req.ip
    });

    res.json(ResponseFormatter.success('Session refreshed successfully', keyValueTable));
  } catch (error) {
    logger.warn('Session refresh failed', { 
      error: error.message,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    const keyValueTable = { error: error.message };
    res.status(401).json(
      ResponseFormatter.failure('Session refresh failed', keyValueTable)
    );
  }
});

/**
 * DELETE /api/sessions/current
 * Destroy current session (logout)
 */
router.delete('/current', protect, (req, res) => {
  try {
    const success = sessionManager.destroySession(req.user.sessionId);

    if (success) {
      logger.info('Session destroyed successfully', {
        userId: req.user.id,
        sessionId: req.user.sessionId,
        ip: req.ip
      });

      const keyValueTable = { message: 'Session terminated successfully' };
      res.json(ResponseFormatter.success('Logged out successfully', keyValueTable));
    } else {
      const keyValueTable = { error: 'Session not found or already terminated' };
      res.status(404).json(
        ResponseFormatter.failure('Session termination failed', keyValueTable)
      );
    }
  } catch (error) {
    logger.error('Failed to destroy session', { 
      error: error.message,
      userId: req.user?.id,
      sessionId: req.user?.sessionId
    });

    const keyValueTable = { error: 'Failed to terminate session' };
    res.status(500).json(
      ResponseFormatter.failure('Internal server error', keyValueTable)
    );
  }
});

/**
 * DELETE /api/sessions/all
 * Destroy all user sessions (logout from all devices)
 */
router.delete('/all', protect, (req, res) => {
  try {
    const destroyedCount = sessionManager.destroyAllUserSessions(req.user.id);

    logger.info('All user sessions destroyed', {
      userId: req.user.id,
      destroyedCount,
      ip: req.ip
    });

    const keyValueTable = { 
      message: 'All sessions terminated successfully',
      destroyedSessions: destroyedCount
    };

    res.json(ResponseFormatter.success('Logged out from all devices', keyValueTable));
  } catch (error) {
    logger.error('Failed to destroy all user sessions', { 
      error: error.message,
      userId: req.user?.id
    });

    const keyValueTable = { error: 'Failed to terminate all sessions' };
    res.status(500).json(
      ResponseFormatter.failure('Internal server error', keyValueTable)
    );
  }
});

/**
 * GET /api/sessions/stats
 * Get session statistics (admin only)
 */
router.get('/stats', protect, (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      const keyValueTable = { error: 'Admin access required' };
      return res.status(403).json(
        ResponseFormatter.failure('Access denied', keyValueTable)
      );
    }

    const stats = sessionManager.getSessionStats();

    const keyValueTable = {
      sessionStats: stats,
      timestamp: new Date().toISOString()
    };

    res.json(ResponseFormatter.success('Session statistics retrieved', keyValueTable));
  } catch (error) {
    logger.error('Failed to get session stats', { 
      error: error.message,
      userId: req.user?.id
    });

    const keyValueTable = { error: 'Failed to retrieve session statistics' };
    res.status(500).json(
      ResponseFormatter.failure('Internal server error', keyValueTable)
    );
  }
});

/**
 * POST /api/sessions/validate
 * Validate current session (health check)
 */
router.post('/validate', protect, (req, res) => {
  try {
    // If we reach here, the session is valid (protect middleware passed)
    const keyValueTable = {
      valid: true,
      userId: req.user.id,
      role: req.user.role,
      sessionId: req.user.sessionId,
      timestamp: new Date().toISOString()
    };

    res.json(ResponseFormatter.success('Session is valid', keyValueTable));
  } catch (error) {
    logger.error('Session validation error', { 
      error: error.message,
      userId: req.user?.id
    });

    const keyValueTable = { error: 'Session validation failed' };
    res.status(500).json(
      ResponseFormatter.failure('Internal server error', keyValueTable)
    );
  }
});

module.exports = router;