const express = require('express');
const DatabaseUtil = require('../utils/database');
const ResponseFormatter = require('../utils/responseFormatter');
const { protect, requireRole } = require('../middleware/authMiddleware');
const logger = require('../utils/logger');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

const router = express.Router();

/**
 * GET /api/admin/security/dashboard
 * Get security dashboard overview with key metrics
 */
router.get('/dashboard', protect, requireRole(['admin']), async (req, res) => {
  try {
    const { timeRange = '24h' } = req.query;
    
    // Calculate time range
    const now = new Date();
    let startTime;
    switch (timeRange) {
      case '1h':
        startTime = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '24h':
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    // Get login attempts and security metrics
    const loginAttemptsQuery = `
      SELECT 
        COUNT(*) as total_attempts,
        SUM(CASE WHEN JSON_EXTRACT(audit_details, '$.response.success') = true THEN 1 ELSE 0 END) as successful_logins,
        SUM(CASE WHEN JSON_EXTRACT(audit_details, '$.response.success') = false THEN 1 ELSE 0 END) as failed_logins,
        COUNT(DISTINCT JSON_EXTRACT(audit_details, '$.user.ip')) as unique_ips
      FROM audit_logs 
      WHERE operation_type IN ('USER_LOGIN', 'AUTH_FAILURE')
      AND created_at >= ?
    `;

    const securityViolationsQuery = `
      SELECT 
        COUNT(*) as total_violations,
        JSON_EXTRACT(audit_details, '$.violationType') as violation_type,
        COUNT(*) as count
      FROM audit_logs 
      WHERE operation_type = 'SECURITY_VIOLATION'
      AND created_at >= ?
      GROUP BY JSON_EXTRACT(audit_details, '$.violationType')
    `;

    const systemHealthQuery = `
      SELECT 
        COUNT(*) as total_errors,
        JSON_EXTRACT(audit_details, '$.response.statusCode') as status_code,
        COUNT(*) as count
      FROM audit_logs 
      WHERE JSON_EXTRACT(audit_details, '$.response.statusCode') >= 400
      AND created_at >= ?
      GROUP BY JSON_EXTRACT(audit_details, '$.response.statusCode')
    `;

    const [loginResult, violationsResult, healthResult] = await Promise.all([
      DatabaseUtil.executeQuery(loginAttemptsQuery, [startTime]),
      DatabaseUtil.executeQuery(securityViolationsQuery, [startTime]),
      DatabaseUtil.executeQuery(systemHealthQuery, [startTime])
    ]);

    // Get system performance metrics
    const systemMetrics = {
      cpuUsage: process.cpuUsage(),
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime(),
      loadAverage: os.loadavg(),
      freeMemory: os.freemem(),
      totalMemory: os.totalmem(),
      platform: os.platform(),
      nodeVersion: process.version
    };

    // Get database connection pool stats
    const dbStats = DatabaseUtil.getPoolStats();

    const keyValueTable = {
      timeRange,
      startTime: startTime.toISOString(),
      endTime: now.toISOString(),
      loginMetrics: loginResult.success ? loginResult.data[0] : {},
      securityViolations: violationsResult.success ? violationsResult.data : [],
      errorMetrics: healthResult.success ? healthResult.data : [],
      systemMetrics,
      databaseStats: dbStats,
      alertsCount: 0, // Will be calculated based on thresholds
      lastUpdated: now.toISOString()
    };

    // Calculate alerts based on thresholds
    const alerts = [];
    if (loginResult.success && loginResult.data[0]) {
      const { failed_logins, total_attempts } = loginResult.data[0];
      const failureRate = total_attempts > 0 ? (failed_logins / total_attempts) * 100 : 0;
      
      if (failureRate > 50) {
        alerts.push({
          type: 'HIGH_FAILURE_RATE',
          severity: 'HIGH',
          message: `Login failure rate is ${failureRate.toFixed(1)}%`,
          timestamp: now.toISOString()
        });
      }
    }

    if (systemMetrics.memoryUsage.heapUsed / systemMetrics.memoryUsage.heapTotal > 0.9) {
      alerts.push({
        type: 'HIGH_MEMORY_USAGE',
        severity: 'MEDIUM',
        message: 'Memory usage is above 90%',
        timestamp: now.toISOString()
      });
    }

    keyValueTable.alerts = alerts;
    keyValueTable.alertsCount = alerts.length;

    res.json(ResponseFormatter.success('Security dashboard data retrieved successfully', keyValueTable));
  } catch (error) {
    logger.error('Security dashboard error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to get security dashboard data', keyValueTable));
  }
});

/**
 * GET /api/admin/security/login-attempts
 * Get detailed login attempt history with filtering
 */
router.get('/login-attempts', protect, requireRole(['admin']), async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      timeRange = '24h',
      status = 'all', // all, success, failed
      ip = '',
      userId = ''
    } = req.query;

    const offset = (page - 1) * limit;
    
    // Calculate time range
    const now = new Date();
    let startTime;
    switch (timeRange) {
      case '1h':
        startTime = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '24h':
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    let whereConditions = [
      'operation_type IN (?, ?)',
      'created_at >= ?'
    ];
    let queryParams = ['USER_LOGIN', 'AUTH_FAILURE', startTime];

    // Status filter
    if (status === 'success') {
      whereConditions.push('JSON_EXTRACT(audit_details, "$.response.success") = true');
    } else if (status === 'failed') {
      whereConditions.push('JSON_EXTRACT(audit_details, "$.response.success") = false');
    }

    // IP filter
    if (ip) {
      whereConditions.push('JSON_EXTRACT(audit_details, "$.user.ip") LIKE ?');
      queryParams.push(`%${ip}%`);
    }

    // User ID filter
    if (userId) {
      whereConditions.push('JSON_EXTRACT(audit_details, "$.user.userId") LIKE ?');
      queryParams.push(`%${userId}%`);
    }

    const whereClause = whereConditions.join(' AND ');

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM audit_logs 
      WHERE ${whereClause}
    `;

    // Get paginated results
    const dataQuery = `
      SELECT 
        id,
        operation_type,
        audit_details,
        created_at,
        JSON_EXTRACT(audit_details, '$.user.userId') as user_id,
        JSON_EXTRACT(audit_details, '$.user.ip') as ip_address,
        JSON_EXTRACT(audit_details, '$.user.userAgent') as user_agent,
        JSON_EXTRACT(audit_details, '$.response.success') as success,
        JSON_EXTRACT(audit_details, '$.response.statusCode') as status_code
      FROM audit_logs 
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;

    const [countResult, dataResult] = await Promise.all([
      DatabaseUtil.executeQuery(countQuery, queryParams),
      DatabaseUtil.executeQuery(dataQuery, [...queryParams, parseInt(limit), offset])
    ]);

    if (countResult.success && dataResult.success) {
      const totalCount = countResult.data[0].total;
      const totalPages = Math.ceil(totalCount / limit);

      // Process the data to make it more readable
      const loginAttempts = dataResult.data.map(row => ({
        id: row.id,
        operationType: row.operation_type,
        userId: row.user_id ? row.user_id.replace(/"/g, '') : null,
        ipAddress: row.ip_address ? row.ip_address.replace(/"/g, '') : null,
        userAgent: row.user_agent ? row.user_agent.replace(/"/g, '') : null,
        success: row.success === true || row.success === 'true',
        statusCode: row.status_code ? parseInt(row.status_code) : null,
        timestamp: row.created_at,
        details: row.audit_details ? JSON.parse(row.audit_details) : {}
      }));

      const keyValueTable = {
        loginAttempts,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalCount,
          limit: parseInt(limit),
          hasNext: page < totalPages,
          hasPrev: page > 1
        },
        filters: { timeRange, status, ip, userId },
        summary: {
          totalAttempts: totalCount,
          successfulLogins: loginAttempts.filter(a => a.success).length,
          failedLogins: loginAttempts.filter(a => !a.success).length
        }
      };

      res.json(ResponseFormatter.success('Login attempts retrieved successfully', keyValueTable));
    } else {
      throw new Error('Failed to retrieve login attempts');
    }
  } catch (error) {
    logger.error('Get login attempts error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to get login attempts', keyValueTable));
  }
});

/**
 * GET /api/admin/security/threats
 * Get threat detection and security violations
 */
router.get('/threats', protect, requireRole(['admin']), async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      timeRange = '24h',
      severity = 'all', // all, low, medium, high, critical
      type = 'all'
    } = req.query;

    const offset = (page - 1) * limit;
    
    // Calculate time range
    const now = new Date();
    let startTime;
    switch (timeRange) {
      case '1h':
        startTime = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '24h':
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    let whereConditions = [
      'operation_type = ?',
      'created_at >= ?'
    ];
    let queryParams = ['SECURITY_VIOLATION', startTime];

    // Severity filter
    if (severity !== 'all') {
      whereConditions.push('JSON_EXTRACT(audit_details, "$.severity") = ?');
      queryParams.push(severity.toUpperCase());
    }

    // Type filter
    if (type !== 'all') {
      whereConditions.push('JSON_EXTRACT(audit_details, "$.violationType") = ?');
      queryParams.push(type.toUpperCase());
    }

    const whereClause = whereConditions.join(' AND ');

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM audit_logs 
      WHERE ${whereClause}
    `;

    // Get paginated results
    const dataQuery = `
      SELECT 
        id,
        audit_details,
        created_at,
        JSON_EXTRACT(audit_details, '$.violationType') as violation_type,
        JSON_EXTRACT(audit_details, '$.severity') as severity,
        JSON_EXTRACT(audit_details, '$.details.ip') as ip_address,
        JSON_EXTRACT(audit_details, '$.details.userId') as user_id
      FROM audit_logs 
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;

    const [countResult, dataResult] = await Promise.all([
      DatabaseUtil.executeQuery(countQuery, queryParams),
      DatabaseUtil.executeQuery(dataQuery, [...queryParams, parseInt(limit), offset])
    ]);

    if (countResult.success && dataResult.success) {
      const totalCount = countResult.data[0].total;
      const totalPages = Math.ceil(totalCount / limit);

      // Process the data
      const threats = dataResult.data.map(row => ({
        id: row.id,
        violationType: row.violation_type ? row.violation_type.replace(/"/g, '') : null,
        severity: row.severity ? row.severity.replace(/"/g, '') : null,
        ipAddress: row.ip_address ? row.ip_address.replace(/"/g, '') : null,
        userId: row.user_id ? row.user_id.replace(/"/g, '') : null,
        timestamp: row.created_at,
        details: row.audit_details ? JSON.parse(row.audit_details) : {}
      }));

      const keyValueTable = {
        threats,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalCount,
          limit: parseInt(limit),
          hasNext: page < totalPages,
          hasPrev: page > 1
        },
        filters: { timeRange, severity, type },
        summary: {
          totalThreats: totalCount,
          bySeverity: {
            critical: threats.filter(t => t.severity === 'CRITICAL').length,
            high: threats.filter(t => t.severity === 'HIGH').length,
            medium: threats.filter(t => t.severity === 'MEDIUM').length,
            low: threats.filter(t => t.severity === 'LOW').length
          }
        }
      };

      res.json(ResponseFormatter.success('Security threats retrieved successfully', keyValueTable));
    } else {
      throw new Error('Failed to retrieve security threats');
    }
  } catch (error) {
    logger.error('Get security threats error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to get security threats', keyValueTable));
  }
});

/**
 * GET /api/admin/security/system-health
 * Get system health and performance metrics
 */
router.get('/system-health', protect, requireRole(['admin']), async (req, res) => {
  try {
    // Get current system metrics
    const systemMetrics = {
      cpu: {
        usage: process.cpuUsage(),
        loadAverage: os.loadavg(),
        cores: os.cpus().length
      },
      memory: {
        process: process.memoryUsage(),
        system: {
          free: os.freemem(),
          total: os.totalmem(),
          used: os.totalmem() - os.freemem(),
          usagePercent: ((os.totalmem() - os.freemem()) / os.totalmem() * 100).toFixed(2)
        }
      },
      uptime: {
        process: process.uptime(),
        system: os.uptime()
      },
      platform: {
        os: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version,
        hostname: os.hostname()
      }
    };

    // Get database health
    const dbHealth = await DatabaseUtil.testConnection();
    const dbStats = DatabaseUtil.getPoolStats();

    // Get recent error rates
    const errorRateQuery = `
      SELECT 
        COUNT(*) as total_requests,
        SUM(CASE WHEN JSON_EXTRACT(audit_details, '$.response.statusCode') >= 400 THEN 1 ELSE 0 END) as error_requests,
        SUM(CASE WHEN JSON_EXTRACT(audit_details, '$.response.statusCode') >= 500 THEN 1 ELSE 0 END) as server_errors
      FROM audit_logs 
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
      AND JSON_EXTRACT(audit_details, '$.response.statusCode') IS NOT NULL
    `;

    const errorRateResult = await DatabaseUtil.executeQuery(errorRateQuery);

    // Calculate health scores
    const healthScores = {
      overall: 100,
      database: dbHealth.connected ? 100 : 0,
      memory: Math.max(0, 100 - parseFloat(systemMetrics.memory.system.usagePercent)),
      errors: 100
    };

    if (errorRateResult.success && errorRateResult.data[0]) {
      const { total_requests, error_requests } = errorRateResult.data[0];
      if (total_requests > 0) {
        const errorRate = (error_requests / total_requests) * 100;
        healthScores.errors = Math.max(0, 100 - errorRate * 2); // Penalize error rate
      }
    }

    healthScores.overall = Math.round(
      (healthScores.database + healthScores.memory + healthScores.errors) / 3
    );

    const keyValueTable = {
      systemMetrics,
      databaseHealth: {
        ...dbHealth,
        connectionPool: dbStats
      },
      errorMetrics: errorRateResult.success ? errorRateResult.data[0] : {},
      healthScores,
      alerts: [],
      lastUpdated: new Date().toISOString()
    };

    // Generate alerts based on thresholds
    const alerts = [];
    
    if (healthScores.memory < 20) {
      alerts.push({
        type: 'LOW_MEMORY',
        severity: 'HIGH',
        message: `System memory usage is at ${systemMetrics.memory.system.usagePercent}%`,
        timestamp: new Date().toISOString()
      });
    }

    if (!dbHealth.connected) {
      alerts.push({
        type: 'DATABASE_DOWN',
        severity: 'CRITICAL',
        message: 'Database connection failed',
        timestamp: new Date().toISOString()
      });
    }

    if (healthScores.errors < 80) {
      alerts.push({
        type: 'HIGH_ERROR_RATE',
        severity: 'MEDIUM',
        message: 'Error rate is above normal threshold',
        timestamp: new Date().toISOString()
      });
    }

    keyValueTable.alerts = alerts;

    res.json(ResponseFormatter.success('System health data retrieved successfully', keyValueTable));
  } catch (error) {
    logger.error('System health check error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to get system health data', keyValueTable));
  }
});

/**
 * POST /api/admin/security/log-violation
 * Manually log a security violation (for testing or external integrations)
 */
router.post('/log-violation', protect, requireRole(['admin']), async (req, res) => {
  try {
    const { violationType, severity = 'MEDIUM', details = {} } = req.body;

    if (!violationType) {
      const keyValueTable = { error: 'violationType is required' };
      return res.status(400).json(ResponseFormatter.failure('Missing required field', keyValueTable));
    }

    // Log the security violation
    await logger.logSecurityViolation(violationType, {
      ...details,
      reportedBy: req.user.id,
      reportedAt: new Date().toISOString(),
      ip: req.ip
    });

    const keyValueTable = {
      violationType,
      severity,
      reportedBy: req.user.id,
      timestamp: new Date().toISOString()
    };

    res.json(ResponseFormatter.success('Security violation logged successfully', keyValueTable));
  } catch (error) {
    logger.error('Log security violation error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to log security violation', keyValueTable));
  }
});

module.exports = router;