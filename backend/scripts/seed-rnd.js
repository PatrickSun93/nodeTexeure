/**
 * R&D Seed Script
 * - Seeds admin/staff/customer users with bcrypt-hashed passwords
 * - Seeds user addresses
 * - Seeds categories (if missing), products, variants, inventory
 * - Seeds discount codes
 *
 * Usage:
 *   From backend directory: node scripts/seed-rnd.js
 *   Or via npm script: npm run seed:rnd
 */

const path = require('path');
const bcrypt = require('bcryptjs');
const DatabaseUtil = require('../utils/database');

// Helpers
async function getNextId(prefix) {
  const res = await DatabaseUtil.executeQuery('SELECT get_next_id(?) AS id', [prefix]);
  if (!res.success || !res.data || !res.data[0]) {
    throw new Error(`Failed to get next id for prefix ${prefix}: ${res.error || 'unknown error'}`);
  }
  return res.data[0].id;
}

async function upsert(sql, params) {
  const res = await DatabaseUtil.executeQuery(sql, params);
  if (!res.success) {
    throw new Error(`SQL error: ${res.error} (code=${res.code})`);
  }
  return res;
}

async function findOne(sql, params) {
  const res = await DatabaseUtil.executeQuery(sql, params);
  if (!res.success) {
    throw new Error(`SQL error: ${res.error} (code=${res.code})`);
  }
  return (res.data && res.data[0]) || null;
}

async function findAll(sql, params) {
  const res = await DatabaseUtil.executeQuery(sql, params);
  if (!res.success) {
    throw new Error(`SQL error: ${res.error} (code=${res.code})`);
  }
  return res.data || [];
}

async function seedUsers() {
  console.log('Seeding users...');
  const users = [
    {
      email: 'admin@example.com',
      first_name: 'Admin',
      last_name: 'User',
      role: 'admin',
      passwordPlain: 'Admin@123',
      email_verified: true
    },
    {
      email: 'staff@example.com',
      first_name: 'Staff',
      last_name: 'Member',
      role: 'staff',
      passwordPlain: 'Staff@123',
      email_verified: true
    },
    {
      email: 'alice.customer@example.com',
      first_name: 'Alice',
      last_name: 'Customer',
      role: 'customer',
      passwordPlain: 'Customer@123',
      email_verified: true
    },
    {
      email: 'bob.customer@example.com',
      first_name: 'Bob',
      last_name: 'Customer',
      role: 'customer',
      passwordPlain: 'Customer@123',
      email_verified: true
    }
  ];

  const created = {};

  for (const u of users) {
    // Check if user exists
    const existing = await findOne('SELECT id FROM users WHERE email = ?', [u.email]);
    if (existing) {
      console.log(` - User exists: ${u.email} (${existing.id})`);
      created[u.email] = existing.id;
      continue;
    }

    const id = await getNextId('USER');
    const password_hash = await bcrypt.hash(u.passwordPlain, 10);

    await upsert(
      `INSERT INTO users (id, email, password_hash, first_name, last_name, role, status, email_verified)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?)
       ON DUPLICATE KEY UPDATE id=id`,
      [id, u.email, password_hash, u.first_name, u.last_name, u.role, !!u.email_verified]
    );

    console.log(` + Created user: ${u.email} (${id})`);
    created[u.email] = id;
  }

  return {
    adminId: created['admin@example.com'],
    staffId: created['staff@example.com'],
    customer1Id: created['alice.customer@example.com'],
    customer2Id: created['bob.customer@example.com']
  };
}

async function seedAddresses(customers) {
  console.log('Seeding user addresses...');

  const addrData = [
    {
      userId: customers.customer1Id,
      type: 'shipping',
      first_name: 'Alice',
      last_name: 'Customer',
      phone: '+1-555-111-2222',
      is_default: true,
      address: {
        company: '',
        address_line_1: '123 Market Street',
        address_line_2: 'Apt 5',
        city: 'San Francisco',
        state: 'CA',
        postal_code: '94103',
        country: 'US'
      }
    },
    {
      userId: customers.customer1Id,
      type: 'billing',
      first_name: 'Alice',
      last_name: 'Customer',
      phone: '+1-555-111-2222',
      is_default: false,
      address: {
        company: '',
        address_line_1: '123 Market Street',
        address_line_2: 'Apt 5',
        city: 'San Francisco',
        state: 'CA',
        postal_code: '94103',
        country: 'US'
      }
    },
    {
      userId: customers.customer2Id,
      type: 'shipping',
      first_name: 'Bob',
      last_name: 'Customer',
      phone: '+1-555-222-3333',
      is_default: true,
      address: {
        company: 'Acme Corp',
        address_line_1: '500 Elm Street',
        address_line_2: '',
        city: 'Austin',
        state: 'TX',
        postal_code: '73301',
        country: 'US'
      }
    }
  ];

  for (const a of addrData) {
    // Prevent duplicates: pick a deterministic key
    const exists = await findOne(
      'SELECT id FROM user_addresses WHERE user_id = ? AND type = ? AND is_default = ?',
      [a.userId, a.type, a.is_default]
    );
    if (exists) {
      console.log(` - Address exists for user ${a.userId} (${a.type}, default=${a.is_default})`);
      continue;
    }

    const id = await getNextId('ADDR');
    await upsert(
      `INSERT INTO user_addresses (id, user_id, type, first_name, last_name, phone, address_json, is_default)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE id=id`,
      [
        id,
        a.userId,
        a.type,
        a.first_name,
        a.last_name,
        a.phone,
        JSON.stringify(a.address),
        a.is_default
      ]
    );

    console.log(` + Created address ${id} for user ${a.userId}`);
  }
}

async function ensureCategories() {
  console.log('Ensuring categories exist...');
  const targetSlugs = ['bed-sheets', 'pillowcases', 'duvet-covers', 'blankets'];

  const rows = await findAll(
    `SELECT id, slug FROM categories WHERE slug IN (${targetSlugs.map(() => '?').join(',')})`,
    targetSlugs
  );

  const bySlug = new Map(rows.map(r => [r.slug, r.id]));

  const created = {};
  for (const slug of targetSlugs) {
    if (bySlug.has(slug)) {
      created[slug] = bySlug.get(slug);
      console.log(` - Category exists: ${slug} (${created[slug]})`);
      continue;
    }

    // Create missing category with CAT transno
    const id = await getNextId('CAT');
    const name = slug
      .split('-')
      .map(s => s.charAt(0).toUpperCase() + s.slice(1))
      .join(' ');

    await upsert(
      `INSERT INTO categories (id, name, slug, description, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE id=id`,
      [id, name, slug, `${name} category`, 10, true]
    );

    console.log(` + Created category: ${slug} (${id})`);
    created[slug] = id;
  }

  return created;
}

async function seedProductsAndInventory(adminId, categories) {
  console.log('Seeding products, variants, inventory...');

  const productsSpec = [
    {
      name: 'RND Ultra-Soft Cotton Bed Sheet Set',
      slug: 'rnd-ultra-soft-cotton-sheets',
      sku: 'RND-SHEETS-COTTON-SET',
      categorySlug: 'bed-sheets',
      base_price: 69.99,
      product_details: {
        weight: 1.2,
        dimensions_length: 30,
        dimensions_width: 25,
        dimensions_height: 8,
        material: '100% Cotton',
        is_organic: false,
        care_instructions: 'Machine wash cold, tumble dry low'
      },
      variants: [
        { size: 'Queen', color: 'White', sku: 'RND-SHEETS-COTTON-QUEEN-WHT', price_adjustment: 0.0, stock: 120 },
        { size: 'King', color: 'Gray', sku: 'RND-SHEETS-COTTON-KING-GRY', price_adjustment: 10.0, stock: 90 }
      ]
    },
    {
      name: 'RND Premium Silk Pillowcases (Pair)',
      slug: 'rnd-premium-silk-pillowcases',
      sku: 'RND-PCASE-SILK-PAIR',
      categorySlug: 'pillowcases',
      base_price: 39.99,
      product_details: {
        weight: 0.4,
        dimensions_length: 20,
        dimensions_width: 15,
        dimensions_height: 3,
        material: 'Mulberry Silk',
        is_organic: false,
        care_instructions: 'Hand wash preferred, line dry'
      },
      variants: [
        { size: 'Standard', color: 'Champagne', sku: 'RND-PCASE-SILK-STD-CHM', price_adjustment: 0.0, stock: 70 },
        { size: 'Queen', color: 'Black', sku: 'RND-PCASE-SILK-QUEEN-BLK', price_adjustment: 5.0, stock: 50 }
      ]
    },
    {
      name: 'RND Cozy Knit Blanket',
      slug: 'rnd-cozy-knit-blanket',
      sku: 'RND-BLANKET-KNIT',
      categorySlug: 'blankets',
      base_price: 59.99,
      product_details: {
        weight: 1.1,
        dimensions_length: 25,
        dimensions_width: 20,
        dimensions_height: 10,
        material: 'Polyester Blend',
        is_organic: false,
        care_instructions: 'Machine wash warm, no bleach'
      },
      variants: [
        { size: 'Throw', color: 'Navy', sku: 'RND-BLANKET-THROW-NAV', price_adjustment: 0.0, stock: 40 },
        { size: 'Queen', color: 'Cream', sku: 'RND-BLANKET-QUEEN-CRM', price_adjustment: 8.0, stock: 25 }
      ]
    }
  ];

  for (const p of productsSpec) {
    // Check product by slug
    const existing = await findOne('SELECT id FROM products WHERE slug = ?', [p.slug]);
    let productId;
    if (existing) {
      productId = existing.id;
      console.log(` - Product exists: ${p.slug} (${productId})`);
    } else {
      productId = await getNextId('PROD');
      await upsert(
        `INSERT INTO products (id, sku, name, slug, description, short_description, category_id, base_price, product_details, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?)
         ON DUPLICATE KEY UPDATE id=id`,
        [
          productId,
          p.sku,
          p.name,
          p.slug,
          `${p.name} - premium quality R&D item for testing.`,
          p.name,
          categories[p.categorySlug],
          p.base_price,
          JSON.stringify(p.product_details),
          adminId
        ]
      );
      console.log(` + Created product: ${p.slug} (${productId})`);
    }

    // Seed variants
    for (let i = 0; i < p.variants.length; i++) {
      const v = p.variants[i];
      // Check variant by sku to avoid duplicates
      const vExisting = await findOne('SELECT id FROM product_variants WHERE sku = ?', [v.sku]);
      const variantId = vExisting ? vExisting.id : `${productId}-VAR-${i + 1}`;

      if (!vExisting) {
        await upsert(
          `INSERT INTO product_variants (id, product_id, sku, size, color, price_adjustment, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE id=id`,
          [variantId, productId, v.sku, v.size, v.color, v.price_adjustment || 0.0, true]
        );
        console.log(`   + Created variant: ${v.sku} (${variantId})`);
      } else {
        console.log(`   - Variant exists: ${v.sku} (${variantId})`);
      }

      // Seed inventory for variant
      const invExisting = await findOne(
        'SELECT id FROM inventory WHERE product_id = ? AND variant_id = ?',
        [productId, variantId]
      );
      const invId = invExisting ? invExisting.id : `${productId}-INV-${i + 1}`;

      if (!invExisting) {
        await upsert(
          `INSERT INTO inventory (id, product_id, variant_id, quantity_available, quantity_reserved, quantity_sold, reorder_point, reorder_quantity, last_restocked_at)
           VALUES (?, ?, ?, ?, 0, 0, 10, 50, NOW())
           ON DUPLICATE KEY UPDATE id=id`,
          [invId, productId, variantId, v.stock]
        );
        console.log(`     + Created inventory row: ${invId} (stock=${v.stock})`);
      } else {
        console.log(`     - Inventory exists: ${invId}`);
      }
    }
  }
}

async function seedDiscountCodes(adminId) {
  console.log('Seeding discount codes...');

  const specs = [
    {
      code: 'WELCOME10',
      name: 'Welcome 10% Off',
      type: 'percentage',
      value: 10.0,
      minimum_order_amount: 0.0,
      maximum_discount_amount: 50.0,
      usage_limit: 1000,
      is_active: true
    },
    {
      code: 'SAVE20',
      name: 'Save $20',
      type: 'fixed_amount',
      value: 20.0,
      minimum_order_amount: 100.0,
      maximum_discount_amount: null,
      usage_limit: 500,
      is_active: true
    },
    {
      code: 'FREESHIP',
      name: 'Free Shipping',
      type: 'free_shipping',
      value: 0.0,
      minimum_order_amount: 50.0,
      maximum_discount_amount: null,
      usage_limit: null,
      is_active: true
    }
  ];

  for (const d of specs) {
    const existing = await findOne('SELECT id FROM discount_codes WHERE code = ?', [d.code]);
    if (existing) {
      console.log(` - Discount exists: ${d.code} (${existing.id})`);
      continue;
    }

    const id = await getNextId('DISC');
    await upsert(
      `INSERT INTO discount_codes
       (id, code, name, discount_details, type, value, minimum_order_amount, maximum_discount_amount,
        usage_limit, usage_count, usage_limit_per_customer, is_active, starts_at, expires_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, NOW(), DATE_ADD(NOW(), INTERVAL 180 DAY), ?)
       ON DUPLICATE KEY UPDATE id=id`,
      [
        id,
        d.code,
        d.name,
        JSON.stringify({
          description: d.name,
          terms_conditions: 'R&D testing only',
          applicable_products: [],
          excluded_products: [],
          marketing_message: d.name
        }),
        d.type,
        d.value,
        d.minimum_order_amount,
        d.maximum_discount_amount,
        d.usage_limit,
        d.is_active,
        adminId
      ]
    );

    console.log(` + Created discount: ${d.code} (${id})`);
  }
}

async function main() {
  console.log('=== R&D Database Seeding ===');

  // 1) Users
  const users = await seedUsers();

  // 2) Addresses
  await seedAddresses(users);

  // 3) Categories
  const categories = await ensureCategories();

  // 4) Products, variants, inventory
  await seedProductsAndInventory(users.adminId, categories);

  // 5) Discount codes
  await seedDiscountCodes(users.adminId);

  console.log('=== R&D Seeding Completed ===');
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch(err => {
    console.error('Seeding error:', err);
    process.exit(1);
  });