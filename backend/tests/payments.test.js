const { DatabaseUtil } = require('./helpers');
const { markOrderPaid, markOrderRefunded, recordCheckoutSession } = require('../services/orderPayments');

// Stripe webhooks need a signed payload; these exercise the DB transitions they
// perform, which previously failed against the real schema (missing columns,
// and orders.status has no 'paid').
describe('order payment state', () => {
  let orderId;
  beforeAll(async () => {
    const order = DatabaseUtil.first(await DatabaseUtil.executeQuery(
      "SELECT id FROM orders ORDER BY created_at DESC LIMIT 1"));
    orderId = order.id;
    await DatabaseUtil.executeQuery(
      "UPDATE orders SET status = 'pending', payment_status = 'pending', paid_at = NULL WHERE id = ?", [orderId]);
  });

  const read = async () => DatabaseUtil.first(await DatabaseUtil.executeQuery(
    'SELECT status, payment_status, paid_at, stripe_payment_intent_id, stripe_session_id FROM orders WHERE id = ?', [orderId]));

  test('checkout session id is stored', async () => {
    await recordCheckoutSession(orderId, 'cs_test_123');
    expect((await read()).stripe_session_id).toBe('cs_test_123');
  });

  test('payment marks the order confirmed + paid', async () => {
    expect(await markOrderPaid(orderId, 'pi_test_123')).toBe(1);
    const row = await read();
    expect(row).toMatchObject({ status: 'confirmed', payment_status: 'paid', stripe_payment_intent_id: 'pi_test_123' });
    expect(row.paid_at).toBeTruthy();
  });

  test('partial refund keeps the order, full refund refunds it', async () => {
    await markOrderRefunded(orderId, { partial: true });
    expect(await read()).toMatchObject({ status: 'confirmed', payment_status: 'partially_refunded' });
    await markOrderRefunded(orderId);
    expect(await read()).toMatchObject({ status: 'refunded', payment_status: 'refunded' });
  });
});
