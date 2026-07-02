/**
 * Bulk-translate product content into every supported locale using a cheap/fast
 * model (Claude Haiku) and store the results in product_translations.
 *
 * Idempotent + incremental: only products missing a translation for a locale are
 * sent to the model, so it's safe to run after every catalog import / on a cron.
 *
 * Runtime serving reads product_translations and COALESCEs over the English base
 * (see backend/routes/productRoutes.js), so translations are computed ONCE here,
 * never per request.
 *
 * Requires ANTHROPIC_API_KEY. Without it the script degrades gracefully (logs and
 * exits 0) — matching how the app treats other optional integrations.
 *
 *   node backend/scripts/translate-content.js
 *   TRANSLATE_MODEL=claude-haiku-4-5 node backend/scripts/translate-content.js
 */
require('dotenv').config();
const DatabaseUtil = require('../utils/database');

const LOCALES = {
  zh: 'Simplified Chinese',
  fr: 'French',
  es: 'Spanish',
};
const MODEL = process.env.TRANSLATE_MODEL || 'claude-haiku-4-5';
const API_KEY = process.env.ANTHROPIC_API_KEY;
const FIELDS = ['name', 'short_description', 'description'];

async function translateProduct(product, localeName) {
  const source = {
    name: product.name,
    short_description: product.short_description,
    description: product.description,
  };
  const prompt =
    `You localize product content for a luxury silk & cashmere bedding store. ` +
    `Translate the values below into ${localeName}. Keep it natural and premium; ` +
    `do not translate the brand token "RND". Return ONLY a JSON object with the ` +
    `keys name, short_description, description.\n\n` +
    JSON.stringify(source);

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!resp.ok) {
    throw new Error(`Anthropic API ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  }
  const data = await resp.json();
  const text = (data.content?.[0]?.text || '').replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(text);
  return {
    name: parsed.name ?? source.name,
    short_description: parsed.short_description ?? source.short_description,
    description: parsed.description ?? source.description,
  };
}

async function main() {
  if (!API_KEY) {
    console.log('⚠️  ANTHROPIC_API_KEY not set — skipping product content translation.');
    console.log('    Set it to auto-translate new products (or run the example seed for demo data).');
    process.exit(0);
  }

  let translated = 0;
  for (const [code, localeName] of Object.entries(LOCALES)) {
    const missing = await DatabaseUtil.executeQuery(
      `SELECT p.id, p.name, p.short_description, p.description
         FROM products p
         LEFT JOIN product_translations pt ON pt.product_id = p.id AND pt.locale = ?
        WHERE pt.product_id IS NULL`,
      [code]
    );
    const rows = Array.isArray(missing?.data) ? missing.data : [];
    if (rows.length === 0) {
      console.log(`✓ ${code}: up to date`);
      continue;
    }
    console.log(`… ${code}: translating ${rows.length} product(s) with ${MODEL}`);
    for (const product of rows) {
      try {
        const t = await translateProduct(product, localeName);
        await DatabaseUtil.executeQuery(
          `INSERT INTO product_translations (product_id, locale, name, short_description, description)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE name=VALUES(name), short_description=VALUES(short_description), description=VALUES(description)`,
          [product.id, code, t.name, t.short_description, t.description]
        );
        translated++;
        console.log(`   ${code} ← ${product.id}`);
      } catch (err) {
        console.error(`   ✗ ${code} ${product.id}: ${err.message}`);
      }
    }
  }
  console.log(`Done. ${translated} translation row(s) written.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('translate-content failed:', err);
  process.exit(1);
});
