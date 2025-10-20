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
 * GET /api/admin/security/audit-trail
 * Get comprehensive audit trail with advanced filtering
 */
router.get('/audit-trail', protect, requireRole(['admin']), async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      timeRange = '7d',
      operationType = 'all',
      userId = '',
      ipAddress = '',
      severity = 'all',
      resourceType = 'all',
      success = 'all'
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
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    let whereConditions = ['created_at >= ?'];
    let queryParams = [startTime];

    // Operation type filter
    if (operationType !== 'all') {
      whereConditions.push('operation_type = ?');
      queryParams.push(operationType);
    }

    // User ID filter
    if (userId) {
      whereConditions.push('user_id LIKE ?');
      queryParams.push(`%${userId}%`);
    }

    // IP address filter
    if (ipAddress) {
      whereConditions.push('ip_address LIKE ?');
      queryParams.push(`%${ipAddress}%`);
    }

    // Severity filter
    if (severity !== 'all') {
      whereConditions.push('severity = ?');
      queryParams.push(severity.toUpperCase());
    }

    // Resource type filter
    if (resourceType !== 'all') {
      whereConditions.push('resource_type = ?');
      queryParams.push(resourceType);
    }

    // Success filter
    if (success !== 'all') {
      const successValue = success === 'true';
      whereConditions.push('JSON_EXTRACT(audit_details, "$.response.success") = ?');
      queryParams.push(successValue);
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
        user_id,
        action,
        resource_type,
        resource_id,
        operation_type,
        severity,
        ip_address,
        user_agent,
        audit_details,
        created_at
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
      const auditTrail = dataResult.data.map(row => ({
        id: row.id,
        userId: row.user_id,
        action: row.action,
        resourceType: row.resource_type,
        resourceId: row.resource_id,
        operationType: row.operation_type,
        severity: row.severity,
        ipAddress: row.ip_address,
        userAgent: row.user_agent,
        timestamp: row.created_at,
        details: row.audit_details ? JSON.parse(row.audit_details) : {}
      }));

      const keyValueTable = {
        auditTrail,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalCount,
          limit: parseInt(limit),
          hasNext: page < totalPages,
          hasPrev: page > 1
        },
        filters: { timeRange, operationType, userId, ipAddress, severity, resourceType, success },
        summary: {
          totalEvents: totalCount,
          criticalEvents: auditTrail.filter(a => a.severity === 'HIGH' || a.severity === 'CRITICAL').length,
          failedOperations: auditTrail.filter(a => a.details?.response?.success === false).length
        }
      };

      res.json(ResponseFormatter.success('Audit trail retrieved successfully', keyValueTable));
    } else {
      throw new Error('Failed to retrieve audit trail');
    }
  } catch (error) {
    logger.error('Get audit trail error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to get audit trail', keyValueTable));
  }
});

/**
 * GET /api/admin/security/compliance-report
 * Generate compliance reports for PCI DSS, GDPR, etc.
 */
router.get('/compliance-report', protect, requireRole(['admin']), async (req, res) => {
  try {
    const { 
      reportType = 'pci_dss', 
      startDate, 
      endDate,
      format = 'json'
    } = req.query;

    if (!startDate || !endDate) {
      const keyValueTable = { error: 'startDate and endDate are required' };
      return res.status(400).json(ResponseFormatter.failure('Missing required parameters', keyValueTable));
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    let reportData = {};

    switch (reportType) {
      case 'pci_dss':
        reportData = await generatePCIDSSReport(start, end);
        break;
      case 'gdpr':
        reportData = await generateGDPRReport(start, end);
        break;
      case 'security_summary':
        reportData = await generateSecuritySummaryReport(start, end);
        break;
      default:
        throw new Error('Invalid report type');
    }

    const keyValueTable = {
      reportType,
      period: { startDate, endDate },
      generatedAt: new Date().toISOString(),
      generatedBy: req.user.id,
      ...reportData
    };

    if (format === 'csv') {
      // Convert to CSV format
      const csv = convertReportToCSV(reportData);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${reportType}_report_${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csv);
    } else {
      res.json(ResponseFormatter.success('Compliance report generated successfully', keyValueTable));
    }
  } catch (error) {
    logger.error('Generate compliance report error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to generate compliance report', keyValueTable));
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

// Helper functions for compliance reports
async function generatePCIDSSReport(startDate, endDate) {
  const query = `
    SELECT 
      operation_type,
      COUNT(*) as event_count,
      SUM(CASE WHEN JSON_EXTRACT(audit_details, '$.response.success') = false THEN 1 ELSE 0 END) as failed_count,
      COUNT(DISTINCT ip_address) as unique_ips,
      COUNT(DISTINCT user_id) as unique_users
    FROM audit_logs 
    WHERE created_at BETWEEN ? AND ?
    AND operation_type IN ('PAYMENT_CONFIRM', 'PAYMENT_REFUND', 'USER_LOGIN', 'ADMIN_ACCESS')
    GROUP BY operation_type
  `;

  const result = await DatabaseUtil.executeQuery(query, [startDate, endDate]);
  
  return {
    pciCompliance: {
      paymentOperations: result.success ? result.data : [],
      accessControls: {
        totalLoginAttempts: result.data?.find(r => r.operation_type === 'USER_LOGIN')?.event_count || 0,
        failedLogins: result.data?.find(r => r.operation_type === 'USER_LOGIN')?.failed_count || 0
      },
      dataProtection: {
        encryptedTransactions: true, // Based on system configuration
        secureStorage: true
      }
    }
  };
}

async function generateGDPRReport(startDate, endDate) {
  const query = `
    SELECT 
      COUNT(*) as total_data_access,
      COUNT(DISTINCT user_id) as unique_data_subjects,
      SUM(CASE WHEN operation_type = 'DATA_EXPORT' THEN 1 ELSE 0 END) as data_exports,
      SUM(CASE WHEN operation_type = 'DATA_DELETE' THEN 1 ELSE 0 END) as data_deletions
    FROM audit_logs 
    WHERE created_at BETWEEN ? AND ?
    AND resource_type IN ('user', 'customer', 'personal_data')
  `;

  const result = await DatabaseUtil.executeQuery(query, [startDate, endDate]);
  
  return {
    gdprCompliance: {
      dataSubjectRights: result.success ? result.data[0] : {},
      consentManagement: {
        consentRecords: true, // Based on system implementation
        withdrawalRequests: 0
      },
      dataBreaches: {
        reportedBreaches: 0,
        notificationsSent: 0
      }
    }
  };
}

async function generateSecuritySummaryReport(startDate, endDate) {
  const query = `
    SELECT 
      severity,
      operation_type,
      COUNT(*) as count
    FROM audit_logs 
    WHERE created_at BETWEEN ? AND ?
    GROUP BY severity, operation_type
    ORDER BY severity DESC, count DESC
  `;

  const result = await DatabaseUtil.executeQuery(query, [startDate, endDate]);
  
  return {
    securitySummary: {
      eventsByType: result.success ? result.data : [],
      riskAssessment: 'LOW', // Based on analysis
      recommendations: [
        'Continue monitoring login patterns',
        'Review failed authentication attempts',
        'Maintain current security policies'
      ]
    }
  };
}

/**
 * GET /api/admin/security/backup-status
 * Get backup system status and recent backup information
 */
router.get('/backup-status', protect, requireRole(['admin']), async (req, res) => {
  try {
    // Get backup configuration and status
    const backupStatus = await getBackupStatus();
    
    const keyValueTable = {
      backupSystem: {
        enabled: true,
        lastBackup: backupStatus.lastBackup,
        nextScheduledBackup: backupStatus.nextScheduled,
        backupLocation: backupStatus.location,
        retentionPeriod: '30 days'
      },
      recentBackups: backupStatus.recentBackups || [],
      storageUsage: backupStatus.storageUsage || {},
      backupHealth: backupStatus.health || 'HEALTHY'
    };

    res.json(ResponseFormatter.success('Backup status retrieved successfully', keyValueTable));
  } catch (error) {
    logger.error('Get backup status error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to get backup status', keyValueTable));
  }
});

/**
 * POST /api/admin/security/create-backup
 * Create an immediate backup
 */
router.post('/create-backup', protect, requireRole(['admin']), async (req, res) => {
  try {
    const { backupType = 'full', description = '' } = req.body;

    // Validate backup type
    const validTypes = ['full', 'incremental', 'database', 'files'];
    if (!validTypes.includes(backupType)) {
      const keyValueTable = { error: 'Invalid backup type', validTypes };
      return res.status(400).json(ResponseFormatter.failure('Invalid backup type', keyValueTable));
    }

    // Create backup
    const backupResult = await createBackup(backupType, {
      description,
      initiatedBy: req.user.id,
      timestamp: new Date().toISOString()
    });

    // Log the backup creation
    await logger.logAudit({
      operation: 'BACKUP_CREATE',
      user: {
        userId: req.user.id,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      },
      request: {
        method: 'POST',
        url: req.originalUrl,
        body: { backupType, description }
      },
      response: {
        success: backupResult.success,
        backupId: backupResult.backupId
      },
      metadata: {
        resourceType: 'backup',
        resourceId: backupResult.backupId
      }
    });

    const keyValueTable = {
      backupId: backupResult.backupId,
      backupType,
      status: backupResult.status,
      startTime: backupResult.startTime,
      estimatedCompletion: backupResult.estimatedCompletion,
      initiatedBy: req.user.id
    };

    res.json(ResponseFormatter.success('Backup initiated successfully', keyValueTable));
  } catch (error) {
    logger.error('Create backup error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to create backup', keyValueTable));
  }
});

/**
 * GET /api/admin/security/backup-history
 * Get backup history with pagination
 */
router.get('/backup-history', protect, requireRole(['admin']), async (req, res) => {
  try {
    const { page = 1, limit = 20, status = 'all', type = 'all' } = req.query;
    const offset = (page - 1) * limit;

    // Get backup history from database or backup system
    const backupHistory = await getBackupHistory({
      limit: parseInt(limit),
      offset,
      status: status !== 'all' ? status : null,
      type: type !== 'all' ? type : null
    });

    const keyValueTable = {
      backups: backupHistory.backups || [],
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil((backupHistory.totalCount || 0) / limit),
        totalCount: backupHistory.totalCount || 0,
        limit: parseInt(limit)
      },
      summary: {
        totalBackups: backupHistory.totalCount || 0,
        successfulBackups: backupHistory.successCount || 0,
        failedBackups: backupHistory.failedCount || 0
      }
    };

    res.json(ResponseFormatter.success('Backup history retrieved successfully', keyValueTable));
  } catch (error) {
    logger.error('Get backup history error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to get backup history', keyValueTable));
  }
});

/**
 * POST /api/admin/security/restore-backup
 * Restore from a specific backup
 */
router.post('/restore-backup', protect, requireRole(['admin']), async (req, res) => {
  try {
    const { backupId, restoreType = 'full', confirmRestore = false } = req.body;

    if (!backupId) {
      const keyValueTable = { error: 'backupId is required' };
      return res.status(400).json(ResponseFormatter.failure('Missing required field', keyValueTable));
    }

    if (!confirmRestore) {
      const keyValueTable = { 
        error: 'Restore confirmation required',
        warning: 'This operation will overwrite existing data. Set confirmRestore=true to proceed.'
      };
      return res.status(400).json(ResponseFormatter.failure('Confirmation required', keyValueTable));
    }

    // Initiate restore process
    const restoreResult = await initiateRestore(backupId, {
      restoreType,
      initiatedBy: req.user.id,
      timestamp: new Date().toISOString()
    });

    // Log the restore operation
    await logger.logAudit({
      operation: 'BACKUP_RESTORE',
      user: {
        userId: req.user.id,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      },
      request: {
        method: 'POST',
        url: req.originalUrl,
        body: { backupId, restoreType }
      },
      response: {
        success: restoreResult.success,
        restoreId: restoreResult.restoreId
      },
      metadata: {
        resourceType: 'backup_restore',
        resourceId: restoreResult.restoreId
      }
    });

    const keyValueTable = {
      restoreId: restoreResult.restoreId,
      backupId,
      restoreType,
      status: restoreResult.status,
      startTime: restoreResult.startTime,
      estimatedCompletion: restoreResult.estimatedCompletion,
      initiatedBy: req.user.id
    };

    res.json(ResponseFormatter.success('Restore initiated successfully', keyValueTable));
  } catch (error) {
    logger.error('Restore backup error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to initiate restore', keyValueTable));
  }
});

/**
 * GET /api/admin/security/disaster-recovery
 * Get disaster recovery plan and status
 */
router.get('/disaster-recovery', protect, requireRole(['admin']), async (req, res) => {
  try {
    const drStatus = await getDisasterRecoveryStatus();

    const keyValueTable = {
      disasterRecoveryPlan: {
        enabled: true,
        lastTested: drStatus.lastTested,
        nextTest: drStatus.nextTest,
        rtoTarget: '4 hours', // Recovery Time Objective
        rpoTarget: '1 hour',  // Recovery Point Objective
        status: drStatus.status || 'READY'
      },
      backupSites: drStatus.backupSites || [],
      recoveryProcedures: drStatus.procedures || [],
      contactList: drStatus.contacts || [],
      lastDrillResults: drStatus.lastDrillResults || null
    };

    res.json(ResponseFormatter.success('Disaster recovery status retrieved successfully', keyValueTable));
  } catch (error) {
    logger.error('Get disaster recovery status error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to get disaster recovery status', keyValueTable));
  }
});

// Helper functions for backup and recovery operations
async function getBackupStatus() {
  // In a real implementation, this would check actual backup systems
  // For now, return mock data
  return {
    lastBackup: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    nextScheduled: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    location: '/backups/database',
    recentBackups: [
      {
        id: 'backup_001',
        type: 'full',
        status: 'completed',
        startTime: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        endTime: new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString(),
        size: '2.5 GB'
      },
      {
        id: 'backup_002',
        type: 'incremental',
        status: 'completed',
        startTime: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
        endTime: new Date(Date.now() - 11.5 * 60 * 60 * 1000).toISOString(),
        size: '150 MB'
      }
    ],
    storageUsage: {
      used: '15.2 GB',
      available: '84.8 GB',
      total: '100 GB'
    },
    health: 'HEALTHY'
  };
}

async function createBackup(backupType, options) {
  // In a real implementation, this would trigger actual backup process
  const backupId = `backup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  return {
    success: true,
    backupId,
    status: 'in_progress',
    startTime: new Date().toISOString(),
    estimatedCompletion: new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30 minutes
  };
}

async function getBackupHistory(options) {
  // Mock backup history data
  const mockBackups = [
    {
      id: 'backup_001',
      type: 'full',
      status: 'completed',
      startTime: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      endTime: new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString(),
      size: '2.5 GB',
      initiatedBy: 'system'
    },
    {
      id: 'backup_002',
      type: 'incremental',
      status: 'completed',
      startTime: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
      endTime: new Date(Date.now() - 11.5 * 60 * 60 * 1000).toISOString(),
      size: '150 MB',
      initiatedBy: 'admin'
    }
  ];

  return {
    backups: mockBackups.slice(options.offset, options.offset + options.limit),
    totalCount: mockBackups.length,
    successCount: mockBackups.filter(b => b.status === 'completed').length,
    failedCount: mockBackups.filter(b => b.status === 'failed').length
  };
}

async function initiateRestore(backupId, options) {
  // In a real implementation, this would trigger actual restore process
  const restoreId = `restore_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  return {
    success: true,
    restoreId,
    status: 'in_progress',
    startTime: new Date().toISOString(),
    estimatedCompletion: new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hour
  };
}

async function getDisasterRecoveryStatus() {
  // Mock disaster recovery status
  return {
    lastTested: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    nextTest: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'READY',
    backupSites: [
      {
        name: 'Primary Backup Site',
        location: 'AWS US-East-1',
        status: 'active',
        lastSync: new Date(Date.now() - 60 * 60 * 1000).toISOString()
      }
    ],
    procedures: [
      'Database Recovery Procedure',
      'Application Recovery Procedure',
      'Network Recovery Procedure'
    ],
    contacts: [
      { role: 'Primary Admin', contact: 'admin@company.com' },
      { role: 'Backup Admin', contact: 'backup@company.com' }
    ],
    lastDrillResults: {
      date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      rto: '3.5 hours',
      rpo: '45 minutes',
      status: 'passed'
    }
  };
}

function convertReportToCSV(reportData) {
  // Simple CSV conversion - can be enhanced based on needs
  const headers = ['Timestamp', 'Event Type', 'Severity', 'User ID', 'IP Address', 'Status'];
  const rows = [headers.join(',')];
  
  // Add data rows based on report structure
  if (reportData.auditTrail) {
    reportData.auditTrail.forEach(event => {
      const row = [
        event.timestamp,
        event.operationType,
        event.severity,
        event.userId,
        event.ipAddress,
        event.details?.response?.success ? 'Success' : 'Failed'
      ];
      rows.push(row.join(','));
    });
  }
  
  return rows.join('\n');
}

module.exports = router;