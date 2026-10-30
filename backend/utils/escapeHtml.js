/**
 * HTML-escape a value before it is interpolated into an email body.
 * Same rules as the email daemon's `escape_html` (rust/crates/email-daemon/src/render.rs),
 * so mail sent directly by the backend and mail sent through the queue match.
 */
const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

module.exports = { escapeHtml };
