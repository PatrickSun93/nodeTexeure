/**
 * Order payment-state transitions shared by the Stripe webhook and the admin
 * refund endpoint. Each throws when the write fails, so a webhook responds 500
 * and Stripe retries it instead of the order silently staying unpaid.
 */
const db = require('../utils/database');

async function run(sql, params) {
  const result = await db.executeQuery(sql, params);
  if (!result.success) {
    throw new Error(`Order payment update failed: ${result.error}`);
  }
  return result.affectedRows;
}

// A paid order is `confirmed` (orders.status has no 'paid'); payment_status says paid.
function markOrderPaid(orderId, paymentIntentId = null) {
  return run(
    `UPDATE orders SET status = IF(status = 'pending', 'confirmed', status), payment_status = 'paid',
       paid_at = COALESCE(paid_at, NOW()), stripe_payment_intent_id = COALESCE(?, stripe_payment_intent_id)
     WHERE id = ?`,
    [paymentIntentId, orderId]
  );
}

// Full refunds move the order to `refunded`; partial ones only change payment_status.
function markOrderRefunded(orderId, { partial = false } = {}) {
  return partial
    ? run("UPDATE orders SET payment_status = 'partially_refunded' WHERE id = ?", [orderId])
    : run("UPDATE orders SET status = 'refunded', payment_status = 'refunded' WHERE id = ?", [orderId]);
}

function recordPaymentIntent(orderId, paymentIntentId) {
  return run('UPDATE orders SET stripe_payment_intent_id = ? WHERE id = ?', [paymentIntentId, orderId]);
}

function recordCheckoutSession(orderId, sessionId) {
  return run('UPDATE orders SET stripe_session_id = ? WHERE id = ?', [sessionId, orderId]);
}

module.exports = { markOrderPaid, markOrderRefunded, recordPaymentIntent, recordCheckoutSession };
