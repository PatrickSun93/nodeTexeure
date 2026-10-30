// Shared helpers for the API test suite. Tests run against a real MySQL seeded
// with `npm run seed:rnd && npm run seed:example` (see backend/README.md#testing).
const request = require('supertest');
const app = require('../server');
const DatabaseUtil = require('../utils/database');

const ACCOUNTS = {
  admin: { email: 'admin@example.com', password: 'Admin@123' },
  staff: { email: 'staff@example.com', password: 'Staff@123' },
  customer: { email: 'alice.customer@example.com', password: 'Customer@123' },
};

async function login(who) {
  const res = await request(app).post('/api/users/login').send(ACCOUNTS[who] || who);
  if (res.status !== 200) throw new Error(`login(${JSON.stringify(who)}) failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.keyValueTable;
}

// Registers a throwaway customer so tests never depend on each other's state.
async function registerCustomer() {
  const email = `test.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@example.com`;
  const password = 'Tester@1234';
  const res = await request(app).post('/api/users/register')
    .send({ email, password, firstName: 'Test', lastName: 'Customer' });
  if (res.status >= 300) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { email, password, ...(await login({ email, password })) };
}

async function inStockVariant(minQty = 5) {
  return DatabaseUtil.first(await DatabaseUtil.executeQuery(
    `SELECT product_id, variant_id, quantity_available FROM inventory
     WHERE quantity_available >= ? ORDER BY quantity_available DESC LIMIT 1`, [minQty]));
}

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

module.exports = { app, request, DatabaseUtil, login, registerCustomer, inStockVariant, bearer };
