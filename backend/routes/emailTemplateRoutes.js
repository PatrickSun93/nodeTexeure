const express = require('express');
const router = express.Router();
const DatabaseUtil = require('../utils/database');
const ResponseFormatter = require('../utils/responseFormatter');
const { csrfProtection } = require('../middleware/csrfMiddleware');

// Valid fields for updates
const VALID_FIELDS = ['name', 'subject', 'category', 'type', 'status', 'preheader', 'template_content'];

/**
 * GET /api/admin/email-templates
 * List all email templates
 */
router.get('/', async (req, res) => {
    try {
        const listResult = await DatabaseUtil.executeQuery(
            'SELECT id, name, subject, category, type, status, preheader, updated_at, created_at, is_active FROM email_templates ORDER BY updated_at DESC'
        );

        if (!listResult.success) {
            throw new Error(listResult.error);
        }

        // Format for frontend
        const templates = listResult.data.map(t => ({
            id: t.id,
            name: t.name,
            subject: t.subject,
            category: t.category,
            type: t.type,
            status: t.status || (t.is_active ? 'Active' : 'Inactive'), // Fallback
            preheader: t.preheader,
            lastEdited: t.updated_at, // Frontend expects this key or we map it there. Using updated_at is standard backend.
            updated_at: t.updated_at,
            created_at: t.created_at
            // Note: We don't send full content in list view for performance
        }));

        res.json(ResponseFormatter.success('Email templates fetched successfully', templates));
    } catch (error) {
        console.error('Error fetching email templates:', error);
        res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
    }
});

/**
 * GET /api/admin/email-templates/:id
 * Get a single email template by ID
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await DatabaseUtil.executeQuery('SELECT * FROM email_templates WHERE id = ?', [id]);

        if (!result.success) {
            throw new Error(result.error);
        }

        if (result.data.length === 0) {
            return res.status(404).json(ResponseFormatter.failure('Template not found'));
        }

        const template = result.data[0];
        // Parse JSON content if it's a string (MySQL driver usually handles this if column is JSON)
        // But checking just in case
        if (typeof template.template_content === 'string') {
            try {
                template.template_content = JSON.parse(template.template_content);
            } catch (e) {
                console.warn('Failed to parse template_content JSON', e);
            }
        }

        res.json(ResponseFormatter.success('Template details fetched successfully', [template]));
    } catch (error) {
        console.error(`Error fetching template ${req.params.id}:`, error);
        res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
    }
});

/**
 * POST /api/admin/email-templates
 * Create a new email template
 */
router.post('/', csrfProtection, async (req, res) => {
    try {
        const { name, subject, category, type, preheader, content } = req.body;

        if (!name || !subject) {
            return res.status(400).json(ResponseFormatter.failure('Name and Subject are required'));
        }

        // Generate ID
        const idResult = await DatabaseUtil.executeQuery('SELECT get_next_id("EMAIL") as id');
        if (!idResult.success) throw new Error(idResult.error);
        const id = idResult.data[0].id;

        // Default values
        const status = 'Draft';
        const isActive = 1;
        const templateContent = content ? JSON.stringify(content) : JSON.stringify({});

        const query = `
      INSERT INTO email_templates 
      (id, name, subject, category, type, status, preheader, template_content, is_active) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

        const insertResult = await DatabaseUtil.executeQuery(query, [
            id, name, subject, category || null, type || null, status, preheader || null, templateContent, isActive
        ]);

        if (!insertResult.success) {
            throw new Error(insertResult.error);
        }

        res.status(201).json(ResponseFormatter.success('Template created successfully', [{ id }]));
    } catch (error) {
        console.error('Error creating template:', error);
        // Determine if it looks like a duplicate
        if (error.message && error.message.includes('Duplicate entry')) {
            return res.status(409).json(ResponseFormatter.failure('A template with this name already exists'));
        }
        res.status(500).json(ResponseFormatter.failure('Failed to create template', { error: error.message }));
    }
});

/**
 * PUT /api/admin/email-templates/:id
 * Update a template
 */
router.put('/:id', csrfProtection, async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        // Filter updates to valid fields
        const fields = [];
        const values = [];

        // Special handling for content which maps to 'template_content'
        if (updates.content !== undefined) {
            fields.push('template_content = ?');
            values.push(JSON.stringify(updates.content));
        }

        for (const key of Object.keys(updates)) {
            if (VALID_FIELDS.includes(key)) {
                if (key === 'template_content') continue; // handled above as 'content' map or direct
                fields.push(`${key} = ?`);
                values.push(updates[key]);
            }
        }

        // Explicit mappings if they come in without matching db column names exactly?
        // The frontend sends camelCase usually, so let's be robust.

        // Always update updated_at
        fields.push('updated_at = NOW()');

        if (fields.length === 1) { // Only updated_at
            return res.json(ResponseFormatter.success('No changes to save'));
        }

        values.push(id);

        const query = `UPDATE email_templates SET ${fields.join(', ')} WHERE id = ?`;
        const result = await DatabaseUtil.executeQuery(query, values);

        if (!result.success) {
            throw new Error(result.error);
        }

        if (result.affectedRows === 0) {
            return res.status(404).json(ResponseFormatter.failure('Template not found'));
        }

        res.json(ResponseFormatter.success('Template updated successfully'));
    } catch (error) {
        console.error(`Error updating template ${req.params.id}:`, error);
        res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
    }
});

/**
 * DELETE /api/admin/email-templates/:id
 * Delete a template
 */
router.delete('/:id', csrfProtection, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await DatabaseUtil.executeQuery('DELETE FROM email_templates WHERE id = ?', [id]);

        if (!result.success) {
            throw new Error(result.error);
        }

        if (result.affectedRows === 0) {
            return res.status(404).json(ResponseFormatter.failure('Template not found'));
        }

        res.json(ResponseFormatter.success('Template deleted successfully'));
    } catch (error) {
        console.error(`Error deleting template ${req.params.id}:`, error);
        res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
    }
});

module.exports = router;
