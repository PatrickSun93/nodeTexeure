const { SESClient, SendEmailCommand, SendTemplatedEmailCommand } = require('@aws-sdk/client-ses');
const AbandonedCartEmailTemplates = require('./abandonedCartEmailTemplates');
const ErrorUtils = require('../utils/errorUtils');
const logger = require('../utils/logger');

class EmailService {
  constructor() {
    this.sesClient = new SESClient({
      region: process.env.AWS_SES_REGION || process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });

    this.fromEmail = process.env.AWS_SES_FROM_EMAIL || 'noreply@example.com';
    this.fromName = process.env.AWS_SES_FROM_NAME || 'Bed Texture Store';
    this.replyToEmail = process.env.AWS_SES_REPLY_TO_EMAIL || 'support@example.com';
    
    // Initialize enhanced email templates
    this.abandonedCartTemplates = new AbandonedCartEmailTemplates(this.fromName, this.replyToEmail);
  }

  /**
   * Send a simple email with HTML content with enhanced error handling
   * @param {string} to - Recipient email address
   * @param {string} subject - Email subject
   * @param {string} htmlContent - HTML content of the email
   * @param {string} textContent - Plain text content (optional)
   * @returns {Promise<Object>} - SES response
   */
  async sendEmail(to, subject, htmlContent, textContent = null) {
    return await ErrorUtils.retryWithBackoff(
      async () => {
        try {
          // Validate input parameters
          if (!to || !this._isValidEmail(to)) {
            const error = new Error(`Invalid email address: ${to}`);
            error.type = 'validation_error';
            throw error;
          }

          if (!subject || subject.trim().length === 0) {
            const error = new Error('Email subject is required');
            error.type = 'validation_error';
            throw error;
          }

          if (!htmlContent || htmlContent.trim().length === 0) {
            const error = new Error('Email content is required');
            error.type = 'validation_error';
            throw error;
          }

          const params = {
            Source: `${this.fromName} <${this.fromEmail}>`,
            Destination: {
              ToAddresses: [to],
            },
            Message: {
              Subject: {
                Data: subject,
                Charset: 'UTF-8',
              },
              Body: {
                Html: {
                  Data: htmlContent,
                  Charset: 'UTF-8',
                },
              },
            },
            ReplyToAddresses: [this.replyToEmail],
          };

          // Add text content if provided
          if (textContent) {
            params.Message.Body.Text = {
              Data: textContent,
              Charset: 'UTF-8',
            };
          }

          const command = new SendEmailCommand(params);
          const result = await this.sesClient.send(command);
          
          logger.info(`Email sent successfully to ${to}`, {
            messageId: result.MessageId,
            subject: subject,
          });

          return {
            success: true,
            messageId: result.MessageId,
            to: to,
            subject: subject,
          };
        } catch (error) {
          // Enhance error with email-specific context
          const enhancedError = this._enhanceEmailError(error, {
            operation: 'send_email',
            to,
            subject
          });

          ErrorUtils.logError(enhancedError, {
            operation: 'send_email',
            recipient: to,
            subject
          });

          throw enhancedError;
        }
      },
      3, // maxRetries
      2000, // baseDelay
      10000 // maxDelay
    );
  }

  /**
   * Validate email address format
   */
  _isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Enhance email errors with additional context
   */
  _enhanceEmailError(error, context = {}) {
    const enhancedError = new Error(error.message);
    enhancedError.originalError = error;
    enhancedError.context = context;
    enhancedError.timestamp = new Date().toISOString();

    // Set error type based on AWS SES error
    if (error.name) {
      enhancedError.type = `email_${error.name.toLowerCase()}`;
    } else {
      enhancedError.type = 'email_error';
    }

    // Add AWS-specific properties
    enhancedError.code = error.code || error.$metadata?.httpStatusCode;
    enhancedError.requestId = error.$metadata?.requestId;

    // Add user-friendly message
    enhancedError.userMessage = this._getEmailErrorUserMessage(error);

    // Add recovery suggestions
    enhancedError.recoverySuggestions = this._getEmailErrorRecovery(error);

    return enhancedError;
  }

  /**
   * Get user-friendly message for email errors
   */
  _getEmailErrorUserMessage(error) {
    const errorMessages = {
      'MessageRejected': 'Email address is invalid or blocked.',
      'MailFromDomainNotVerified': 'Email service configuration error.',
      'ConfigurationSetDoesNotExist': 'Email service configuration error.',
      'AccountSendingPausedException': 'Email service is temporarily unavailable.',
      'SendingPausedException': 'Email sending is temporarily paused.',
      'Throttling': 'Email service is busy. Please try again later.',
      'ServiceUnavailable': 'Email service is temporarily unavailable.',
      'InternalFailure': 'Email service error. Please try again.'
    };

    const errorType = error.name || error.code || 'unknown';
    return errorMessages[errorType] || 'Failed to send email. Please try again.';
  }

  /**
   * Get recovery suggestions for email errors
   */
  _getEmailErrorRecovery(error) {
    const errorType = error.name || error.code;
    
    const recoveryMap = {
      'MessageRejected': [
        'Check the email address for typos',
        'Verify the recipient email is valid',
        'Contact support if the email should be valid'
      ],
      'Throttling': [
        'Wait a moment before trying again',
        'Reduce email sending frequency'
      ],
      'ServiceUnavailable': [
        'Try again in a few minutes',
        'Check AWS service status',
        'Contact support if urgent'
      ],
      'InternalFailure': [
        'Try again immediately',
        'Contact support if problem persists'
      ]
    };

    return recoveryMap[errorType] || [
      'Try again in a moment',
      'Check your internet connection',
      'Contact support if the problem persists'
    ];
  }

  /**
   * Send order confirmation email
   * @param {string} customerEmail - Customer email address
   * @param {Object} orderData - Order information
   * @returns {Promise<Object>} - Email sending result
   */
  async sendOrderConfirmation(customerEmail, orderData) {
    const subject = `Order Confirmation - Order #${orderData.orderNumber}`;
    const htmlContent = this.renderOrderConfirmationTemplate(orderData);
    const textContent = this.renderOrderConfirmationText(orderData);

    return await this.sendEmail(customerEmail, subject, htmlContent, textContent);
  }

  /**
   * Send order status update email
   * @param {string} customerEmail - Customer email address
   * @param {Object} orderData - Order information with new status
   * @returns {Promise<Object>} - Email sending result
   */
  async sendOrderStatusUpdate(customerEmail, orderData) {
    const subject = `Order Update - Order #${orderData.orderNumber}`;
    const htmlContent = this.renderOrderStatusUpdateTemplate(orderData);
    const textContent = this.renderOrderStatusUpdateText(orderData);

    return await this.sendEmail(customerEmail, subject, htmlContent, textContent);
  }

  /**
   * Send shipping notification email
   * @param {string} customerEmail - Customer email address
   * @param {Object} orderData - Order information with tracking details
   * @returns {Promise<Object>} - Email sending result
   */
  async sendShippingNotification(customerEmail, orderData) {
    const subject = `Your Order Has Shipped - Order #${orderData.orderNumber}`;
    const htmlContent = this.renderShippingNotificationTemplate(orderData);
    const textContent = this.renderShippingNotificationText(orderData);

    return await this.sendEmail(customerEmail, subject, htmlContent, textContent);
  }

  /**
   * Send abandoned cart recovery email
   * @param {string} customerEmail - Customer email address
   * @param {Object} cartData - Cart information
   * @param {number} sequenceStep - Which email in the sequence (1, 2, or 3)
   * @returns {Promise<Object>} - Email sending result
   */
  async sendAbandonedCartEmail(customerEmail, cartData, sequenceStep = 1) {
    const subjects = {
      1: 'You left something in your cart',
      2: 'Still thinking about your purchase?',
      3: 'Last chance - Complete your order'
    };

    const subject = subjects[sequenceStep] || subjects[1];
    const htmlContent = this.abandonedCartTemplates.renderAbandonedCartTemplate(cartData, sequenceStep);
    const textContent = this.abandonedCartTemplates.renderAbandonedCartText(cartData, sequenceStep);

    return await this.sendEmail(customerEmail, subject, htmlContent, textContent);
  }

  /**
   * Send welcome email for new user registration
   * @param {string} customerEmail - Customer email address
   * @param {Object} userData - User information
   * @returns {Promise<Object>} - Email sending result
   */
  async sendWelcomeEmail(customerEmail, userData) {
    const subject = `Welcome to ${this.fromName}!`;
    const htmlContent = this.renderWelcomeTemplate(userData);
    const textContent = this.renderWelcomeText(userData);

    return await this.sendEmail(customerEmail, subject, htmlContent, textContent);
  }

  /**
   * Send email failure alert to admin users
   * @param {string} adminEmail - Admin email address
   * @param {Object} failureData - Email failure information
   * @returns {Promise<Object>} - Email sending result
   */
  async sendEmailFailureAlert(adminEmail, failureData) {
    const subject = `Email System Alert - Failed to send ${failureData.failedEmail.type}`;
    const htmlContent = this.renderEmailFailureAlertTemplate(failureData);
    const textContent = this.renderEmailFailureAlertText(failureData);

    return await this.sendEmail(adminEmail, subject, htmlContent, textContent);
  }

  /**
   * Send low stock alert to admin users
   * @param {Array} adminEmails - Array of admin email addresses
   * @param {Array} lowStockProducts - Array of products with low stock
   * @returns {Promise<Array>} - Array of email sending results
   */
  async sendLowStockAlert(adminEmails, lowStockProducts) {
    const subject = `Low Stock Alert - ${lowStockProducts.length} products need attention`;
    const htmlContent = this.renderLowStockAlertTemplate(lowStockProducts);
    const textContent = this.renderLowStockAlertText(lowStockProducts);

    const results = [];
    for (const adminEmail of adminEmails) {
      try {
        const result = await this.sendEmail(adminEmail, subject, htmlContent, textContent);
        results.push(result);
      } catch (error) {
        results.push({
          success: false,
          error: error.message,
          to: adminEmail,
        });
      }
    }

    return results;
  }

  // Template rendering methods
  renderOrderConfirmationTemplate(orderData) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Order Confirmation</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #f8f9fa; padding: 20px; text-align: center; }
          .order-details { background-color: #fff; border: 1px solid #ddd; padding: 20px; margin: 20px 0; }
          .item { border-bottom: 1px solid #eee; padding: 10px 0; }
          .total { font-weight: bold; font-size: 18px; }
          .footer { text-align: center; color: #666; font-size: 12px; margin-top: 30px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Order Confirmation</h1>
            <p>Thank you for your order!</p>
          </div>
          
          <div class="order-details">
            <h2>Order #${orderData.orderNumber}</h2>
            <p><strong>Order Date:</strong> ${new Date(orderData.createdAt).toLocaleDateString()}</p>
            <p><strong>Total Amount:</strong> $${orderData.totalAmount}</p>
            
            <h3>Items Ordered:</h3>
            ${orderData.items.map(item => `
              <div class="item">
                <strong>${item.name}</strong><br>
                Quantity: ${item.quantity} × $${item.price} = $${(item.quantity * item.price).toFixed(2)}
              </div>
            `).join('')}
            
            <div class="total">
              <p>Total: $${orderData.totalAmount}</p>
            </div>
          </div>
          
          <p>We'll send you another email when your order ships.</p>
          
          <div class="footer">
            <p>Thank you for shopping with ${this.fromName}</p>
            <p>If you have any questions, please contact us at ${this.replyToEmail}</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  renderOrderConfirmationText(orderData) {
    return `
Order Confirmation - Order #${orderData.orderNumber}

Thank you for your order!

Order Details:
- Order Number: ${orderData.orderNumber}
- Order Date: ${new Date(orderData.createdAt).toLocaleDateString()}
- Total Amount: $${orderData.totalAmount}

Items Ordered:
${orderData.items.map(item => `- ${item.name} (Qty: ${item.quantity}) - $${(item.quantity * item.price).toFixed(2)}`).join('\n')}

Total: $${orderData.totalAmount}

We'll send you another email when your order ships.

Thank you for shopping with ${this.fromName}
Questions? Contact us at ${this.replyToEmail}
    `;
  }

  renderOrderStatusUpdateTemplate(orderData) {
    const statusMessages = {
      confirmed: 'Your order has been confirmed and is being processed.',
      processing: 'Your order is currently being prepared for shipment.',
      shipped: 'Your order has been shipped and is on its way!',
      delivered: 'Your order has been delivered.',
      cancelled: 'Your order has been cancelled.',
    };

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Order Status Update</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #f8f9fa; padding: 20px; text-align: center; }
          .status-update { background-color: #d4edda; border: 1px solid #c3e6cb; padding: 20px; margin: 20px 0; border-radius: 5px; }
          .footer { text-align: center; color: #666; font-size: 12px; margin-top: 30px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Order Status Update</h1>
          </div>
          
          <div class="status-update">
            <h2>Order #${orderData.orderNumber}</h2>
            <p><strong>Status:</strong> ${orderData.status.toUpperCase()}</p>
            <p>${statusMessages[orderData.status] || 'Your order status has been updated.'}</p>
            ${orderData.trackingNumber ? `<p><strong>Tracking Number:</strong> ${orderData.trackingNumber}</p>` : ''}
          </div>
          
          <div class="footer">
            <p>Thank you for shopping with ${this.fromName}</p>
            <p>If you have any questions, please contact us at ${this.replyToEmail}</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  renderOrderStatusUpdateText(orderData) {
    const statusMessages = {
      confirmed: 'Your order has been confirmed and is being processed.',
      processing: 'Your order is currently being prepared for shipment.',
      shipped: 'Your order has been shipped and is on its way!',
      delivered: 'Your order has been delivered.',
      cancelled: 'Your order has been cancelled.',
    };

    return `
Order Status Update - Order #${orderData.orderNumber}

Status: ${orderData.status.toUpperCase()}
${statusMessages[orderData.status] || 'Your order status has been updated.'}

${orderData.trackingNumber ? `Tracking Number: ${orderData.trackingNumber}` : ''}

Thank you for shopping with ${this.fromName}
Questions? Contact us at ${this.replyToEmail}
    `;
  }

  renderShippingNotificationTemplate(orderData) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Your Order Has Shipped</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #f8f9fa; padding: 20px; text-align: center; }
          .shipping-info { background-color: #d1ecf1; border: 1px solid #bee5eb; padding: 20px; margin: 20px 0; border-radius: 5px; }
          .tracking-button { background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 10px 0; }
          .footer { text-align: center; color: #666; font-size: 12px; margin-top: 30px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Your Order Has Shipped!</h1>
          </div>
          
          <div class="shipping-info">
            <h2>Order #${orderData.orderNumber}</h2>
            <p><strong>Tracking Number:</strong> ${orderData.trackingNumber}</p>
            <p><strong>Estimated Delivery:</strong> ${orderData.estimatedDelivery || 'Within 3-5 business days'}</p>
            
            ${orderData.trackingUrl ? `<a href="${orderData.trackingUrl}" class="tracking-button">Track Your Package</a>` : ''}
          </div>
          
          <p>Your order is on its way! You can track its progress using the tracking number above.</p>
          
          <div class="footer">
            <p>Thank you for shopping with ${this.fromName}</p>
            <p>If you have any questions, please contact us at ${this.replyToEmail}</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  renderShippingNotificationText(orderData) {
    return `
Your Order Has Shipped! - Order #${orderData.orderNumber}

Tracking Number: ${orderData.trackingNumber}
Estimated Delivery: ${orderData.estimatedDelivery || 'Within 3-5 business days'}

${orderData.trackingUrl ? `Track your package: ${orderData.trackingUrl}` : ''}

Your order is on its way! You can track its progress using the tracking number above.

Thank you for shopping with ${this.fromName}
Questions? Contact us at ${this.replyToEmail}
    `;
  }

  renderAbandonedCartTemplate(cartData, sequenceStep) {
    const messages = {
      1: "We noticed you left some items in your cart. Don't let them get away!",
      2: "Your cart is still waiting for you. Complete your purchase today!",
      3: "This is your last reminder - your cart expires soon!"
    };

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Complete Your Purchase</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #f8f9fa; padding: 20px; text-align: center; }
          .cart-items { background-color: #fff; border: 1px solid #ddd; padding: 20px; margin: 20px 0; }
          .item { border-bottom: 1px solid #eee; padding: 10px 0; }
          .checkout-button { background-color: #28a745; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 20px 0; }
          .footer { text-align: center; color: #666; font-size: 12px; margin-top: 30px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Complete Your Purchase</h1>
            <p>${messages[sequenceStep]}</p>
          </div>
          
          <div class="cart-items">
            <h3>Items in Your Cart:</h3>
            ${cartData.items.map(item => `
              <div class="item">
                <strong>${item.name}</strong><br>
                Quantity: ${item.quantity} × $${item.price} = $${(item.quantity * item.price).toFixed(2)}
              </div>
            `).join('')}
            
            <p><strong>Total: $${cartData.totalAmount}</strong></p>
            
            <a href="${cartData.checkoutUrl}" class="checkout-button">Complete Your Purchase</a>
          </div>
          
          <div class="footer">
            <p>Thank you for considering ${this.fromName}</p>
            <p>If you have any questions, please contact us at ${this.replyToEmail}</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  renderAbandonedCartText(cartData, sequenceStep) {
    const messages = {
      1: "We noticed you left some items in your cart. Don't let them get away!",
      2: "Your cart is still waiting for you. Complete your purchase today!",
      3: "This is your last reminder - your cart expires soon!"
    };

    return `
Complete Your Purchase

${messages[sequenceStep]}

Items in Your Cart:
${cartData.items.map(item => `- ${item.name} (Qty: ${item.quantity}) - $${(item.quantity * item.price).toFixed(2)}`).join('\n')}

Total: $${cartData.totalAmount}

Complete your purchase: ${cartData.checkoutUrl}

Thank you for considering ${this.fromName}
Questions? Contact us at ${this.replyToEmail}
    `;
  }

  renderWelcomeTemplate(userData) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Welcome to ${this.fromName}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #f8f9fa; padding: 20px; text-align: center; }
          .welcome-content { background-color: #fff; padding: 20px; margin: 20px 0; }
          .cta-button { background-color: #007bff; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 20px 0; }
          .footer { text-align: center; color: #666; font-size: 12px; margin-top: 30px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to ${this.fromName}!</h1>
          </div>
          
          <div class="welcome-content">
            <p>Hi ${userData.firstName || 'there'},</p>
            
            <p>Welcome to ${this.fromName}! We're excited to have you as part of our community.</p>
            
            <p>Your account has been successfully created with the email: <strong>${userData.email}</strong></p>
            
            <p>Here's what you can do with your new account:</p>
            <ul>
              <li>Browse our premium bed texture collection</li>
              <li>Save items to your wishlist</li>
              <li>Track your orders</li>
              <li>Manage your account preferences</li>
            </ul>
            
            <a href="${process.env.BASE_URL || 'http://localhost:3000'}/shop" class="cta-button">Start Shopping</a>
          </div>
          
          <div class="footer">
            <p>Thank you for joining ${this.fromName}</p>
            <p>If you have any questions, please contact us at ${this.replyToEmail}</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  renderWelcomeText(userData) {
    return `
Welcome to ${this.fromName}!

Hi ${userData.firstName || 'there'},

Welcome to ${this.fromName}! We're excited to have you as part of our community.

Your account has been successfully created with the email: ${userData.email}

Here's what you can do with your new account:
- Browse our premium bed texture collection
- Save items to your wishlist
- Track your orders
- Manage your account preferences

Start shopping: ${process.env.BASE_URL || 'http://localhost:3000'}/shop

Thank you for joining ${this.fromName}
Questions? Contact us at ${this.replyToEmail}
    `;
  }

  renderLowStockAlertTemplate(lowStockProducts) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Low Stock Alert</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #f8f9fa; padding: 20px; text-align: center; }
          .alert { background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 20px; margin: 20px 0; border-radius: 5px; }
          .product { border-bottom: 1px solid #eee; padding: 10px 0; }
          .footer { text-align: center; color: #666; font-size: 12px; margin-top: 30px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Low Stock Alert</h1>
          </div>
          
          <div class="alert">
            <p><strong>Attention:</strong> The following products are running low on stock and need immediate attention:</p>
            
            ${lowStockProducts.map(product => `
              <div class="product">
                <strong>${product.name}</strong> (ID: ${product.id})<br>
                Current Stock: <strong>${product.currentStock}</strong><br>
                Reorder Point: ${product.reorderPoint}
              </div>
            `).join('')}
          </div>
          
          <p>Please review and restock these items as soon as possible to avoid stockouts.</p>
          
          <div class="footer">
            <p>${this.fromName} Admin System</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  renderLowStockAlertText(lowStockProducts) {
    return `
Low Stock Alert

Attention: The following products are running low on stock and need immediate attention:

${lowStockProducts.map(product => `- ${product.name} (ID: ${product.id}) - Current Stock: ${product.currentStock} (Reorder Point: ${product.reorderPoint})`).join('\n')}

Please review and restock these items as soon as possible to avoid stockouts.

${this.fromName} Admin System
    `;
  }

  renderEmailFailureAlertTemplate(failureData) {
    const { failedEmail, error } = failureData;
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Email System Alert</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #f8d7da; padding: 20px; text-align: center; border: 1px solid #f5c6cb; }
          .alert { background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 20px; margin: 20px 0; border-radius: 5px; }
          .error-details { background-color: #f8f9fa; border: 1px solid #dee2e6; padding: 15px; margin: 10px 0; border-radius: 3px; }
          .footer { text-align: center; color: #666; font-size: 12px; margin-top: 30px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>⚠️ Email System Alert</h1>
            <p>Critical email delivery failure detected</p>
          </div>
          
          <div class="alert">
            <h2>Failed Email Details</h2>
            <div class="error-details">
              <p><strong>Email Type:</strong> ${failedEmail.type.replace('_', ' ').toUpperCase()}</p>
              <p><strong>Recipient:</strong> ${failedEmail.recipient}</p>
              <p><strong>Queue ID:</strong> ${failedEmail.id}</p>
              <p><strong>Retry Count:</strong> ${failedEmail.retryCount}</p>
              <p><strong>Error Time:</strong> ${error.timestamp}</p>
            </div>
            
            <h3>Error Information</h3>
            <div class="error-details">
              <p><strong>Error Type:</strong> ${error.type || 'Unknown'}</p>
              <p><strong>Error Message:</strong> ${error.message}</p>
            </div>
          </div>
          
          <p><strong>Action Required:</strong> Please investigate this email delivery failure and take appropriate action.</p>
          
          <div class="footer">
            <p>${this.fromName} Email System</p>
            <p>This is an automated alert from the email monitoring system</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  renderEmailFailureAlertText(failureData) {
    const { failedEmail, error } = failureData;
    
    return `
Email System Alert - Critical Failure Detected

Failed Email Details:
- Email Type: ${failedEmail.type.replace('_', ' ').toUpperCase()}
- Recipient: ${failedEmail.recipient}
- Queue ID: ${failedEmail.id}
- Retry Count: ${failedEmail.retryCount}
- Error Time: ${error.timestamp}

Error Information:
- Error Type: ${error.type || 'Unknown'}
- Error Message: ${error.message}

Action Required: Please investigate this email delivery failure and take appropriate action.

${this.fromName} Email System
This is an automated alert from the email monitoring system
    `;
  }
}

module.exports = EmailService;