/**
 * Email Daemon — Consumer Process
 *
 * Standalone Node.js process that polls the `email_queue` table
 * and sends pending emails via AWS SES (or console fallback).
 *
 * Usage:
 *   node services/emailDaemon.js
 *   npm run email-daemon
 *
 * Environment: Reads from backend/.env via dotenv
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const DatabaseUtil = require('../utils/database');
const emailService = require('./emailService');

// Configuration
const POLL_INTERVAL_MS = parseInt(process.env.EMAIL_DAEMON_POLL_MS) || 5000; // 5 seconds
const BATCH_SIZE = parseInt(process.env.EMAIL_DAEMON_BATCH_SIZE) || 10;

let isRunning = true;
let pollTimer = null;
let activeProcessing = false;

console.log('===========================================');
console.log('📨 Email Daemon Starting...');
console.log(`   Poll interval: ${POLL_INTERVAL_MS}ms`);
console.log(`   Batch size: ${BATCH_SIZE}`);
console.log(`   SES configured: ${emailService.isConfigured}`);
console.log('===========================================');

/**
 * Interpolate template variables into content string
 */
function interpolate(content, variables) {
  if (!content) return '';
  let result = content;
  Object.entries(variables).forEach(([key, value]) => {
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
    result = result.replace(regex, String(value ?? ''));
  });
  return result;
}

/**
 * Process a single email queue item
 */
async function processEmail(item) {
  const emailId = item.id;

  try {
    // Mark as processing to prevent double-pickup
    await DatabaseUtil.executeQuery(
      "UPDATE email_queue SET status = 'processing' WHERE id = ? AND status = 'pending'",
      [emailId]
    );

    // Parse stored JSON fields
    let emailContent = item.email_content;
    if (typeof emailContent === 'string') {
      try { emailContent = JSON.parse(emailContent); } catch { emailContent = {}; }
    }

    let templateData = item.template_data;
    if (typeof templateData === 'string') {
      try { templateData = JSON.parse(templateData); } catch { templateData = {}; }
    }

    let htmlBody = emailContent.html_content || '';
    let textBody = emailContent.text_content || '';
    let subject = item.subject;

    // If there's a template_id, load fresh template content and interpolate
    if (item.template_id && templateData && Object.keys(templateData).length > 0) {
      const templateResult = await DatabaseUtil.executeQuery(
        'SELECT * FROM email_templates WHERE id = ?',
        [item.template_id]
      );

      const template = templateResult.success && templateResult.data.length > 0
        ? templateResult.data[0]
        : null;

      if (template) {
        let templateContent = template.template_content;
        if (typeof templateContent === 'string') {
          try { templateContent = JSON.parse(templateContent); } catch { templateContent = {}; }
        }

        // Use template HTML/text as base, interpolate variables
        htmlBody = interpolate(templateContent.html_content || htmlBody, templateData);
        textBody = interpolate(templateContent.text_content || textBody, templateData);
        subject = interpolate(subject, templateData);
      }
    } else if (templateData && Object.keys(templateData).length > 0) {
      // No template_id but has variables — interpolate raw content
      htmlBody = interpolate(htmlBody, templateData);
      textBody = interpolate(textBody, templateData);
      subject = interpolate(subject, templateData);
    }

    // Send the email
    const result = await emailService.sendEmail(item.to_email, subject, htmlBody, textBody);

    // Mark as sent
    const processingDetails = {
      delivery_info: result.logged ? 'Logged to console (SES not configured)' : `SES MessageId: ${result.messageId}`,
      sent_by: 'email-daemon',
      sent_timestamp: new Date().toISOString(),
    };

    await DatabaseUtil.executeQuery(
      "UPDATE email_queue SET status = 'sent', sent_at = NOW(), attempts = attempts + 1, processing_details = ? WHERE id = ?",
      [JSON.stringify(processingDetails), emailId]
    );

    console.log(`✅ [${emailId}] Sent: "${subject}" → ${item.to_email}`);
    return true;
  } catch (err) {
    console.error(`❌ [${emailId}] Failed: ${err.message}`);

    // Increment attempts, set error details
    const attempts = (item.attempts || 0) + 1;
    const maxAttempts = item.max_attempts || 3;
    const newStatus = attempts >= maxAttempts ? 'failed' : 'pending';

    const processingDetails = {
      error_message: err.message,
      failed_at: new Date().toISOString(),
      attempt_number: attempts,
    };

    await DatabaseUtil.executeQuery(
      'UPDATE email_queue SET status = ?, attempts = ?, processing_details = ? WHERE id = ?',
      [newStatus, attempts, JSON.stringify(processingDetails), emailId]
    );

    if (newStatus === 'failed') {
      console.error(`💀 [${emailId}] Permanently failed after ${attempts} attempts`);
    } else {
      console.log(`🔄 [${emailId}] Will retry (attempt ${attempts}/${maxAttempts})`);
    }

    return false;
  }
}

/**
 * Poll the email queue for pending items and process them
 */
async function pollQueue() {
  if (!isRunning || activeProcessing) return;
  activeProcessing = true;

  try {
    // Fetch pending emails that are ready to send
    const result = await DatabaseUtil.executeQuery(
      `SELECT * FROM email_queue 
       WHERE status = 'pending' AND scheduled_at <= NOW() AND attempts < max_attempts
       ORDER BY scheduled_at ASC
       LIMIT ?`,
      [BATCH_SIZE]
    );

    if (!result.success || !result.data || result.data.length === 0) {
      activeProcessing = false;
      return;
    }

    const pendingEmails = result.data;
    console.log(`📬 Processing ${pendingEmails.length} pending email(s)...`);

    // Process each email sequentially to avoid overwhelming SES
    let sent = 0;
    let failed = 0;
    for (const item of pendingEmails) {
      if (!isRunning) break;
      const success = await processEmail(item);
      if (success) sent++;
      else failed++;
    }

    console.log(`📊 Batch complete: ${sent} sent, ${failed} failed`);
  } catch (err) {
    console.error('❌ Poll cycle error:', err.message);
  } finally {
    activeProcessing = false;
  }
}

/**
 * Start the daemon poll loop
 */
function start() {
  console.log('🚀 Email Daemon is now running...\n');

  // Initial poll
  pollQueue();

  // Set up interval
  pollTimer = setInterval(pollQueue, POLL_INTERVAL_MS);
}

/**
 * Graceful shutdown
 */
function shutdown(signal) {
  console.log(`\n⏹️  Received ${signal}. Shutting down email daemon...`);
  isRunning = false;

  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  // Wait for any active processing to complete
  const waitForCompletion = setInterval(() => {
    if (!activeProcessing) {
      clearInterval(waitForCompletion);
      console.log('👋 Email Daemon stopped gracefully.');
      process.exit(0);
    }
  }, 500);

  // Force exit after 10 seconds
  setTimeout(() => {
    console.log('⚠️  Force stopping email daemon.');
    process.exit(1);
  }, 10000);
}

// Handle graceful shutdown signals
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught exception in email daemon:', err);
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  console.error('💥 Unhandled rejection in email daemon:', reason);
});

// Start the daemon
start();
