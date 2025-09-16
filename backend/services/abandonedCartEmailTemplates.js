/**
 * Enhanced abandoned cart email templates
 * Provides sophisticated email templates for the 3-step abandoned cart recovery sequence
 */

class AbandonedCartEmailTemplates {
  constructor(fromName = 'Bed Texture Store', replyToEmail = 'support@example.com') {
    this.fromName = fromName;
    this.replyToEmail = replyToEmail;
  }

  /**
   * Generate enhanced abandoned cart email template
   * @param {Object} cartData - Cart data including items, total, customer info
   * @param {number} sequenceStep - Email sequence step (1, 2, or 3)
   * @returns {string} HTML email template
   */
  renderAbandonedCartTemplate(cartData, sequenceStep) {
    const messages = {
      1: {
        title: "You left something in your cart",
        message: "We noticed you left some items in your cart. Don't let them get away!",
        urgency: "low",
        cta: "Complete Your Purchase"
      },
      2: {
        title: "Still thinking about your purchase?",
        message: "Your cart is still waiting for you. These premium bed textures are popular and may sell out soon!",
        urgency: "medium", 
        cta: "Secure Your Items Now"
      },
      3: {
        title: "Last chance - Complete your order",
        message: "This is your final reminder! Your cart will expire soon and these items may no longer be available.",
        urgency: "high",
        cta: "Complete Purchase Before It's Too Late"
      }
    };

    const stepData = messages[sequenceStep] || messages[1];
    const urgencyColors = {
      low: '#28a745',
      medium: '#ffc107', 
      high: '#dc3545'
    };

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>${stepData.title}</title>
        <style>
          body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            line-height: 1.6; 
            color: #333; 
            margin: 0; 
            padding: 0;
            background-color: #f8f9fa;
          }
          .container { 
            max-width: 600px; 
            margin: 0 auto; 
            background-color: white;
            box-shadow: 0 0 10px rgba(0,0,0,0.1);
          }
          .header { 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px 20px; 
            text-align: center; 
          }
          .header h1 {
            margin: 0;
            font-size: 24px;
            font-weight: 300;
          }
          .header p {
            margin: 10px 0 0 0;
            font-size: 16px;
            opacity: 0.9;
          }
          .cart-items { 
            padding: 30px 20px; 
          }
          .cart-summary {
            background-color: #f8f9fa;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 25px;
          }
          .item { 
            border-bottom: 1px solid #eee; 
            padding: 15px 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .item:last-child {
            border-bottom: none;
          }
          .item-details {
            flex: 1;
          }
          .item-name {
            font-weight: 600;
            color: #333;
            margin-bottom: 5px;
          }
          .item-variant {
            font-size: 14px;
            color: #666;
            margin-bottom: 5px;
          }
          .item-price {
            font-weight: 600;
            color: #28a745;
          }
          .total-section {
            border-top: 2px solid #eee;
            padding-top: 15px;
            text-align: right;
          }
          .total-amount {
            font-size: 24px;
            font-weight: 700;
            color: #333;
          }
          .checkout-button { 
            background-color: ${urgencyColors[stepData.urgency]};
            color: white; 
            padding: 18px 35px; 
            text-decoration: none; 
            border-radius: 8px; 
            display: inline-block; 
            margin: 25px 0;
            font-weight: 600;
            font-size: 16px;
            text-align: center;
            width: 100%;
            box-sizing: border-box;
            transition: all 0.3s ease;
          }
          .checkout-button:hover {
            opacity: 0.9;
            transform: translateY(-2px);
          }
          .urgency-banner {
            background-color: ${urgencyColors[stepData.urgency]};
            color: white;
            padding: 10px 20px;
            text-align: center;
            font-weight: 600;
            ${sequenceStep === 3 ? 'animation: pulse 2s infinite;' : ''}
          }
          @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.7; }
            100% { opacity: 1; }
          }
          .benefits {
            background-color: #e8f5e8;
            border-left: 4px solid #28a745;
            padding: 15px;
            margin: 20px 0;
          }
          .benefits ul {
            margin: 0;
            padding-left: 20px;
          }
          .benefits li {
            margin-bottom: 5px;
          }
          .footer { 
            background-color: #f8f9fa;
            text-align: center; 
            color: #666; 
            font-size: 12px; 
            padding: 20px;
            border-top: 1px solid #eee;
          }
          .social-proof {
            text-align: center;
            padding: 20px;
            background-color: #fff3cd;
            border-radius: 8px;
            margin: 20px 0;
          }
          .customer-service {
            text-align: center;
            padding: 15px;
            background-color: #d1ecf1;
            border-radius: 8px;
            margin: 20px 0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          ${sequenceStep >= 2 ? `<div class="urgency-banner">${sequenceStep === 3 ? '⚠️ FINAL NOTICE' : '⏰ LIMITED TIME'}</div>` : ''}
          
          <div class="header">
            <h1>${stepData.title}</h1>
            <p>Hi ${cartData.customerName || 'there'}!</p>
            <p>${stepData.message}</p>
          </div>
          
          <div class="cart-items">
            <div class="cart-summary">
              <h3 style="margin-top: 0; color: #333;">Your Selected Items:</h3>
              ${cartData.items.map(item => `
                <div class="item">
                  <div class="item-details">
                    <div class="item-name">${item.name}</div>
                    ${item.variant_details ? `<div class="item-variant">${item.variant_details.size ? `Size: ${item.variant_details.size}` : ''} ${item.variant_details.color ? `• Color: ${item.variant_details.color}` : ''} ${item.variant_details.pattern ? `• Pattern: ${item.variant_details.pattern}` : ''}</div>` : ''}
                    <div>Quantity: ${item.quantity}</div>
                  </div>
                  <div class="item-price">$${(item.quantity * parseFloat(item.price)).toFixed(2)}</div>
                </div>
              `).join('')}
              
              <div class="total-section">
                <div class="total-amount">Total: $${cartData.totalAmount}</div>
              </div>
            </div>
            
            <div style="text-align: center;">
              <a href="${cartData.checkoutUrl}" class="checkout-button">${stepData.cta}</a>
            </div>

            ${sequenceStep === 1 ? `
              <div class="benefits">
                <h4 style="margin-top: 0;">Why choose our premium bed textures?</h4>
                <ul>
                  <li>✓ Premium quality materials</li>
                  <li>✓ Free shipping on orders over $75</li>
                  <li>✓ 30-day satisfaction guarantee</li>
                  <li>✓ Easy returns and exchanges</li>
                </ul>
              </div>
            ` : ''}

            ${sequenceStep === 2 ? `
              <div class="social-proof">
                <h4 style="margin-top: 0;">⭐⭐⭐⭐⭐ Loved by thousands of customers</h4>
                <p><em>"The quality exceeded my expectations. My bedroom feels like a luxury hotel!"</em></p>
                <p><strong>- Sarah M., Verified Customer</strong></p>
              </div>
            ` : ''}

            ${sequenceStep === 3 ? `
              <div class="social-proof" style="background-color: #fff3cd; border: 2px solid #ffc107;">
                <h4 style="margin-top: 0; color: #856404;">⚠️ Don't miss out!</h4>
                <p style="color: #856404;"><strong>These items are popular and stock is limited. Complete your purchase now to avoid disappointment.</strong></p>
              </div>
            ` : ''}

            <div class="customer-service">
              <h4 style="margin-top: 0;">Need help with your order?</h4>
              <p>Our customer service team is here to help! Contact us at ${this.replyToEmail} or call 1-800-BED-TEXTURE</p>
            </div>
          </div>
          
          <div class="footer">
            <p>Thank you for considering ${this.fromName}</p>
            <p>You're receiving this email because you have items in your shopping cart.</p>
            <p>If you no longer wish to receive these reminders, <a href="${cartData.checkoutUrl}&unsubscribe=${cartData.recoveryToken || 'token'}">click here</a></p>
            <p>${this.fromName} • Premium Bed Textures • ${this.replyToEmail}</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generate text version of abandoned cart email
   * @param {Object} cartData - Cart data
   * @param {number} sequenceStep - Email sequence step
   * @returns {string} Plain text email content
   */
  renderAbandonedCartText(cartData, sequenceStep) {
    const messages = {
      1: "We noticed you left some items in your cart. Don't let them get away!",
      2: "Your cart is still waiting for you. These premium bed textures are popular and may sell out soon!",
      3: "This is your final reminder! Your cart will expire soon and these items may no longer be available."
    };

    const ctas = {
      1: "Complete Your Purchase",
      2: "Secure Your Items Now", 
      3: "Complete Purchase Before It's Too Late"
    };

    return `
${sequenceStep >= 2 ? (sequenceStep === 3 ? '⚠️ FINAL NOTICE' : '⏰ LIMITED TIME') + '\n\n' : ''}Hi ${cartData.customerName || 'there'}!

${messages[sequenceStep]}

Your Selected Items:
${cartData.items.map(item => `- ${item.name}${item.variant_details ? ` (${item.variant_details.size ? `Size: ${item.variant_details.size}` : ''}${item.variant_details.color ? ` • Color: ${item.variant_details.color}` : ''}${item.variant_details.pattern ? ` • Pattern: ${item.variant_details.pattern}` : ''})` : ''} - Qty: ${item.quantity} - $${(item.quantity * parseFloat(item.price)).toFixed(2)}`).join('\n')}

Total: $${cartData.totalAmount}

${ctas[sequenceStep]}: ${cartData.checkoutUrl}

${sequenceStep === 1 ? `
Why choose our premium bed textures?
✓ Premium quality materials
✓ Free shipping on orders over $75
✓ 30-day satisfaction guarantee
✓ Easy returns and exchanges
` : ''}

${sequenceStep === 2 ? `
⭐⭐⭐⭐⭐ Loved by thousands of customers
"The quality exceeded my expectations. My bedroom feels like a luxury hotel!"
- Sarah M., Verified Customer
` : ''}

${sequenceStep === 3 ? `
⚠️ Don't miss out!
These items are popular and stock is limited. Complete your purchase now to avoid disappointment.
` : ''}

Need help with your order?
Our customer service team is here to help! Contact us at ${this.replyToEmail} or call 1-800-BED-TEXTURE

Thank you for considering ${this.fromName}
You're receiving this email because you have items in your shopping cart.
If you no longer wish to receive these reminders, visit: ${cartData.checkoutUrl}&unsubscribe=${cartData.recoveryToken || 'token'}

${this.fromName} • Premium Bed Textures • ${this.replyToEmail}
    `;
  }
}

module.exports = AbandonedCartEmailTemplates;