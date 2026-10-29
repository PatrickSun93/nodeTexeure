# Adding a feature

The end-to-end path for a typical feature (a new resource with a page + API +
storage), following this repo's conventions. Example: a "gift messages" feature.

## 1. Database

Add a table via a migration (don't hand-edit a live DB):

```sql
-- backend/migrations/010_gift_messages.sql  (next free number)
CREATE TABLE IF NOT EXISTS gift_messages (
  id VARCHAR(50) PRIMARY KEY,
  order_id VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);
-- register the custom-ID prefix so get_next_id('GIFT') works
INSERT IGNORE INTO transno (prefix, count, details) VALUES ('GIFT', 0, 'Gift message id');
```

The backend applies pending migrations on startup (`npm run migrate`, tracked in
the `schema_migrations` table), so every environment picks it up — fresh Docker
volumes included. Never edit a migration that has shipped; add a new one.

## 2. Backend route

Create `backend/routes/giftMessageRoutes.js`, use prepared statements and the
custom-ID function, and return the standard envelope:

```js
const express = require('express');
const router = express.Router();
const DatabaseUtil = require('../utils/database');
const ResponseFormatter = require('../utils/responseFormatter');
const { protect } = require('../middleware/authMiddleware');

router.post('/', protect, async (req, res) => {
  try {
    const { id } = DatabaseUtil.first(await DatabaseUtil.executeQuery("SELECT get_next_id('GIFT') AS id"));
    const saved = await DatabaseUtil.executeQuery(
      'INSERT INTO gift_messages (id, order_id, message) VALUES (?, ?, ?)',
      [id, req.body.order_id, req.body.message]
    );
    // executeQuery never throws — check the result, or failures are silent.
    if (!saved.success) throw new Error(saved.error);
    res.status(201).json(ResponseFormatter.success('Gift message saved', { id }));
  } catch (e) {
    console.error('Save gift message failed:', e);
    res.status(500).json(ResponseFormatter.failure('Failed to save'));
  }
});

module.exports = router;
```

Mount it in `backend/server.js` and add the route name to the proxy list in
`next.config.mjs` so `/api/gift-messages/*` reaches the backend:

```js
app.use('/api/gift-messages', require('./routes/giftMessageRoutes')); // server.js
// next.config.mjs: add 'gift-messages' to the `routes` array
```

Admin-only? Put it in `backend/routes/admin/` (mounted by `routes/admin/index.js`,
which applies auth, rate limiting and CSRF) and give each route an `admin` or
`staffOrAdmin` guard.

## 3. Frontend

Add a page under `src/app/…/page.js`. **Call the API through the proxy** (relative
`/api/...`, never `http://localhost:6666`), and **style with design tokens**:

```jsx
'use client';
import { apiRequest } from '../../lib/api';
// ...
await apiRequest('/gift-messages', { method: 'POST', body: JSON.stringify({ order_id, message }) });
// style: className="noirae-btn-primary" or style={{ color: 'var(--noirae-charcoal)' }}
```

If the page uses `useSearchParams`, wrap it in `<Suspense>` (Next 15 requirement).

## 4. Real example data

Add rows to `backend/scripts/seed-example-data.js` so the feature shows real data
(no mocks). Keep the script idempotent.

## 5. Test

Add API tests in `backend/tests/` (Jest + supertest against the seeded DB): the
happy path, plus 401 without auth, 403 for the wrong role, and no IDOR.

```bash
npm run test                                                     # ESLint + next build
cd backend && DB_HOST=127.0.0.1 DB_PORT=3307 DB_PASSWORD=noirae_dev npm test
npm run smoke                                                    # stack health
node scripts/gen-api-docs.js                                     # refresh docs/API.md
```

Then exercise it in the browser (Docker: `docker compose up`), and for anything
auth-related re-check the security posture (unauth blocked, no IDOR).

## Checklist

- [ ] Migration added under `backend/migrations/` (next number)
- [ ] Route mounted in `server.js` + name added to `next.config.mjs` proxy list
- [ ] Prepared statements; `get_next_id` prefix registered
- [ ] Frontend calls `/api/*` (proxy) and styles via `--noirae-*` tokens
- [ ] Example rows in the seed; no mock/hardcoded data
- [ ] API tests added; `npm run test`, backend `npm test`, `npm run smoke` green
- [ ] `docs/API.md` regenerated
