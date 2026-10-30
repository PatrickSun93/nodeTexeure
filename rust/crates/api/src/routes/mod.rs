pub mod abandoned_cart;
pub mod cart;
pub mod checkout;
pub mod health;
pub mod journal;
pub mod orders;
pub mod products;
pub mod returns;
pub mod reviews;
pub mod search;
pub mod settings;
// /api/users, account half (profile, addresses, admin users)
pub mod users_account;
// /api/users, auth half (register, login, refresh, session, csrf-token, password reset, verify-email)
pub mod users_auth;
pub mod wishlist;
// unsubscribe, newsletter, contact, status, shipping (wf/misc)
pub mod contact;
pub mod newsletter;
pub mod shipping;
pub mod status;
pub mod unsubscribe;
// Wave B: the /api/admin areas (crate::admin dispatches to them) and the
// groups ported next (empty routers until then).
pub mod admin;
pub mod database;
pub mod images;
pub mod payments;
