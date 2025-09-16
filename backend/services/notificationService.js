const DatabaseUtil = require('../utils/database');

class NotificationService {
  /**
   * Send product approval notification
   * @param {string} productId - Product ID
   * @param {string} status - approval status (approved/rejected)
   * @param {Object} details - approval details
   */
  static async sendProductApprovalNotification(productId, status, details) {
    try {
      // Get product and creator information
      const productQuery = `
        SELECT p.*, u.email as creator_email, u.first_name, u.last_name
        FROM products p
        LEFT JOIN users u ON p.created_by = u.id
        WHERE p.id = ?
      `;
      
      const productResult = await DatabaseUtil.executeQuery(productQuery, [productId]);
      if (!productResult.success || !productResult.data.length) {
        throw new Error('Product not found');
      }
      
      const product = productResult.data[0];
      
      // Get approver information
      const approverId = details.approved_by || details.rejected_by;
      let approverInfo = null;
      
      if (approverId) {
        const approverResult = await DatabaseUtil.executeQuery(
          'SELECT first_name, last_name, email FROM users WHERE id = ?',
          [approverId]
        );
        if (approverResult.success && approverResult.data.length) {
          approverInfo = approverResult.data[0];
        }
      }
      
      // Prepare email content
      const subject = status === 'approved' 
        ? `Product Approved: ${product.name}`
        : `Product Rejected: ${product.name}`;
        
      const emailContent = this.generateApprovalEmailContent(product, status, details, approverInfo);
      
      // Queue email for sending
      await this.queueEmail({
        to_email: product.creator_email,
        to_name: `${product.first_name} ${product.last_name}`,
        subject,
        email_content: emailContent,
        template_data: {
          product,
          status,
          details,
          approver: approverInfo
        }
      });
      
      return { success: true };
    } catch (error) {
      console.error('Error sending product approval notification:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Generate email content for product approval/rejection
   */
  static generateApprovalEmailContent(product, status, details, approver) {
    const isApproved = status === 'approved';
    const approverName = approver ? `${approver.first_name} ${approver.last_name}` : 'Admin';
    
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: ${isApproved ? '#10B981' : '#EF4444'}; color: white; padding: 20px; text-align: center;">
          <h1>Product ${isApproved ? 'Approved' : 'Rejected'}</h1>
        </div>
        
        <div style="padding: 20px; background-color: #f9f9f9;">
          <h2>Product Details</h2>
          <p><strong>Name:</strong> ${product.name}</p>
          <p><strong>SKU:</strong> ${product.sku}</p>
          <p><strong>Price:</strong> $${product.base_price}</p>
          <p><strong>Status:</strong> ${status.toUpperCase()}</p>
        </div>
        
        <div style="padding: 20px;">
          ${isApproved ? `
            <h3 style="color: #10B981;">Congratulations!</h3>
            <p>Your product has been approved by ${approverName} and is now live on the platform.</p>
            ${details.notes ? `<p><strong>Approval Notes:</strong> ${details.notes}</p>` : ''}
          ` : `
            <h3 style="color: #EF4444;">Product Needs Attention</h3>
            <p>Your product has been rejected by ${approverName}. Please review the feedback below and resubmit.</p>
            <p><strong>Rejection Reason:</strong> ${details.rejection_reason?.replace('_', ' ')}</p>
            ${details.notes ? `<p><strong>Additional Notes:</strong> ${details.notes}</p>` : ''}
            <p>You can edit and resubmit your product through the admin dashboard.</p>
          `}
        </div>
        
        <div style="padding: 20px; background-color: #f3f4f6; text-align: center;">
          <p style="margin: 0; color: #6b7280;">
            This is an automated notification from the Bed Texture E-commerce Platform.
          </p>
        </div>
      </div>
    `;
    
    const textContent = `
Product ${isApproved ? 'Approved' : 'Rejected'}

Product Details:
- Name: ${product.name}
- SKU: ${product.sku}
- Price: $${product.base_price}
- Status: ${status.toUpperCase()}

${isApproved ? `
Congratulations! Your product has been approved by ${approverName} and is now live on the platform.
${details.notes ? `Approval Notes: ${details.notes}` : ''}
` : `
Your product has been rejected by ${approverName}. Please review the feedback below and resubmit.

Rejection Reason: ${details.rejection_reason?.replace('_', ' ')}
${details.notes ? `Additional Notes: ${details.notes}` : ''}

You can edit and resubmit your product through the admin dashboard.
`}

This is an automated notification from the Bed Texture E-commerce Platform.
    `;
    
    return {
      html_content: htmlContent,
      text_content: textContent,
      priority: 'normal'
    };
  }
  
  /**
   * Queue email for sending
   */
  static async queueEmail(emailData) {
    try {
      const idResult = await DatabaseUtil.executeQuery('SELECT get_next_id("EMAIL") as id');
      if (!idResult.success) throw new Error(idResult.error);
      const id = idResult.data[0].id;
      
      const insertResult = await DatabaseUtil.executeQuery(
        `INSERT INTO email_queue (id, to_email, to_name, subject, email_content, template_data, status, scheduled_at) 
         VALUES (?, ?, ?, ?, ?, ?, 'pending', NOW())`,
        [
          id,
          emailData.to_email,
          emailData.to_name,
          emailData.subject,
          JSON.stringify(emailData.email_content),
          JSON.stringify(emailData.template_data || {})
        ]
      );
      
      if (!insertResult.success) throw new Error(insertResult.error);
      
      return { success: true, emailId: id };
    } catch (error) {
      console.error('Error queuing email:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Send low stock alert to admin users
   */
  static async sendLowStockAlert(products) {
    try {
      // Get admin users
      const adminResult = await DatabaseUtil.executeQuery(
        'SELECT email, first_name, last_name FROM users WHERE role = "admin" AND status = "active"'
      );
      
      if (!adminResult.success || !adminResult.data.length) {
        return { success: false, error: 'No admin users found' };
      }
      
      const subject = `Low Stock Alert - ${products.length} Product(s) Need Restocking`;
      const emailContent = this.generateLowStockEmailContent(products);
      
      // Send to all admin users
      for (const admin of adminResult.data) {
        await this.queueEmail({
          to_email: admin.email,
          to_name: `${admin.first_name} ${admin.last_name}`,
          subject,
          email_content: emailContent,
          template_data: { products }
        });
      }
      
      return { success: true };
    } catch (error) {
      console.error('Error sending low stock alert:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Generate low stock alert email content
   */
  static generateLowStockEmailContent(products) {
    const productList = products.map(p => 
      `- ${p.product_name} (${p.variant_info || 'Base Product'}): ${p.quantity_available} remaining (Reorder at: ${p.reorder_point})`
    ).join('\n');
    
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #F59E0B; color: white; padding: 20px; text-align: center;">
          <h1>Low Stock Alert</h1>
        </div>
        
        <div style="padding: 20px;">
          <p>The following products are running low on stock and need to be restocked:</p>
          
          <div style="background-color: #FEF3C7; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <h3 style="color: #92400E; margin-top: 0;">Products Needing Attention:</h3>
            <ul style="color: #92400E;">
              ${products.map(p => `
                <li style="margin-bottom: 10px;">
                  <strong>${p.product_name}</strong>
                  ${p.variant_info ? `<br><em>Variant: ${p.variant_info}</em>` : ''}
                  <br>Current Stock: <strong>${p.quantity_available}</strong>
                  <br>Reorder Point: ${p.reorder_point}
                  <br>Suggested Reorder Quantity: ${p.reorder_quantity}
                </li>
              `).join('')}
            </ul>
          </div>
          
          <p>Please review and restock these items to avoid stockouts.</p>
        </div>
        
        <div style="padding: 20px; background-color: #f3f4f6; text-align: center;">
          <p style="margin: 0; color: #6b7280;">
            This is an automated alert from the Bed Texture E-commerce Platform.
          </p>
        </div>
      </div>
    `;
    
    const textContent = `
Low Stock Alert

The following products are running low on stock and need to be restocked:

${productList}

Please review and restock these items to avoid stockouts.

This is an automated alert from the Bed Texture E-commerce Platform.
    `;
    
    return {
      html_content: htmlContent,
      text_content: textContent,
      priority: 'high'
    };
  }
}

module.exports = NotificationService;