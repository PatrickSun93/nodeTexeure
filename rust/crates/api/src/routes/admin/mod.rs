//! The `/api/admin` areas, one file per Node router, each with a
//! `register(&mut Routes)` that [`crate::admin::BackOffice::new`] calls in
//! server.js / routes/admin/index.js order. A porter only edits their own file.

// Mount A: /api/admin/analytics (routes/analyticsRoutes.js)
pub mod analytics_routes;
// Mount B: /api/admin/email-queue (routes/emailQueueRoutes.js)
pub mod email_queue;
// Mount C: /api/admin/bulk (routes/bulkOperationsRoutes.js)
pub mod bulk;
// Mount D: /api/admin/email-templates (routes/emailTemplateRoutes.js)
pub mod email_templates;

// Mount E: /api/admin (routes/admin/index.js): logout, then the areas in its
// router.use order (products, coupons, inventory, users, orders, analytics,
// settings) — the order is BackOffice::new's, not this list's.
pub mod analytics;
pub mod coupons;
pub mod inventory;
pub mod logout;
pub mod orders;
pub mod products;
pub mod settings;
pub mod users;
