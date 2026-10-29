const { app, request, DatabaseUtil, login, registerCustomer, inStockVariant, bearer } = require('./helpers');

const address = {
  firstName: 'Test', lastName: 'Buyer', address1: '1 Silk Way', city: 'Austin',
  state: 'TX', postalCode: '73301', country: 'US',
};

async function cartWith(token, item, quantity) {
  const add = await request(app).post('/api/cart/add').set(bearer(token))
    .send({ product_id: item.product_id, variant_id: item.variant_id, quantity });
  return add;
}

async function cartId(token) {
  const res = await request(app).get('/api/cart').set(bearer(token));
  expect(res.status).toBe(200);
  const body = JSON.stringify(res.body);
  const match = body.match(/"(?:cartId|cart_id|id)":"(CART\d+)"/);
  expect(match).toBeTruthy();
  return match[1];
}

describe('catalogue', () => {
  test('product list is public and returns products', async () => {
    const res = await request(app).get('/api/products');
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).toMatch(/PROD\d{10}/);
  });

  test('SQL injection in query params is treated as data', async () => {
    const res = await request(app).get('/api/products')
      .query({ search: "' OR 1=1; DROP TABLE users; --", category: "1' OR '1'='1" });
    expect(res.status).toBeLessThan(500);
    const users = DatabaseUtil.rows(await DatabaseUtil.executeQuery('SELECT COUNT(*) AS n FROM users'));
    expect(Number(users[0].n)).toBeGreaterThan(0);
  });
});

describe('checkout', () => {
  test('order totals are computed server-side from the cart', async () => {
    const buyer = await registerCustomer();
    const item = await inStockVariant(2);
    expect((await cartWith(buyer.accessToken, item, 2)).status).toBe(200);
    const id = await cartId(buyer.accessToken);

    const res = await request(app).post('/api/orders/create').set(bearer(buyer.accessToken))
      .send({ cartId: id, shippingAddress: address, billingAddress: address,
        // Client-supplied totals must be ignored.
        totalAmount: 0.01, subtotal: 0.01 });
    expect(res.status).toBe(200);

    const order = DatabaseUtil.first(await DatabaseUtil.executeQuery(
      'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 1', [buyer.userId]));
    expect(order).toBeTruthy();
    expect(Number(order.total_amount)).toBeGreaterThan(1);
  });

  test('cannot add more than available stock', async () => {
    const buyer = await registerCustomer();
    const item = await inStockVariant(1);
    const res = await cartWith(buyer.accessToken, item, Number(item.quantity_available) + 1);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/stock|available|exceed/i);
  });

  test("cannot check out someone else's cart (IDOR)", async () => {
    const owner = await registerCustomer();
    const attacker = await registerCustomer();
    const item = await inStockVariant(1);
    await cartWith(owner.accessToken, item, 1);
    const victimCart = await cartId(owner.accessToken);

    const res = await request(app).post('/api/orders/create').set(bearer(attacker.accessToken))
      .send({ cartId: victimCart, shippingAddress: address, billingAddress: address });
    expect(res.status).toBe(403);
  });

  test("cannot read another customer's order (IDOR)", async () => {
    const order = DatabaseUtil.first(await DatabaseUtil.executeQuery(
      "SELECT id FROM orders WHERE user_id = 'USER0000000003' LIMIT 1"));
    expect(order).toBeTruthy();

    const stranger = await registerCustomer();
    const denied = await request(app).get(`/api/orders/${order.id}`).set(bearer(stranger.accessToken));
    expect(denied.status).toBe(403);

    const { accessToken } = await login('customer');
    const allowed = await request(app).get(`/api/orders/${order.id}`).set(bearer(accessToken));
    expect(allowed.status).toBe(200);
  });

  test('unknown coupon is rejected', async () => {
    const res = await request(app).post('/api/orders/apply-coupon')
      .send({ code: 'NOT-A-REAL-CODE', subtotal: 100 });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.status).toBe('FAIL');
  });
});

describe('product listings', () => {
  test('list includes each product\'s primary image', async () => {
    const res = await request(app).get('/api/products').query({ limit: 50, nocache: 'true' });
    const products = res.body.keyValueTable.products;
    const withImages = DatabaseUtil.rows(await DatabaseUtil.executeQuery(
      "SELECT DISTINCT pi.product_id FROM product_images pi JOIN products p ON p.id = pi.product_id WHERE p.status = 'approved'"));
    expect(withImages.length).toBeGreaterThan(0);
    for (const { product_id: id } of withImages) {
      expect(products.find((p) => p.id === id)?.image).toMatch(/\.(jpe?g|png|webp)$/);
    }
  });

  test('by-ids accepts product ids and preserves order', async () => {
    const ids = DatabaseUtil.rows(await DatabaseUtil.executeQuery(
      "SELECT id FROM products WHERE status = 'approved' ORDER BY id DESC LIMIT 2")).map((r) => r.id);
    const res = await request(app).get('/api/products/by-ids').query({ ids: ids.join(',') });
    expect(res.status).toBe(200);
    expect(res.body.keyValueTable.products.map((p) => p.id)).toEqual(ids);
  });
});
