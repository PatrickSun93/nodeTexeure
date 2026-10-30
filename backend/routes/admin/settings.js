// Admin API: System settings and shipping zones.
// Mounted under /api/admin by ./index.js (auth, rate limit, and CSRF applied there).
const express = require('express');
const { csrfProtection } = require('../../middleware/csrfMiddleware');
const { admin } = require('../../middleware/authMiddleware');
const DatabaseUtil = require('../../utils/database');
const ResponseFormatter = require('../../utils/responseFormatter');
const path = require('path');
const { adminReadLimiter, adminWriteLimiter } = require('./limiters');

const router = express.Router();

// Settings
router.get('/settings/general', admin, adminReadLimiter, async (req, res) => {
  try {
    const result = await DatabaseUtil.executeQuery("SELECT * FROM system_settings");
    const settings = {};
    result.data.forEach(s => settings[s.setting_key] = s.setting_value);

    // Defaults if missing
    const general = {
      storeName: settings.store_name || 'NodeTexture',
      supportEmail: settings.support_email || 'support@nodetexture.com',
      currency: settings.currency || 'USD',
      timezone: settings.timezone || 'UTC'
    };
    res.json(ResponseFormatter.success('General settings fetched', [{ general }]));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});

router.put('/settings/general', admin, adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { storeName, supportEmail, currency, timezone } = req.body;
    // Upsert logic
    const queries = [
      DatabaseUtil.executeQuery("INSERT INTO system_settings (id, setting_key, setting_value, setting_type) VALUES (UUID(), 'store_name', ?, 'string') ON DUPLICATE KEY UPDATE setting_value = ?", [storeName, storeName]),
      DatabaseUtil.executeQuery("INSERT INTO system_settings (id, setting_key, setting_value, setting_type) VALUES (UUID(), 'support_email', ?, 'string') ON DUPLICATE KEY UPDATE setting_value = ?", [supportEmail, supportEmail]),
      DatabaseUtil.executeQuery("INSERT INTO system_settings (id, setting_key, setting_value, setting_type) VALUES (UUID(), 'currency', ?, 'string') ON DUPLICATE KEY UPDATE setting_value = ?", [currency, currency]),
      DatabaseUtil.executeQuery("INSERT INTO system_settings (id, setting_key, setting_value, setting_type) VALUES (UUID(), 'timezone', ?, 'string') ON DUPLICATE KEY UPDATE setting_value = ?", [timezone, timezone])
    ];
    await Promise.all(queries);
    res.json(ResponseFormatter.success('Settings updated'));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});

// =====================================================
// System settings (generic key/value)
// =====================================================
const ALLOWED_SETTING_TYPES = ['string', 'integer', 'decimal', 'boolean', 'json'];

// setting_value is a TEXT column — coerce non-string values to a stable string form.
function normalizeSettingValue(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// Upsert a single setting. When `type` is provided it is written on insert and
// update; otherwise a new row defaults to 'string' and an existing row keeps its type.
async function upsertSetting(key, value, type, userId) {
  const val = normalizeSettingValue(value);
  if (type) {
    return DatabaseUtil.executeQuery(
      `INSERT INTO system_settings (id, setting_key, setting_value, setting_type, updated_by)
       VALUES (UUID(), ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE setting_value = ?, setting_type = ?, updated_by = ?`,
      [key, val, type, userId, val, type, userId]
    );
  }
  return DatabaseUtil.executeQuery(
    `INSERT INTO system_settings (id, setting_key, setting_value, setting_type, updated_by)
     VALUES (UUID(), ?, ?, 'string', ?)
     ON DUPLICATE KEY UPDATE setting_value = ?, updated_by = ?`,
    [key, val, userId, val, userId]
  );
}

// GET /api/admin/settings — all settings (read-only; CSRF not required).
router.get('/settings', admin, adminReadLimiter, async (req, res) => {
  try {
    const result = await DatabaseUtil.executeQuery('SELECT setting_key, setting_value, setting_type FROM system_settings ORDER BY setting_key ASC');
    if (!result.success) throw new Error(result.error);
    const settings = DatabaseUtil.rows(result).map((s) => ({
      setting_key: s.setting_key,
      setting_value: s.setting_value,
      setting_type: s.setting_type,
    }));
    res.json(ResponseFormatter.success('Settings fetched successfully', [{ settings }]));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});

// POST /api/admin/settings/bulk-update — upsert many settings.
// Declared before PUT /settings/:key registration below; distinct method/path so no shadowing.
router.post('/settings/bulk-update', admin, adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { settings } = req.body;
    if (!Array.isArray(settings) || settings.length === 0) {
      return res.status(400).json(ResponseFormatter.failure('settings must be a non-empty array'));
    }
    let updated = 0;
    for (const s of settings) {
      if (!s || !s.key) continue;
      if (s.type && !ALLOWED_SETTING_TYPES.includes(s.type)) continue;
      const result = await upsertSetting(s.key, s.value, s.type, req.user.id);
      if (result.success) updated += 1;
    }
    res.json(ResponseFormatter.success('Settings updated successfully', [{ result: { updated } }]));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});

// PUT /api/admin/settings/:key — upsert one setting. The earlier-registered
// PUT /settings/general still wins for that exact path.
router.put('/settings/:key', admin, adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { key } = req.params;
    const { value, type } = req.body;
    if (!key) {
      return res.status(400).json(ResponseFormatter.failure('Setting key is required'));
    }
    if (type && !ALLOWED_SETTING_TYPES.includes(type)) {
      return res.status(400).json(ResponseFormatter.failure(`Invalid setting type. Allowed: ${ALLOWED_SETTING_TYPES.join(', ')}`));
    }
    const result = await upsertSetting(key, value, type, req.user.id);
    if (!result.success) throw new Error(result.error);
    res.json(ResponseFormatter.success('Setting updated successfully', [{ setting: { setting_key: key, setting_value: normalizeSettingValue(value) } }]));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});

// =====================================================
// Shipping zones CRUD
// =====================================================
// Zone IDs use the existing 'SHIP' transno prefix (matches the seeded
// SHIP0000000001.. zones/rates in database/migrations/add_shipping_data.sql).

// GET /api/admin/shipping/zones — list zones (read-only; CSRF not required).
router.get('/shipping/zones', admin, adminReadLimiter, async (req, res) => {
  try {
    const result = await DatabaseUtil.executeQuery('SELECT id, name, countries, is_active FROM shipping_zones ORDER BY name ASC');
    if (!result.success) throw new Error(result.error);
    const zones = DatabaseUtil.rows(result).map((z) => {
      let countries = [];
      if (z.countries) {
        try {
          countries = typeof z.countries === 'string' ? JSON.parse(z.countries) : z.countries;
        } catch (e) {
          countries = [];
        }
      }
      if (!Array.isArray(countries)) countries = [];
      return { id: z.id, name: z.name, countries, is_active: !!z.is_active };
    });
    res.json(ResponseFormatter.success('Shipping zones fetched successfully', [{ zones }]));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});

// POST /api/admin/shipping/zones — create a zone.
router.post('/shipping/zones', admin, adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { name, countries, is_active } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json(ResponseFormatter.failure('name is required'));
    }
    if (!Array.isArray(countries)) {
      return res.status(400).json(ResponseFormatter.failure('countries must be an array of country codes'));
    }

    const idRes = await DatabaseUtil.executeQuery("SELECT get_next_id('SHIP') AS id");
    const id = DatabaseUtil.first(idRes)?.id;
    if (!idRes.success || !id) throw new Error('Failed to generate shipping zone ID');

    const activeVal = is_active === undefined ? 1 : (is_active ? 1 : 0);
    const insertRes = await DatabaseUtil.executeQuery(
      'INSERT INTO shipping_zones (id, name, countries, is_active) VALUES (?, ?, ?, ?)',
      [id, name.trim(), JSON.stringify(countries), activeVal]
    );
    if (!insertRes.success) throw new Error(insertRes.error);

    res.status(201).json(ResponseFormatter.success('Shipping zone created successfully', [{ zone: { id, name: name.trim(), countries, is_active: !!activeVal } }]));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});

// PUT /api/admin/shipping/zones/:id — update allowlisted fields.
router.put('/shipping/zones/:id', admin, adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, countries, is_active } = req.body;

    const existsRes = await DatabaseUtil.executeQuery('SELECT id FROM shipping_zones WHERE id = ?', [id]);
    if (!existsRes.success) throw new Error(existsRes.error);
    if (!DatabaseUtil.first(existsRes)) {
      return res.status(404).json(ResponseFormatter.failure('Shipping zone not found'));
    }

    const updateFields = [];
    const updateValues = [];
    if (name !== undefined) {
      if (!name || !String(name).trim()) {
        return res.status(400).json(ResponseFormatter.failure('name cannot be empty'));
      }
      updateFields.push('name = ?');
      updateValues.push(String(name).trim());
    }
    if (countries !== undefined) {
      if (!Array.isArray(countries)) {
        return res.status(400).json(ResponseFormatter.failure('countries must be an array of country codes'));
      }
      updateFields.push('countries = ?');
      updateValues.push(JSON.stringify(countries));
    }
    if (is_active !== undefined) {
      updateFields.push('is_active = ?');
      updateValues.push(is_active ? 1 : 0);
    }
    if (updateFields.length === 0) {
      return res.status(400).json(ResponseFormatter.failure('No valid fields to update'));
    }
    updateValues.push(id);
    const result = await DatabaseUtil.executeQuery(`UPDATE shipping_zones SET ${updateFields.join(', ')} WHERE id = ?`, updateValues);
    if (!result.success) throw new Error(result.error);
    res.json(ResponseFormatter.success('Shipping zone updated successfully', [{ id }]));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});

// DELETE /api/admin/shipping/zones/:id — remove a zone and its rates
// (shipping_rates.zone_id has no ON DELETE CASCADE, so rates are deleted first).
router.delete('/shipping/zones/:id', admin, adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { id } = req.params;

    const ratesRes = await DatabaseUtil.executeQuery('DELETE FROM shipping_rates WHERE zone_id = ?', [id]);
    if (!ratesRes.success) throw new Error(ratesRes.error);

    const result = await DatabaseUtil.executeQuery('DELETE FROM shipping_zones WHERE id = ?', [id]);
    if (!result.success) throw new Error(result.error);
    if (result.affectedRows === 0) {
      return res.status(404).json(ResponseFormatter.failure('Shipping zone not found'));
    }
    res.json(ResponseFormatter.success('Shipping zone deleted successfully', [{ id }]));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error'));
  }
});

module.exports = router;
