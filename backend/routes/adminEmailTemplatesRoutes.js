const express = require('express');
const DatabaseUtil = require('../utils/database');
const ResponseFormatter = require('../utils/responseFormatter');
const { protect, requireRole } = require('../middleware/authMiddleware');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * GET /api/admin/email-templates
 * Get all email templates
 */
router.get('/', protect, requireRole(['admin', 'staff']), async (req, res) => {
  try {
    const { search = '', active = '' } = req.query;

    let whereConditions = ['1=1'];
    let queryParams = [];

    // Search filter
    if (search) {
      whereConditions.push('(name LIKE ? OR subject LIKE ?)');
      const searchTerm = `%${search}%`;
      queryParams.push(searchTerm, searchTerm);
    }

    // Active filter
    if (active === 'true') {
      whereConditions.push('is_active = TRUE');
    } else if (active === 'false') {
      whereConditions.push('is_active = FALSE');
    }

    const whereClause = whereConditions.join(' AND ');

    const query = `
      SELECT 
        id,
        name,
        subject,
        template_content,
        is_active,
        created_at,
        updated_at
      FROM email_templates
      WHERE ${whereClause}
      ORDER BY name ASC
    `;

    const result = await DatabaseUtil.executeQuery(query, queryParams);

    if (result.success) {
      // Parse template_content JSON for each template
      const templates = result.data.map(template => ({
        ...template,
        template_content: template.template_content ? JSON.parse(template.template_content) : {}
      }));

      const keyValueTable = {
        templates,
        totalCount: templates.length,
        filters: { search, active }
      };

      res.json(ResponseFormatter.success('Email templates retrieved successfully', keyValueTable));
    } else {
      throw new Error('Failed to retrieve email templates');
    }
  } catch (error) {
    logger.error('Get email templates error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to get email templates', keyValueTable));
  }
});

/**
 * GET /api/admin/email-templates/:id
 * Get specific email template by ID
 */
router.get('/:id', protect, requireRole(['admin', 'staff']), async (req, res) => {
  try {
    const { id } = req.params;

    const result = await DatabaseUtil.executeQuery(
      'SELECT * FROM email_templates WHERE id = ?',
      [id]
    );

    if (result.success && result.data.length > 0) {
      const template = result.data[0];
      const keyValueTable = {
        ...template,
        template_content: template.template_content ? JSON.parse(template.template_content) : {}
      };

      res.json(ResponseFormatter.success('Email template retrieved successfully', keyValueTable));
    } else {
      const keyValueTable = { error: 'Template not found', templateId: id };
      res.status(404).json(ResponseFormatter.failure('Template not found', keyValueTable));
    }
  } catch (error) {
    logger.error('Get email template error', {
      error: error.message,
      templateId: req.params.id,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to get email template', keyValueTable));
  }
});

/**
 * POST /api/admin/email-templates
 * Create new email template
 */
router.post('/', protect, requireRole(['admin']), async (req, res) => {
  try {
    const { name, subject, template_content, is_active = true } = req.body;

    if (!name || !subject || !template_content) {
      const keyValueTable = { error: 'name, subject, and template_content are required' };
      return res.status(400).json(ResponseFormatter.failure('Missing required fields', keyValueTable));
    }

    // Validate template_content structure
    if (!template_content.html_content && !template_content.text_content) {
      const keyValueTable = { error: 'template_content must contain html_content or text_content' };
      return res.status(400).json(ResponseFormatter.failure('Invalid template content', keyValueTable));
    }

    // Check if template name already exists
    const existingResult = await DatabaseUtil.executeQuery(
      'SELECT id FROM email_templates WHERE name = ?',
      [name]
    );

    if (existingResult.success && existingResult.data.length > 0) {
      const keyValueTable = { error: 'Template with this name already exists', name };
      return res.status(409).json(ResponseFormatter.failure('Template name already exists', keyValueTable));
    }

    // Generate template ID
    const templateIdResult = await DatabaseUtil.executeQuery('SELECT get_next_id("EMAIL") as id');
    if (!templateIdResult.success) {
      throw new Error('Failed to generate template ID');
    }
    const templateId = templateIdResult.data[0].id;

    // Create template
    const result = await DatabaseUtil.executeQuery(
      `INSERT INTO email_templates (id, name, subject, template_content, is_active)
       VALUES (?, ?, ?, ?, ?)`,
      [templateId, name, subject, JSON.stringify(template_content), is_active]
    );

    if (result.success) {
      // Log template creation
      logger.info('Email template created', {
        templateId: templateId,
        templateName: name,
        createdBy: req.user.id,
        ip: req.ip,
        timestamp: new Date().toISOString()
      });

      const keyValueTable = {
        templateId: templateId,
        name: name,
        subject: subject,
        is_active: is_active,
        createdBy: req.user.id,
        createdAt: new Date().toISOString()
      };

      res.status(201).json(ResponseFormatter.success('Email template created successfully', keyValueTable));
    } else {
      throw new Error('Failed to create email template');
    }
  } catch (error) {
    logger.error('Create email template error', {
      error: error.message,
      templateName: req.body?.name,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to create email template', keyValueTable));
  }
});

/**
 * PUT /api/admin/email-templates/:id
 * Update email template
 */
router.put('/:id', protect, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, subject, template_content, is_active } = req.body;

    // Check if template exists
    const existingResult = await DatabaseUtil.executeQuery(
      'SELECT id, name FROM email_templates WHERE id = ?',
      [id]
    );

    if (!existingResult.success || existingResult.data.length === 0) {
      const keyValueTable = { error: 'Template not found', templateId: id };
      return res.status(404).json(ResponseFormatter.failure('Template not found', keyValueTable));
    }

    const existingTemplate = existingResult.data[0];

    // Check if new name conflicts with existing template (if name is being changed)
    if (name && name !== existingTemplate.name) {
      const nameCheckResult = await DatabaseUtil.executeQuery(
        'SELECT id FROM email_templates WHERE name = ? AND id != ?',
        [name, id]
      );

      if (nameCheckResult.success && nameCheckResult.data.length > 0) {
        const keyValueTable = { error: 'Template with this name already exists', name };
        return res.status(409).json(ResponseFormatter.failure('Template name already exists', keyValueTable));
      }
    }

    // Validate template_content if provided
    if (template_content && !template_content.html_content && !template_content.text_content) {
      const keyValueTable = { error: 'template_content must contain html_content or text_content' };
      return res.status(400).json(ResponseFormatter.failure('Invalid template content', keyValueTable));
    }

    // Build update query
    let updates = [];
    let params = [];

    if (name) {
      updates.push('name = ?');
      params.push(name);
    }
    if (subject) {
      updates.push('subject = ?');
      params.push(subject);
    }
    if (template_content) {
      updates.push('template_content = ?');
      params.push(JSON.stringify(template_content));
    }
    if (typeof is_active === 'boolean') {
      updates.push('is_active = ?');
      params.push(is_active);
    }

    if (updates.length === 0) {
      const keyValueTable = { error: 'No fields to update' };
      return res.status(400).json(ResponseFormatter.failure('No update fields provided', keyValueTable));
    }

    // Add updated timestamp and template ID
    updates.push('updated_at = NOW()');
    params.push(id);

    const query = `UPDATE email_templates SET ${updates.join(', ')} WHERE id = ?`;
    const result = await DatabaseUtil.executeQuery(query, params);

    if (result.success) {
      // Log template update
      logger.info('Email template updated', {
        templateId: id,
        templateName: name || existingTemplate.name,
        updatedBy: req.user.id,
        ip: req.ip,
        timestamp: new Date().toISOString()
      });

      const keyValueTable = {
        templateId: id,
        updatedFields: updates.length - 1, // Exclude updated_at from count
        updatedBy: req.user.id,
        updatedAt: new Date().toISOString()
      };

      res.json(ResponseFormatter.success('Email template updated successfully', keyValueTable));
    } else {
      throw new Error('Failed to update email template');
    }
  } catch (error) {
    logger.error('Update email template error', {
      error: error.message,
      templateId: req.params.id,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to update email template', keyValueTable));
  }
});

/**
 * DELETE /api/admin/email-templates/:id
 * Delete email template
 */
router.delete('/:id', protect, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;

    // Check if template exists
    const existingResult = await DatabaseUtil.executeQuery(
      'SELECT id, name FROM email_templates WHERE id = ?',
      [id]
    );

    if (!existingResult.success || existingResult.data.length === 0) {
      const keyValueTable = { error: 'Template not found', templateId: id };
      return res.status(404).json(ResponseFormatter.failure('Template not found', keyValueTable));
    }

    const template = existingResult.data[0];

    // Check if template is being used in email queue
    const usageResult = await DatabaseUtil.executeQuery(
      'SELECT COUNT(*) as count FROM email_queue WHERE template_id = ?',
      [id]
    );

    if (usageResult.success && usageResult.data[0].count > 0) {
      const keyValueTable = { 
        error: 'Cannot delete template that is being used in email queue',
        templateId: id,
        usageCount: usageResult.data[0].count
      };
      return res.status(400).json(ResponseFormatter.failure('Template is in use', keyValueTable));
    }

    const result = await DatabaseUtil.executeQuery(
      'DELETE FROM email_templates WHERE id = ?',
      [id]
    );

    if (result.success) {
      // Log template deletion
      logger.info('Email template deleted', {
        templateId: id,
        templateName: template.name,
        deletedBy: req.user.id,
        ip: req.ip,
        timestamp: new Date().toISOString()
      });

      const keyValueTable = {
        templateId: id,
        templateName: template.name,
        deletedBy: req.user.id,
        deletedAt: new Date().toISOString()
      };

      res.json(ResponseFormatter.success('Email template deleted successfully', keyValueTable));
    } else {
      throw new Error('Failed to delete email template');
    }
  } catch (error) {
    logger.error('Delete email template error', {
      error: error.message,
      templateId: req.params.id,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to delete email template', keyValueTable));
  }
});

/**
 * POST /api/admin/email-templates/:id/test
 * Send test email using template
 */
router.post('/:id/test', protect, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { testEmail, testData = {} } = req.body;

    if (!testEmail) {
      const keyValueTable = { error: 'testEmail is required' };
      return res.status(400).json(ResponseFormatter.failure('Missing test email', keyValueTable));
    }

    // Get template
    const templateResult = await DatabaseUtil.executeQuery(
      'SELECT * FROM email_templates WHERE id = ? AND is_active = TRUE',
      [id]
    );

    if (!templateResult.success || templateResult.data.length === 0) {
      const keyValueTable = { error: 'Template not found or inactive', templateId: id };
      return res.status(404).json(ResponseFormatter.failure('Template not found', keyValueTable));
    }

    const template = templateResult.data[0];
    const templateContent = JSON.parse(template.template_content);

    // Generate test email queue entry
    const emailIdResult = await DatabaseUtil.executeQuery('SELECT get_next_id("EMAIL") as id');
    if (!emailIdResult.success) {
      throw new Error('Failed to generate email ID');
    }
    const emailId = emailIdResult.data[0].id;

    // Create test email content
    const emailContent = {
      html_content: templateContent.html_content || '',
      text_content: templateContent.text_content || '',
      test_mode: true,
      test_data: testData
    };

    // Add to email queue
    const result = await DatabaseUtil.executeQuery(
      `INSERT INTO email_queue (id, to_email, to_name, subject, email_content, template_id, template_data, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        emailId,
        testEmail,
        'Test Recipient',
        `[TEST] ${template.subject}`,
        JSON.stringify(emailContent),
        id,
        JSON.stringify(testData),
        'pending'
      ]
    );

    if (result.success) {
      // Log test email
      logger.info('Test email queued', {
        emailId: emailId,
        templateId: id,
        templateName: template.name,
        testEmail: testEmail,
        sentBy: req.user.id,
        ip: req.ip,
        timestamp: new Date().toISOString()
      });

      const keyValueTable = {
        emailId: emailId,
        templateId: id,
        testEmail: testEmail,
        status: 'queued',
        sentBy: req.user.id,
        queuedAt: new Date().toISOString()
      };

      res.json(ResponseFormatter.success('Test email queued successfully', keyValueTable));
    } else {
      throw new Error('Failed to queue test email');
    }
  } catch (error) {
    logger.error('Send test email error', {
      error: error.message,
      templateId: req.params.id,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to send test email', keyValueTable));
  }
});

module.exports = router;