-- Migration 013: abandoned_cart email template.
--
-- Abandoned-cart recovery emails used to be inserted by EmailQueueService with
-- columns that email_queue does not have (type, recipient, data, priority), so
-- every recovery run failed with "Unknown column 'type' in 'field list'". They now
-- go through emailQueueProducer.enqueue('abandoned_cart', ...) like every other
-- email, which needs this template (the seeded abandoned_cart_1 has no recovery or
-- unsubscribe link). Variables: customer_name, item_count, item_summary,
-- cart_total, recovery_link, unsubscribe_link.

INSERT INTO email_templates (id, name, subject, template_content, category, type, status, is_active)
SELECT get_next_id('EMAIL'), 'abandoned_cart', 'Your Noiraé selection is waiting',
  JSON_OBJECT(
    'html_content', CONCAT(
      '<div style="font-family:Georgia,''Times New Roman'',serif;max-width:600px;margin:0 auto;color:#2A2621">',
      '<h1 style="font-weight:normal;color:#2A2621">Still thinking it over, {{customer_name}}?</h1>',
      '<p>You left {{item_count}} item(s) in your bag: {{item_summary}}.</p>',
      '<p>Bag total: <strong>${{cart_total}}</strong></p>',
      '<p><a href="{{recovery_link}}" style="display:inline-block;padding:12px 24px;background:#2A2621;color:#F3EBDD;text-decoration:none;border-radius:4px">Return to your bag</a></p>',
      '<p style="color:#8C6B3D;font-size:13px;margin-top:32px">Noiraé — silk &amp; cashmere bedding</p>',
      '<p style="color:#8C6B3D;font-size:11px"><a href="{{unsubscribe_link}}" style="color:#8C6B3D">Unsubscribe</a> from reminder emails.</p>',
      '</div>'),
    'text_content', CONCAT(
      'Still thinking it over, {{customer_name}}? You left {{item_count}} item(s) in your bag: {{item_summary}}. ',
      'Bag total: ${{cart_total}}. Return to your bag: {{recovery_link}}\n\n',
      'Unsubscribe from reminder emails: {{unsubscribe_link}}'),
    'variables', JSON_OBJECT('customer_name', 'string', 'item_count', 'number', 'item_summary', 'string',
      'cart_total', 'decimal', 'recovery_link', 'string', 'unsubscribe_link', 'string')
  ),
  'marketing', 'system', 'Active', 1
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE name = 'abandoned_cart');
