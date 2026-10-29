/**
 * Email Queue Producer
 * Inserts emails into the `email_queue` table for the daemon consumer to pick up.
 * Supports both template-based and raw emails.
 */

const { randomUUID: uuidv4 } = require('crypto');
const DatabaseUtil = require('../utils/database');
const { isMarketingCategory, isEmailSuppressed } = require('../utils/emailSuppression');

/**
 * Enqueue an email using a named template from `email_templates`.
 * Looks up the template, interpolates variables into subject, then inserts into `email_queue`.
 *
 * @param {string} toEmail - Recipient email address
 * @param {string} toName - Recipient display name
 * @param {string} templateName - Template name (e.g. 'order_confirmation', 'welcome_user')
 * @param {Object} variables - Key-value pairs for template variable interpolation
 * @param {Date|null} scheduledAt - Optional future send time (null = send ASAP)
 * @returns {Object} { id, queued: true } or { queued: false, reason }
 */
async function enqueue(toEmail, toName, templateName, variables = {}, scheduledAt = null) {
  try {
    // Suppression gate — only for MARKETING templates (abandoned/newsletter/promo/…).
    // Transactional templates (order_confirmation, welcome_user, email_verification,
    // password_reset, …) are never gated so they always send. Fail-open by design:
    // isEmailSuppressed() returns false on any DB error, so a check failure can never
    // block a send.
    if (isMarketingCategory(templateName) && (await isEmailSuppressed(toEmail))) {
      console.log(`🔕 Suppressed marketing email '${templateName}' → ${toEmail} (recipient unsubscribed).`);
      return { queued: false, reason: 'recipient_unsubscribed' };
    }

    // Look up the template by name
    const result = await DatabaseUtil.executeQuery(
      'SELECT * FROM email_templates WHERE name = ? AND is_active = 1',
      [templateName]
    );

    if (!result.success || !result.data || result.data.length === 0) {
      console.warn(`⚠️  Email template '${templateName}' not found or inactive. Skipping enqueue.`);
      return { queued: false, reason: `Template '${templateName}' not found` };
    }

    const template = result.data[0];

    // Parse template_content JSON if string
    let templateContent = template.template_content;
    if (typeof templateContent === 'string') {
      try { templateContent = JSON.parse(templateContent); } catch { templateContent = {}; }
    }

    // Interpolate variables into subject
    let subject = template.subject;
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      subject = subject.replace(regex, String(value));
    });

    // Build email_content JSON (the daemon will do full interpolation when sending)
    const emailContent = {
      html_content: templateContent.html_content || '',
      text_content: templateContent.text_content || '',
      priority: 'normal',
    };

    const id = uuidv4();
    await DatabaseUtil.executeQuery(
      `INSERT INTO email_queue 
        (id, to_email, to_name, subject, email_content, template_id, template_data, status, attempts, max_attempts, scheduled_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, 3, COALESCE(?, NOW()))`,
      [
        id,
        toEmail,
        toName || '',
        subject,
        JSON.stringify(emailContent),
        template.id,
        JSON.stringify(variables),
        scheduledAt,
      ]
    );

    console.log(`📧 Enqueued email: "${subject}" → ${toEmail} (template: ${templateName})`);
    return { id, queued: true };
  } catch (err) {
    console.error('❌ Failed to enqueue email:', err.message);
    return { queued: false, reason: err.message };
  }
}

/**
 * Enqueue a raw email without a template.
 *
 * @param {string} toEmail - Recipient email address
 * @param {string} toName - Recipient display name
 * @param {string} subject - Email subject
 * @param {string} htmlContent - HTML body
 * @param {string} textContent - Plain text body
 * @param {Date|null} scheduledAt - Optional future send time
 * @returns {Object} { id, queued: true }
 */
async function enqueueRaw(toEmail, toName, subject, htmlContent, textContent = '', scheduledAt = null) {
  try {
    const id = uuidv4();
    const emailContent = {
      html_content: htmlContent,
      text_content: textContent,
      priority: 'normal',
    };

    await DatabaseUtil.executeQuery(
      `INSERT INTO email_queue 
        (id, to_email, to_name, subject, email_content, status, attempts, max_attempts, scheduled_at)
       VALUES (?, ?, ?, ?, ?, 'pending', 0, 3, COALESCE(?, NOW()))`,
      [id, toEmail, toName || '', subject, JSON.stringify(emailContent), scheduledAt]
    );

    console.log(`📧 Enqueued raw email: "${subject}" → ${toEmail}`);
    return { id, queued: true };
  } catch (err) {
    console.error('❌ Failed to enqueue raw email:', err.message);
    return { queued: false, reason: err.message };
  }
}

module.exports = { enqueue, enqueueRaw };
