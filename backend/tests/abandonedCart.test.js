const { app, request, DatabaseUtil, registerCustomer, inStockVariant, bearer } = require('./helpers');
const AbandonedCartService = require('../services/abandonedCartService');

// A customer with an item in a cart that went quiet 45 minutes ago (the detector
// picks up carts idle for 30+ minutes).
async function abandonedCartFor() {
  const customer = await registerCustomer();
  const item = await inStockVariant(1);
  const add = await request(app).post('/api/cart/add').set(bearer(customer.accessToken))
    .send({ product_id: item.product_id, variant_id: item.variant_id, quantity: 1 });
  expect(add.status).toBeLessThan(300);

  const cart = DatabaseUtil.first(await DatabaseUtil.executeQuery(
    `SELECT sc.id FROM shopping_carts sc JOIN users u ON u.id = sc.user_id WHERE u.email = ?`,
    [customer.email]));
  expect(cart).toBeTruthy();
  const aged = await DatabaseUtil.executeQuery(
    'UPDATE shopping_carts SET updated_at = DATE_SUB(NOW(), INTERVAL 45 MINUTE) WHERE id = ?', [cart.id]);
  expect(aged.success).toBe(true);
  return { email: customer.email, cartId: cart.id };
}

// Registration also queues welcome/verification emails; only count the recovery ones.
const queuedFor = async (email) => DatabaseUtil.rows(await DatabaseUtil.executeQuery(
  `SELECT q.status, q.subject, q.template_data, q.scheduled_at
   FROM email_queue q JOIN email_templates t ON t.id = q.template_id
   WHERE q.to_email = ? AND t.name = 'abandoned_cart' ORDER BY q.scheduled_at`, [email]));

describe('abandoned cart recovery', () => {
  const service = new AbandonedCartService({ autoStart: false });
  let errorSpy;

  beforeEach(() => { errorSpy = jest.spyOn(console, 'error'); });
  afterEach(() => {
    // e.g. "Failed to initiate cart recovery { error: "Unknown column 'type' ..." }"
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  test('detection queues the 3-email abandoned_cart sequence in email_queue', async () => {
    const { email, cartId } = await abandonedCartFor();

    const result = await service.detectAbandonedCarts();
    expect(result.success).toBe(true);

    const recovery = DatabaseUtil.first(await DatabaseUtil.executeQuery(
      'SELECT recovery_token, email_sent_count FROM abandoned_cart_recovery WHERE cart_id = ?', [cartId]));
    expect(recovery).toBeTruthy();
    expect(recovery.email_sent_count).toBe(3);

    const rows = await queuedFor(email);
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.status).toBe('pending');
      expect(new Date(row.scheduled_at).getTime()).toBeGreaterThan(Date.now());
      const data = typeof row.template_data === 'string' ? JSON.parse(row.template_data) : row.template_data;
      expect(data.recovery_link).toContain(recovery.recovery_token);
      expect(data.unsubscribe_link).toContain('/unsubscribe?');
      expect(data.item_count).toBe(1);
      expect(data.customer_name).toBe('Test Customer');
    }

    // Purchase completed -> the pending sequence is cancelled.
    await service.markCartRecovered(cartId, null);
    expect((await queuedFor(email)).map((r) => r.status)).toEqual(['cancelled', 'cancelled', 'cancelled']);
  });

  test('unsubscribed customers get no abandoned-cart emails', async () => {
    const { email, cartId } = await abandonedCartFor();
    const suppressed = await DatabaseUtil.executeQuery(
      `INSERT INTO email_unsubscribes (id, email, token) VALUES (get_next_id('UNSB'), ?, 'test')`, [email]);
    expect(suppressed.success).toBe(true);

    expect((await service.detectAbandonedCarts()).success).toBe(true);

    const recovery = DatabaseUtil.first(await DatabaseUtil.executeQuery(
      'SELECT email_sent_count FROM abandoned_cart_recovery WHERE cart_id = ?', [cartId]));
    expect(recovery.email_sent_count).toBe(0);
    expect(await queuedFor(email)).toHaveLength(0);
  });
});
