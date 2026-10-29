/**
 * Email Service
 * Handles sending emails via AWS SES with template support
 * Falls back to console logging when SES is not configured
 */

const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const DatabaseUtil = require('../utils/database');
const db = DatabaseUtil; // executeQuery et al. are static — reference the class, not an instance

let sesClient;
let isConfigured = false;

try {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.AWS_SES_REGION || process.env.AWS_REGION || 'us-east-1';

  if (accessKeyId && secretAccessKey && !accessKeyId.includes('your-aws')) {
    sesClient = new SESClient({
      region,
      credentials: { accessKeyId, secretAccessKey },
    });
    isConfigured = true;
    console.log('✅ AWS SES email service initialized');
  } else {
    console.warn('⚠️  AWS SES not configured (placeholder keys). Emails will be logged to console.');
  }
} catch (err) {
  console.warn('⚠️  AWS SES initialization failed:', err.message);
}

const FROM_EMAIL = process.env.AWS_SES_FROM_EMAIL || 'noreply@yourdomain.com';
const FROM_NAME = process.env.AWS_SES_FROM_NAME || 'Noiraé Store';
const REPLY_TO = process.env.AWS_SES_REPLY_TO_EMAIL || 'support@yourdomain.com';

/**
 * Send a raw email
 * @param {string|string[]} to - Recipient email(s)
 * @param {string} subject - Email subject
 * @param {string} htmlBody - HTML content
 * @param {string} textBody - Plain text fallback
 */
async function sendEmail(to, subject, htmlBody, textBody = '') {
  const recipients = Array.isArray(to) ? to : [to];

  if (!isConfigured) {
    console.log('📧 [EMAIL LOG - SES Not Configured]');
    console.log(`   To: ${recipients.join(', ')}`);
    console.log(`   Subject: ${subject}`);
    console.log(`   Body preview: ${textBody || htmlBody.substring(0, 200)}...`);
    // Dev sink: persist the full email as an HTML file so it can be reviewed
    // (e.g. by the Playwright test harness). Only active when SES is unconfigured.
    try {
      const fs = require('fs');
      const path = require('path');
      const outDir = path.join(__dirname, '..', 'email-outbox');
      fs.mkdirSync(outDir, { recursive: true });
      const slug = (s) => String(s || '').replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 40);
      const fileName = `${Date.now()}_${slug(recipients[0])}_${slug(subject)}.html`;
      const doc = `<!doctype html><html><head><meta charset="utf-8"><title>${subject}</title></head>`
        + `<body style="margin:0"><div style="font:13px/1.5 system-ui,sans-serif;padding:12px 16px;background:#2A2621;color:#F3EBDD">`
        + `<div><b>To:</b> ${recipients.join(', ')}</div><div><b>Subject:</b> ${subject}</div></div>`
        + `<div style="padding:16px">${htmlBody || '<pre>' + (textBody || '') + '</pre>'}</div></body></html>`;
      fs.writeFileSync(path.join(outDir, fileName), doc);
      console.log(`   💾 Saved: email-outbox/${fileName}`);
    } catch (e) {
      console.warn('   (email-outbox write failed:', e.message, ')');
    }
    return { messageId: 'local-log-' + Date.now(), logged: true, savedHtml: true };
  }

  const params = {
    Source: `${FROM_NAME} <${FROM_EMAIL}>`,
    Destination: { ToAddresses: recipients },
    ReplyToAddresses: [REPLY_TO],
    Message: {
      Subject: { Data: subject, Charset: 'UTF-8' },
      Body: {
        Html: { Data: htmlBody, Charset: 'UTF-8' },
        Text: { Data: textBody || subject, Charset: 'UTF-8' },
      },
    },
  };

  try {
    const command = new SendEmailCommand(params);
    const result = await sesClient.send(command);
    console.log(`✅ Email sent to ${recipients.join(', ')} (MessageId: ${result.MessageId})`);
    return { messageId: result.MessageId, logged: false };
  } catch (err) {
    console.error('❌ Email send failed:', err.message);
    throw err;
  }
}

/**
 * Known caller-slug → stored template `name` mismatches. Callers pass
 * hyphenated slugs; the seeded `email_templates.name` values are
 * 'order_confirmation', 'order_shipped' and 'abandoned_cart_1'.
 * Hyphen→underscore normalization covers most, but 'shipping-notification'
 * maps to a differently-named template. Extend here if new ones diverge.
 */
const TEMPLATE_NAME_ALIASES = {
  'shipping-notification': 'order_shipped',
};

/**
 * Send a templated email by loading template from the database
 * @param {string|string[]} to - Recipient email(s)
 * @param {string} templateSlug - Template slug (e.g. 'order-confirmation')
 * @param {Object} variables - Key-value pairs for template interpolation
 */
async function sendTemplatedEmail(to, templateSlug, variables = {}) {
  try {
    // Load template from database. The table has no `slug` column — match on
    // `name`, accepting the raw slug, its underscore form (seeded names use
    // underscores, e.g. 'order_confirmation'), a known alias, or a display
    // name normalized to snake_case (e.g. 'Order Confirmation').
    const underscored = String(templateSlug).replace(/-/g, '_').toLowerCase();
    const aliased = TEMPLATE_NAME_ALIASES[templateSlug] || underscored;
    const result = await db.executeQuery(
      `SELECT * FROM email_templates
        WHERE (name = ? OR name = ? OR name = ? OR LOWER(REPLACE(name, ' ', '_')) IN (?, ?))
          AND is_active = 1
        LIMIT 1`,
      [templateSlug, underscored, aliased, underscored, aliased]
    );
    if (result && result.success === false) {
      throw new Error(result.error || 'email_templates lookup failed');
    }
    const rows = DatabaseUtil.rows(result);
    const template = rows[0];

    if (!template) {
      // Throw (rather than return null) so callers' inline-HTML fallback
      // still sends the email when no DB template matches (e.g. 'password-reset').
      console.warn(`⚠️  Email template '${templateSlug}' not found. Falling back to inline HTML.`);
      throw new Error(`Email template '${templateSlug}' not found`);
    }

    // Content lives in the `template_content` JSON column
    // ({ html_content, text_content, variables }). mysql2 usually returns it
    // pre-parsed; handle a raw JSON string too, then fall back to legacy fields.
    let content = template.template_content;
    if (typeof content === 'string') {
      try {
        content = JSON.parse(content);
      } catch {
        content = { html_content: content };
      }
    }
    content = content && typeof content === 'object' ? content : {};

    // Interpolate variables in subject and body
    let subject = template.subject || '';
    let htmlBody = content.html_content || content.html || template.html_content || template.body || '';
    let textBody = content.text_content || content.text || template.text_content || '';

    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      subject = subject.replace(regex, value);
      htmlBody = htmlBody.replace(regex, value);
      textBody = textBody.replace(regex, value);
    });

    return await sendEmail(to, subject, htmlBody, textBody);
  } catch (err) {
    console.error(`❌ Templated email failed (${templateSlug}):`, err.message);
    throw err;
  }
}

/**
 * Send order confirmation email
 * @param {Object} order - Order object with items and addresses
 */
async function sendOrderConfirmation(order) {
  const email = order.guest_email || order.user_email;
  if (!email) {
    console.warn('⚠️  No email address for order confirmation');
    return null;
  }

  // Build items HTML
  const itemsHtml = (order.items || []).map(item =>
    `<tr>
      <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.product_name}</td>
      <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
      <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">$${parseFloat(item.unit_price).toFixed(2)}</td>
    </tr>`
  ).join('');

  const variables = {
    order_number: order.order_number,
    customer_name: order.customer_name || 'Valued Customer',
    order_date: new Date(order.created_at).toLocaleDateString(),
    items_table: itemsHtml,
    subtotal: parseFloat(order.subtotal).toFixed(2),
    tax: parseFloat(order.tax_amount || 0).toFixed(2),
    shipping: parseFloat(order.shipping_amount || 0).toFixed(2),
    discount: parseFloat(order.discount_amount || 0).toFixed(2),
    total: parseFloat(order.total_amount).toFixed(2),
  };

  // Try template first, fall back to inline HTML
  try {
    return await sendTemplatedEmail(email, 'order-confirmation', variables);
  } catch {
    // Fallback: send inline HTML email
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #333;">Order Confirmation</h1>
        <p>Thank you for your order, ${variables.customer_name}!</p>
        <p>Order #${variables.order_number} placed on ${variables.order_date}</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <thead>
            <tr style="background: #f5f5f5;">
              <th style="padding: 10px; text-align: left;">Product</th>
              <th style="padding: 10px; text-align: center;">Qty</th>
              <th style="padding: 10px; text-align: right;">Price</th>
            </tr>
          </thead>
          <tbody>${variables.items_table}</tbody>
        </table>
        <div style="text-align: right; margin-top: 20px;">
          <p>Subtotal: $${variables.subtotal}</p>
          <p>Tax: $${variables.tax}</p>
          <p>Shipping: $${variables.shipping}</p>
          ${parseFloat(variables.discount) > 0 ? `<p>Discount: -$${variables.discount}</p>` : ''}
          <p style="font-weight: bold; font-size: 18px;">Total: $${variables.total}</p>
        </div>
      </div>
    `;
    return await sendEmail(email, `Order Confirmation #${variables.order_number}`, html);
  }
}

/**
 * Send shipping notification email
 * @param {Object} order - Order object
 * @param {string} trackingNumber - Tracking number
 * @param {string} carrier - Shipping carrier name
 */
async function sendShippingNotification(order, trackingNumber, carrier = 'FedEx') {
  const email = order.guest_email || order.user_email;
  if (!email) return null;

  const variables = {
    order_number: order.order_number,
    customer_name: order.customer_name || 'Valued Customer',
    tracking_number: trackingNumber,
    carrier: carrier,
  };

  try {
    return await sendTemplatedEmail(email, 'shipping-notification', variables);
  } catch {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #333;">Your Order Has Shipped!</h1>
        <p>Hi ${variables.customer_name},</p>
        <p>Your order #${variables.order_number} has been shipped via ${variables.carrier}.</p>
        <p><strong>Tracking Number:</strong> ${variables.tracking_number}</p>
        <p>You can track your package using the tracking number above.</p>
      </div>
    `;
    return await sendEmail(email, `Your Order #${variables.order_number} Has Shipped!`, html);
  }
}

/**
 * Send password reset email
 * @param {string} email - User email
 * @param {string} resetLink - Reset password link
 */
async function sendPasswordReset(email, resetLink) {
  try {
    return await sendTemplatedEmail(email, 'password-reset', { reset_link: resetLink });
  } catch {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #333;">Reset Your Password</h1>
        <p>You requested a password reset. Click the link below to set a new password:</p>
        <p><a href="${resetLink}" style="display: inline-block; padding: 12px 24px; background: #333; color: #fff; text-decoration: none; border-radius: 4px;">Reset Password</a></p>
        <p>This link expires in 1 hour. If you didn't request this, please ignore this email.</p>
      </div>
    `;
    return await sendEmail(email, 'Reset Your Password', html);
  }
}

/**
 * Send a welcome email to a newly registered user.
 * @param {string} email - Recipient email
 * @param {object} data - { name }
 */
async function sendWelcomeEmail(email, data = {}) {
  const name = data.name || 'there';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #333;">Welcome to NodeTexeure, ${name}!</h1>
      <p>Thank you for creating an account. Explore our collection of luxury silk and cashmere bedding.</p>
      <p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/shop" style="display:inline-block;padding:12px 24px;background:#333;color:#fff;text-decoration:none;border-radius:4px;">Start Shopping</a></p>
    </div>`;
  return await sendEmail(email, 'Welcome to NodeTexeure', html);
}

/**
 * Notify a customer that their order status changed.
 * @param {string} email - Recipient email
 * @param {object} data - { orderNumber, status }
 */
async function sendOrderStatusUpdate(email, data = {}) {
  const orderNumber = data.orderNumber || data.order_number || '';
  const status = data.status || 'updated';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #333;">Order Update</h1>
      <p>Your order ${orderNumber ? `#${orderNumber}` : ''} status is now: <strong>${status}</strong>.</p>
    </div>`;
  return await sendEmail(email, `Order ${orderNumber ? `#${orderNumber} ` : ''}Update`, html);
}

/**
 * Send an abandoned-cart reminder email.
 * @param {string} email - Recipient email
 * @param {object} data - { items, cartUrl }
 * @param {number} sequenceStep - Which reminder in the sequence (1..n)
 */
async function sendAbandonedCartEmail(email, data = {}, sequenceStep = 1) {
  const cartUrl = data.cartUrl || `${process.env.FRONTEND_URL || 'http://localhost:3000'}/cart`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #333;">You left something behind</h1>
      <p>Your cart is waiting for you. Complete your purchase before these luxury pieces sell out.</p>
      <p><a href="${cartUrl}" style="display:inline-block;padding:12px 24px;background:#333;color:#fff;text-decoration:none;border-radius:4px;">Return to Cart</a></p>
    </div>`;
  return await sendEmail(email, 'Your cart is waiting', html);
}

/**
 * Alert store operators about low-stock products.
 * @param {string|string[]} recipients - Operator email(s)
 * @param {Array} products - [{ name, sku, stock }]
 */
async function sendLowStockAlert(recipients, products = []) {
  const rows = (products || [])
    .map((p) => `<li>${p.name || p.sku || 'Product'} — ${p.stock ?? p.quantity ?? 0} left</li>`)
    .join('');
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #b91c1c;">Low Stock Alert</h1>
      <ul>${rows || '<li>No product details provided.</li>'}</ul>
    </div>`;
  return await sendEmail(recipients, 'Low Stock Alert', html);
}

/**
 * Alert operators that an email delivery failed.
 * @param {string} email - Operator email
 * @param {object} data - { type, recipient, error }
 */
async function sendEmailFailureAlert(email, data = {}) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #b91c1c;">Email Delivery Failed</h1>
      <p>Type: ${data.type || 'unknown'}</p>
      <p>Intended recipient: ${data.recipient || 'unknown'}</p>
      <p>Error: ${data.error || 'unspecified'}</p>
    </div>`;
  return await sendEmail(email, 'Email Delivery Failure Alert', html);
}

module.exports = {
  isConfigured,
  sendEmail,
  sendTemplatedEmail,
  sendOrderConfirmation,
  sendShippingNotification,
  sendPasswordReset,
  sendWelcomeEmail,
  sendOrderStatusUpdate,
  sendAbandonedCartEmail,
  sendLowStockAlert,
  sendEmailFailureAlert,
};
