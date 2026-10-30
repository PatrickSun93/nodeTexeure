// Admin API router, mounted at /api/admin behind `protect, staffOrAdmin` (server.js).
// Every route also declares its own role guard (`admin` or `staffOrAdmin`), so
// staff only reach the routes explicitly opened to them. Each area lives in its
// own file; they're mounted at '/' and keep their full sub-paths.
const express = require('express');
const { csrfProtection } = require('../../middleware/csrfMiddleware');
const { staffOrAdmin } = require('../../middleware/authMiddleware');
const DatabaseUtil = require('../../utils/database');
const ResponseFormatter = require('../../utils/responseFormatter');
const { adminLimiter } = require('./limiters');

const router = express.Router();

router.use(adminLimiter);
router.use(csrfProtection);

// Back-office logout: clear the HttpOnly auth + CSRF cookies and revoke the
// session server-side, so a copied admin_auth cookie stops working too.
router.post('/logout', staffOrAdmin, async (req, res) => {
  try {
    await DatabaseUtil.executeQuery('UPDATE users SET token_version = token_version + 1 WHERE id = ?', [req.user.id]);
    await DatabaseUtil.executeQuery('DELETE FROM refresh_tokens WHERE user_id = ?', [req.user.id]);
    const cookieOpts = { path: '/', sameSite: 'strict', secure: process.env.NODE_ENV === 'production' };
    res.clearCookie('admin_auth', { ...cookieOpts, httpOnly: true });
    res.clearCookie('csrf_token', cookieOpts);
    res.json(ResponseFormatter.success('Logged out successfully'));
  } catch (error) {
    console.error('Admin logout error:', error);
    res.status(500).json(ResponseFormatter.failure('Logout failed'));
  }
});

router.use(require('./products'));
router.use(require('./coupons'));
router.use(require('./inventory'));
router.use(require('./users'));
router.use(require('./orders'));
router.use(require('./analytics'));
router.use(require('./settings'));

module.exports = router;
