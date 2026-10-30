//! Authentication, matching backend/middleware/authMiddleware.js:
//!
//! * the token comes from `Authorization: Bearer <jwt>`, else the `admin_auth`
//!   HttpOnly cookie;
//! * HS256 only (an `alg: none` or RS-signed token is rejected), `exp`/`nbf`
//!   enforced with no leeway;
//! * the user row is re-read on every request — a deactivated account or a bumped
//!   `token_version` (logout, role change, password reset) revokes the token
//!   immediately, and role flags come from the database, not the token.
//!
//! Handlers take [`AuthUser`], [`OptionalUser`], [`StaffOrAdmin`] or [`Admin`]
//! as extractors; rejections carry the same status and JSON as the Node API.

use axum::Json;
use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use axum::http::{HeaderMap, StatusCode, header};
use axum::response::{IntoResponse, Response};
use common::response::{failure, failure_with};
use jsonwebtoken::{Algorithm, DecodingKey, Validation};
use serde::Deserialize;
use serde_json::{Value, json};

use crate::AppState;

/// The verified caller.
#[derive(Debug, Clone)]
pub struct AuthUser {
    pub id: String,
    pub email: Option<String>,
    /// `admin` | `staff` | `customer`, from the database.
    pub role: String,
}

impl AuthUser {
    pub fn is_admin(&self) -> bool {
        self.role == "admin"
    }
    pub fn is_staff(&self) -> bool {
        self.role == "staff"
    }
}

/// Signing secret, shared with the Node backend (`JWT_SECRET`).
#[derive(Clone)]
pub struct JwtKey(Option<DecodingKey>, Option<std::sync::Arc<[u8]>>);

impl JwtKey {
    pub fn from_secret(secret: Option<&str>) -> Self {
        let secret = secret.filter(|s| !s.is_empty());
        Self(
            secret.map(|s| DecodingKey::from_secret(s.as_bytes())),
            secret.map(|s| s.as_bytes().into()),
        )
    }

    /// The raw secret, for signing (see [`crate::tokens`]).
    pub fn secret(&self) -> Option<&[u8]> {
        self.1.as_deref()
    }
}

#[derive(Debug, Deserialize)]
struct Claims {
    id: String,
    #[serde(default)]
    email: Option<String>,
    /// Token version (`tv`); tokens from before migration 009 have none (= 0).
    #[serde(default)]
    tv: Value,
}

/// `Number(x || 0)` in JS terms, for comparing the token version.
fn token_version(v: &Value) -> f64 {
    match v {
        Value::Null | Value::Bool(false) => 0.0,
        Value::Bool(true) => 1.0,
        Value::Number(n) => n.as_f64().unwrap_or(f64::NAN),
        Value::String(s) if s.is_empty() => 0.0,
        Value::String(s) => s.trim().parse().unwrap_or(f64::NAN),
        _ => f64::NAN,
    }
}

/// Header first (even an empty `Bearer ` wins, as in Node), then the cookie.
fn extract_token(headers: &HeaderMap) -> Option<String> {
    if let Some(auth) = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        && auth.starts_with("Bearer ")
    {
        return auth
            .split(' ')
            .nth(1)
            .filter(|t| !t.is_empty())
            .map(str::to_owned);
    }
    // `req.cookies.admin_auth` as cookie-parser decodes it (first occurrence,
    // percent-decoded, `j:` JSON), used when truthy.
    let cookies = crate::cookies::Cookies::from_headers(headers);
    match cookies.get("admin_auth") {
        Some(Value::String(s)) if !s.is_empty() => Some(s.clone()),
        // A truthy `j:` value that isn't a string: jwt.verify rejects it.
        value if crate::body::truthy(value) => Some(String::new()),
        _ => None,
    }
}

pub enum AuthError {
    NoToken,
    Invalid,
    Forbidden(&'static str, &'static str),
    Internal,
}

impl IntoResponse for AuthError {
    fn into_response(self) -> Response {
        let (status, body) = match self {
            Self::NoToken => (
                StatusCode::UNAUTHORIZED,
                failure_with(
                    "Not authorized, no token",
                    json!({ "error": "No token provided" }),
                ),
            ),
            Self::Invalid => (
                StatusCode::UNAUTHORIZED,
                failure_with(
                    "Not authorized, token failed",
                    json!({ "error": "Token is invalid" }),
                ),
            ),
            Self::Forbidden(message, error) => (
                StatusCode::FORBIDDEN,
                failure_with(message, json!({ "error": error })),
            ),
            Self::Internal => (
                StatusCode::INTERNAL_SERVER_ERROR,
                failure("Authentication check failed"),
            ),
        };
        (status, Json(body)).into_response()
    }
}

/// Verify a token and re-check the user; `Ok(None)` for any invalid, revoked or
/// inactive session.
async fn resolve(state: &AppState, token: &str) -> Result<Option<AuthUser>, AuthError> {
    let Some(key) = &state.jwt.0 else {
        tracing::error!("JWT_SECRET is not set; rejecting all tokens");
        return Ok(None);
    };
    let mut validation = Validation::new(Algorithm::HS256);
    validation.leeway = 0;
    validation.validate_nbf = true;
    validation.validate_aud = false;
    validation.required_spec_claims.clear();
    let Ok(data) = jsonwebtoken::decode::<Claims>(token, key, &validation) else {
        return Ok(None);
    };
    let claims = data.claims;

    let row = sqlx::query!(
        r#"SELECT role AS "role!: String", status AS "status: String", token_version FROM users WHERE id = ?"#,
        claims.id
    )
    .fetch_optional(&state.pool)
    .await
    .map_err(|err| {
        tracing::error!(error = %err, "auth: user lookup failed");
        AuthError::Internal
    })?;
    let Some(row) = row else { return Ok(None) };
    if row.status != "active" || f64::from(row.token_version) != token_version(&claims.tv) {
        return Ok(None);
    }
    Ok(Some(AuthUser {
        id: claims.id,
        email: claims.email,
        role: row.role.to_lowercase(),
    }))
}

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AuthError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let token = extract_token(&parts.headers).ok_or(AuthError::NoToken)?;
        resolve(state, &token).await?.ok_or(AuthError::Invalid)
    }
}

/// The caller if a valid token was sent; invalid or revoked tokens are treated
/// as anonymous (Node's `protectOptional`).
pub struct OptionalUser(pub Option<AuthUser>);

impl FromRequestParts<AppState> for OptionalUser {
    type Rejection = AuthError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let Some(token) = extract_token(&parts.headers) else {
            return Ok(Self(None));
        };
        Ok(Self(resolve(state, &token).await.unwrap_or(None)))
    }
}

/// Admin or staff (back office). 403 for any other signed-in user.
pub struct StaffOrAdmin(pub AuthUser);

impl FromRequestParts<AppState> for StaffOrAdmin {
    type Rejection = AuthError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let user = AuthUser::from_request_parts(parts, state).await?;
        if user.is_admin() || user.is_staff() {
            Ok(Self(user))
        } else {
            Err(AuthError::Forbidden(
                "Not authorized as staff or admin",
                "Staff or admin access required",
            ))
        }
    }
}

/// Admin only. 403 for any other signed-in user (staff included).
pub struct Admin(pub AuthUser);

impl FromRequestParts<AppState> for Admin {
    type Rejection = AuthError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let user = AuthUser::from_request_parts(parts, state).await?;
        if user.is_admin() {
            Ok(Self(user))
        } else {
            Err(AuthError::Forbidden(
                "Not authorized as an admin",
                "Admin access required",
            ))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn headers(pairs: &[(&str, &str)]) -> HeaderMap {
        let mut h = HeaderMap::new();
        for (k, v) in pairs {
            h.append(
                axum::http::HeaderName::from_bytes(k.as_bytes()).unwrap(),
                v.parse().unwrap(),
            );
        }
        h
    }

    #[test]
    fn token_sources_follow_the_node_order() {
        assert_eq!(
            extract_token(&headers(&[("authorization", "Bearer abc")])).as_deref(),
            Some("abc")
        );
        assert_eq!(
            extract_token(&headers(&[("cookie", "x=1; admin_auth=jwt")])).as_deref(),
            Some("jwt")
        );
        assert_eq!(
            extract_token(&headers(&[
                ("authorization", "Bearer "),
                ("cookie", "admin_auth=jwt")
            ])),
            None,
            "an empty Bearer header wins over the cookie, like Node"
        );
        assert_eq!(
            extract_token(&headers(&[
                ("authorization", "Basic xyz"),
                ("cookie", "admin_auth=jwt")
            ]))
            .as_deref(),
            Some("jwt")
        );
        assert_eq!(extract_token(&HeaderMap::new()), None);
        // cookie-parser: first occurrence wins, values are decoded, `j:` is JSON.
        assert_eq!(
            extract_token(&headers(&[("cookie", "admin_auth=; admin_auth=jwt")])),
            None
        );
        assert_eq!(
            extract_token(&headers(&[("cookie", "admin_auth=j%3A%22jwt%22")])).as_deref(),
            Some("jwt")
        );
        assert_eq!(
            extract_token(&headers(&[("cookie", "admin_auth=j:{\"a\":1}")])).as_deref(),
            Some(""),
            "a non-string token never verifies"
        );
        assert_eq!(
            extract_token(&headers(&[("cookie", "admin_auth=j:0")])).as_deref(),
            Some("j:0")
        );
    }

    #[test]
    fn token_version_is_js_number_or_zero() {
        assert_eq!(token_version(&Value::Null), 0.0);
        assert_eq!(token_version(&json!(3)), 3.0);
        assert_eq!(token_version(&json!("2")), 2.0);
        assert!(token_version(&json!("x")).is_nan());
    }
}
