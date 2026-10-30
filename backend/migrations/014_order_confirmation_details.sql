-- Migration 014: a real order confirmation email + render-time HTML escaping.
--
-- 1. order_confirmation only said "Your order X has been confirmed" — no items,
--    totals or address. Both checkout producers (backend/routes/orderRoutes.js
--    and rust/crates/api/src/routes/checkout.rs) now pass, identically:
--      order_number, customer_name,
--      items: [{ name, sku, quantity, unit_price, line_total }],
--      subtotal, has_discount, discount_amount, shipping_amount, tax_amount,
--      total_amount (money as "0.00" strings), shipping_address_lines: [string]
--    and the template renders them with the email daemon's sections
--    ({{#items}}…{{/items}}, see rust/crates/email-daemon/src/render.rs). The
--    details are wrapped in {{#subtotal}}…{{/subtotal}} so a confirmation queued
--    before this migration (no subtotal) renders without stray placeholders.
--    The subject is unchanged.
-- 2. The daemon now HTML-escapes every variable in the HTML body (names and
--    addresses are user input), so producers pass raw values. The abandoned-cart
--    producer used to pre-escape customer_name and item_summary; rows it queued
--    that may still be sent are unescaped here so they aren't escaped twice.
--    The daemon waits for this migration (REQUIRED_MIGRATION) before sending.

SET @order_confirmation = JSON_OBJECT(
  'html_content', CONCAT(
    '<div style="font-family:Georgia,''Times New Roman'',serif;max-width:600px;margin:0 auto;color:#2A2621">',
    '<h1 style="font-weight:normal;color:#2A2621">Thank you for your order, {{customer_name}}</h1>',
    '<p>Order <strong>{{order_number}}</strong> is confirmed. We will let you know when it ships.</p>',
    '{{#subtotal}}',
    '<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:15px;margin-top:24px">',
    '<tr>',
    '<th align="left" style="padding:8px 0;border-bottom:1px solid #D9CBB3;font-weight:normal;color:#8C6B3D">Item</th>',
    '<th align="center" style="padding:8px;border-bottom:1px solid #D9CBB3;font-weight:normal;color:#8C6B3D">Qty</th>',
    '<th align="right" style="padding:8px;border-bottom:1px solid #D9CBB3;font-weight:normal;color:#8C6B3D">Price</th>',
    '<th align="right" style="padding:8px 0;border-bottom:1px solid #D9CBB3;font-weight:normal;color:#8C6B3D">Total</th>',
    '</tr>',
    '{{#items}}<tr>',
    '<td style="padding:10px 0;border-bottom:1px solid #EFE6D6">{{name}}</td>',
    '<td align="center" style="padding:10px 8px;border-bottom:1px solid #EFE6D6">{{quantity}}</td>',
    '<td align="right" style="padding:10px 8px;border-bottom:1px solid #EFE6D6">${{unit_price}}</td>',
    '<td align="right" style="padding:10px 0;border-bottom:1px solid #EFE6D6">${{line_total}}</td>',
    '</tr>{{/items}}',
    '</table>',
    '<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:15px;margin-top:16px">',
    '<tr><td style="padding:4px 0">Subtotal</td><td align="right" style="padding:4px 0">${{subtotal}}</td></tr>',
    '{{#has_discount}}<tr><td style="padding:4px 0">Discount</td><td align="right" style="padding:4px 0">&minus;${{discount_amount}}</td></tr>{{/has_discount}}',
    '<tr><td style="padding:4px 0">Shipping</td><td align="right" style="padding:4px 0">${{shipping_amount}}</td></tr>',
    '<tr><td style="padding:4px 0">Tax</td><td align="right" style="padding:4px 0">${{tax_amount}}</td></tr>',
    '<tr><td style="padding:10px 0 4px;border-top:1px solid #D9CBB3"><strong>Total</strong></td>',
    '<td align="right" style="padding:10px 0 4px;border-top:1px solid #D9CBB3"><strong>${{total_amount}}</strong></td></tr>',
    '</table>',
    '<h2 style="font-weight:normal;font-size:18px;color:#2A2621;margin-top:32px">Shipping to</h2>',
    '<p style="line-height:1.6;margin:0">{{#shipping_address_lines}}{{.}}<br>{{/shipping_address_lines}}</p>',
    '{{/subtotal}}',
    '<p style="color:#8C6B3D;font-size:13px;margin-top:32px">Noiraé — silk &amp; cashmere bedding</p>',
    '</div>'),
  'text_content', CONCAT(
    'Thank you for your order, {{customer_name}}!\n\n',
    'Order {{order_number}} is confirmed. We will let you know when it ships.\n',
    '{{#subtotal}}\n',
    '{{#items}}- {{name}} x {{quantity}} @ ${{unit_price}} = ${{line_total}}\n{{/items}}',
    '\nSubtotal: ${{subtotal}}\n',
    '{{#has_discount}}Discount: -${{discount_amount}}\n{{/has_discount}}',
    'Shipping: ${{shipping_amount}}\n',
    'Tax: ${{tax_amount}}\n',
    'Total: ${{total_amount}}\n\n',
    'Shipping to:\n',
    '{{#shipping_address_lines}}{{.}}\n{{/shipping_address_lines}}',
    '{{/subtotal}}',
    '\nNoiraé — silk & cashmere bedding'),
  'variables', JSON_OBJECT('order_number', 'string', 'customer_name', 'string', 'items', 'array',
    'subtotal', 'decimal', 'has_discount', 'boolean', 'discount_amount', 'decimal',
    'shipping_amount', 'decimal', 'tax_amount', 'decimal', 'total_amount', 'decimal',
    'shipping_address_lines', 'array')
);

UPDATE email_templates SET template_content = @order_confirmation WHERE name = 'order_confirmation';

INSERT INTO email_templates (id, name, subject, template_content, category, type, status, is_active)
SELECT get_next_id('EMAIL'), 'order_confirmation', 'Order Confirmation - {{order_number}}', @order_confirmation,
  'transactional', 'system', 'Active', 1
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE name = 'order_confirmation');

-- Undo the abandoned-cart producer's pre-escaping on rows that can still be sent
-- (pending, mid-send, or failed and retryable from the admin). '&amp;' last: the
-- exact inverse of the escape, which replaced '&' first.
UPDATE email_queue
SET template_data = JSON_SET(template_data,
  '$.customer_name', REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
    JSON_UNQUOTE(JSON_EXTRACT(template_data, '$.customer_name')),
    '&lt;', '<'), '&gt;', '>'), '&quot;', '"'), '&#39;', ''''), '&amp;', '&'),
  '$.item_summary', REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
    JSON_UNQUOTE(JSON_EXTRACT(template_data, '$.item_summary')),
    '&lt;', '<'), '&gt;', '>'), '&quot;', '"'), '&#39;', ''''), '&amp;', '&'))
WHERE status IN ('pending', 'processing', 'failed')
  AND template_id IN (SELECT id FROM email_templates WHERE name = 'abandoned_cart')
  AND JSON_TYPE(template_data) = 'OBJECT'
  AND JSON_TYPE(JSON_EXTRACT(template_data, '$.customer_name')) = 'STRING'
  AND JSON_TYPE(JSON_EXTRACT(template_data, '$.item_summary')) = 'STRING';
