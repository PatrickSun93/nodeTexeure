//! `/api/admin` area: backend/routes/admin/settings.js (settings and
//! shipping zones).
//!
//! Not ported yet: nothing is registered, so every request falls through to
//! the next mount exactly like a path this Node router doesn't define (see
//! `crate::admin`). Register the routes in Node's order, each with its own
//! middleware as `Step`s.

use crate::admin::Routes;

pub fn register(_r: &mut Routes) {}
