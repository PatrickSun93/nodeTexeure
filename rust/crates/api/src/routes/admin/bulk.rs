//! Mount `/api/admin/bulk` (behind `protect, admin`):
//! backend/routes/bulkOperationsRoutes.js — the CSV template, validate and
//! upload (`crate::multer`, `crate::csv`) and the exports.
//!
//! Not ported yet: nothing is registered, so every request falls through to
//! the next mount exactly like a path this Node router doesn't define (see
//! `crate::admin`). Register the routes in Node's order, each with its own
//! middleware as `Step`s.

use crate::admin::Routes;

pub fn register(_r: &mut Routes) {}
