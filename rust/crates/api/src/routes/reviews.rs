//! `/api/reviews` — product reviews (port of backend/routes/reviewRoutes.js):
//! the public list for a product (pagination, sort, rating summary), the
//! signed-in customer's create / edit / delete / helpful vote / own list, and
//! admin moderation (pending queue, approve, reject; CSRF on the writes).
//!
//! The whole mount point goes through [`dispatch`], which routes like the
//! Express router (see [`crate::express_router`]): the paths overlap (`PUT /create`
//! edits a review with id `create`, `POST /product/helpful` votes on review
//! `product`), and anything Node doesn't route gets Node's 404.
//!
//! Review text lives in the `review_details` JSON (`{ title, comment,
//! helpful_count }`); moderation is the `is_approved` flag. Reads add the flat
//! `title`, `review_text` and `helpful_count` the storefront and admin use.

use axum::Json;
use axum::extract::{FromRequestParts, Request, State};
use axum::http::StatusCode;
use axum::http::request::Parts;
use axum::response::{IntoResponse, Response};
use chrono::{DateTime, Utc};
use common::response::{failure, success};
use serde::Serialize;
use serde_json::{Value, json};

use crate::AppState;
use crate::auth::{Admin, AuthUser};
use crate::body::{is_non_empty_string, is_optional_string, js_string, js_to_number, truthy};
use crate::csrf::Csrf;
use crate::error::ApiError;
use crate::express_router::{self as express, Routed, Verb};

/// Where the group is mounted (`app.use('/api/reviews', ...)`).
pub const PREFIX: &str = "/api/reviews";

#[derive(Debug, Clone, Copy)]
enum R {
    List,
    Create,
    Update,
    Delete,
    Helpful,
    ByUser,
    Pending,
    Approve,
    Reject,
}

/// reviewRoutes.js, in registration order.
const ROUTES: &[(Verb, &str, R)] = &[
    (Verb::Get, "/product/:productId", R::List),
    (Verb::Post, "/create", R::Create),
    (Verb::Put, "/:id", R::Update),
    (Verb::Delete, "/:id", R::Delete),
    (Verb::Post, "/:id/helpful", R::Helpful),
    (Verb::Get, "/user/:userId", R::ByUser),
    (Verb::Get, "/admin/pending", R::Pending),
    (Verb::Put, "/admin/:id/approve", R::Approve),
    (Verb::Put, "/admin/:id/reject", R::Reject),
];

/// `/api/reviews` and every path below it, all to [`dispatch`].
pub fn router() -> axum::Router<AppState> {
    let all = axum::routing::any(dispatch);
    axum::Router::new()
        .route(PREFIX, all.clone())
        .route(&format!("{PREFIX}/"), all.clone())
        .route(&format!("{PREFIX}/{{*path}}"), all)
}

/// Every request under `/api/reviews`.
pub async fn dispatch(State(state): State<AppState>, req: Request) -> Response {
    let (mut parts, body) = req.into_parts();
    let Ok(bytes) = axum::body::to_bytes(body, 2 * 1024 * 1024).await else {
        return express::error("request entity too large");
    };
    // express.json() / express.urlencoded() run before any route.
    let body = match express::body(&parts.headers, &bytes) {
        Ok(body) => body,
        Err(response) => return *response,
    };
    let path = parts.uri.path().strip_prefix(PREFIX).unwrap_or_default();
    let (route, params) = match express::route(ROUTES, &parts.method, path) {
        Routed::Route(route, params) => (route, params),
        Routed::NotFound => return express::not_found(&parts.uri),
        Routed::Error(message) => return express::error(&message),
    };
    let param = params.into_iter().next().unwrap_or_default();
    let result = match route {
        R::List => list(&state, &parts, param).await,
        R::Create => match guard::<AuthUser>(&mut parts, &state).await {
            Ok(user) => create(&state, user, &body).await,
            Err(denied) => return denied,
        },
        R::Update => match guard::<AuthUser>(&mut parts, &state).await {
            Ok(user) => update(&state, user, param, &body).await,
            Err(denied) => return denied,
        },
        R::Delete => match guard::<AuthUser>(&mut parts, &state).await {
            Ok(user) => remove(&state, user, param).await,
            Err(denied) => return denied,
        },
        R::Helpful => match guard::<AuthUser>(&mut parts, &state).await {
            Ok(user) => helpful(&state, user, param).await,
            Err(denied) => return denied,
        },
        R::ByUser => match guard::<AuthUser>(&mut parts, &state).await {
            Ok(user) => by_user(&state, user, param).await,
            Err(denied) => return denied,
        },
        R::Pending => match guard::<Admin>(&mut parts, &state).await {
            Ok(_) => pending(&state).await,
            Err(denied) => return denied,
        },
        R::Approve => match guard::<Csrf<Admin>>(&mut parts, &state).await {
            Ok(Csrf(Admin(user))) => approve(&state, user, param).await,
            Err(denied) => return denied,
        },
        R::Reject => match guard::<Csrf<Admin>>(&mut parts, &state).await {
            Ok(_) => reject(&state, param).await,
            Err(denied) => return denied,
        },
    };
    result.unwrap_or_else(IntoResponse::into_response)
}

/// Run an auth extractor (`protect`, `admin`, `csrfProtection`) by hand.
pub(crate) async fn guard<G>(parts: &mut Parts, state: &AppState) -> Result<G, Response>
where
    G: FromRequestParts<AppState>,
    G::Rejection: IntoResponse,
{
    G::from_request_parts(parts, state)
        .await
        .map_err(IntoResponse::into_response)
}

fn reply(status: StatusCode, body: Value) -> Response {
    (status, Json(body)).into_response()
}

type Timestamp = Option<DateTime<Utc>>;

/// A `product_reviews` row (`pr.*`) shaped by Node's `shapeReview`, plus the
/// columns its query joins in (`extra`).
#[derive(Debug, Serialize)]
pub struct Review<E> {
    pub id: String,
    pub product_id: String,
    pub user_id: String,
    pub order_item_id: Option<String>,
    pub rating: u8,
    pub review_details: Value,
    pub is_verified_purchase: Option<i8>,
    pub is_approved: Option<i8>,
    pub approved_by: Option<String>,
    #[serde(serialize_with = "common::timestamp::optional")]
    pub approved_at: Timestamp,
    #[serde(serialize_with = "common::timestamp::optional")]
    pub created_at: Timestamp,
    #[serde(serialize_with = "common::timestamp::optional")]
    pub updated_at: Timestamp,
    #[serde(flatten)]
    pub extra: E,
    pub title: Value,
    pub review_text: Value,
    pub helpful_count: Value,
}

/// `parseDetails`: the JSON column as an object (`{}` when empty; a JSON string
/// holding JSON is parsed again, unparsable text is `{}`).
fn parse_details(raw: Value) -> Value {
    match raw {
        raw if !truthy(Some(&raw)) => json!({}),
        Value::Object(_) | Value::Array(_) => raw,
        Value::String(s) => serde_json::from_str(&s).unwrap_or_else(|_| json!({})),
        other => other,
    }
}

/// `details[key]` (undefined for anything but an object).
fn field<'a>(details: &'a Value, key: &str) -> Option<&'a Value> {
    details.as_object().and_then(|o| o.get(key))
}

/// `a || b || ... || ''`.
fn first_truthy(details: &Value, keys: &[&str]) -> Value {
    keys.iter()
        .filter_map(|k| field(details, k))
        .find(|v| truthy(Some(v)))
        .cloned()
        .unwrap_or_else(|| json!(""))
}

/// Build a [`Review`] from a query record with the `pr.*` columns.
macro_rules! review {
    ($r:expr, $extra:expr) => {{
        let details = parse_details(express::js_json($r.review_details));
        let title = first_truthy(&details, &["title"]);
        let review_text = first_truthy(&details, &["review_text", "comment", "body"]);
        // Number(details.helpful_count || 0)
        let helpful_count = match field(&details, "helpful_count") {
            Some(v) if truthy(Some(v)) => common::json::js_number(js_to_number(v)),
            _ => json!(0),
        };
        Review {
            id: $r.id,
            product_id: $r.product_id,
            user_id: $r.user_id,
            order_item_id: $r.order_item_id,
            rating: $r.rating,
            review_details: details,
            is_verified_purchase: $r.is_verified_purchase,
            is_approved: $r.is_approved,
            approved_by: $r.approved_by,
            approved_at: $r.approved_at,
            created_at: $r.created_at,
            updated_at: $r.updated_at,
            extra: $extra,
            title,
            review_text,
            helpful_count,
        }
    }};
}

#[derive(Debug, Serialize)]
pub struct Reviewer {
    pub first_name: Option<String>,
    pub last_name: Option<String>,
}

/// One page of a product's approved reviews; `order` is the ORDER BY.
macro_rules! approved_page {
    ($pool:expr, $product:expr, $limit:expr, $offset:expr, $order:tt) => {
        sqlx::query!(
            r#"SELECT pr.id, pr.product_id, pr.user_id, pr.order_item_id, pr.rating,
                 pr.review_details AS "review_details: Value",
                 pr.is_verified_purchase AS "is_verified_purchase: i8",
                 pr.is_approved AS "is_approved: i8",
                 pr.approved_by, pr.approved_at, pr.created_at, pr.updated_at,
                 u.first_name AS "first_name: String", u.last_name AS "last_name: String"
               FROM product_reviews pr
               LEFT JOIN users u ON pr.user_id = u.id
               WHERE pr.product_id = ? AND pr.is_approved = 1
               ORDER BY "#
                + $order
                + " LIMIT ? OFFSET ?",
            $product,
            $limit,
            $offset
        )
        .fetch_all($pool)
        .await?
        .into_iter()
        .map(|r| {
            review!(
                r,
                Reviewer {
                    first_name: r.first_name,
                    last_name: r.last_name
                }
            )
        })
        .collect::<Vec<_>>()
    };
}

/// `x || 0` for a SUM/COUNT text (NULL over no rows).
fn or_zero(v: Option<String>) -> Value {
    v.map_or(json!(0), Value::String)
}

/// `GET /api/reviews/product/{productId}?page&limit&sort` (public)
async fn list(state: &AppState, parts: &Parts, product_id: String) -> Result<Response, ApiError> {
    let query = express::query(&parts.uri);
    // `const { page = 1, limit = 10, sort = 'recent' } = req.query`
    let page = query.get("page").map_or(1.0, express::parse_int);
    let limit = query.get("limit").map_or(10.0, express::parse_int);
    // `parseInt(x) || d` (NaN and 0 are falsy), then the clamps.
    let or = |n: f64, d: f64| if n.is_nan() || n == 0.0 { d } else { n };
    let page = or(page, 1.0).max(1.0);
    let limit = or(limit, 10.0).clamp(1.0, 100.0);
    let offset = (page - 1.0) * limit;
    let sort = query
        .get("sort")
        .and_then(Value::as_str)
        .unwrap_or("recent");

    // mysql2 binds a safe integer as one; beyond that the query fails and
    // Node lists nothing — as an offset that large would anyway.
    let pool = &state.pool;
    let reviews = if offset < 9_007_199_254_740_992.0 {
        let (limit, offset) = (limit as i64, offset as i64);
        match sort {
            "helpful" => approved_page!(
                pool,
                &product_id,
                limit,
                offset,
                "CAST(JSON_EXTRACT(pr.review_details, '$.helpful_count') AS UNSIGNED) DESC, pr.created_at DESC"
            ),
            "rating_high" => approved_page!(
                pool,
                &product_id,
                limit,
                offset,
                "pr.rating DESC, pr.created_at DESC"
            ),
            "rating_low" => approved_page!(
                pool,
                &product_id,
                limit,
                offset,
                "pr.rating ASC, pr.created_at DESC"
            ),
            _ => approved_page!(pool, &product_id, limit, offset, "pr.created_at DESC"),
        }
    } else {
        Vec::new()
    };

    let summary = sqlx::query!(
        r#"SELECT CAST(COUNT(*) AS CHAR) AS "total!: String",
             CAST(AVG(rating) AS CHAR) AS "avg_rating: String",
             CAST(SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) AS CHAR) AS "five_star: String",
             CAST(SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END) AS CHAR) AS "four_star: String",
             CAST(SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END) AS CHAR) AS "three_star: String",
             CAST(SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END) AS CHAR) AS "two_star: String",
             CAST(SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) AS CHAR) AS "one_star: String"
           FROM product_reviews
           WHERE product_id = ? AND is_approved = 1"#,
        product_id
    )
    .fetch_one(pool)
    .await?;
    // parseFloat(avg || 0).toFixed(1)
    let average = summary
        .avg_rating
        .as_deref()
        .map_or(0.0, |a| a.parse::<f64>().unwrap_or(f64::NAN));

    Ok(reply(
        StatusCode::OK,
        success(
            "Reviews fetched successfully",
            json!({
                "reviews": reviews,
                "summary": {
                    "total": summary.total,
                    "average_rating": common::json::js_to_fixed(average, 1),
                    "rating_distribution": {
                        "5": or_zero(summary.five_star),
                        "4": or_zero(summary.four_star),
                        "3": or_zero(summary.three_star),
                        "2": or_zero(summary.two_star),
                        "1": or_zero(summary.one_star),
                    },
                },
                "pagination": {
                    "page": common::json::js_number(page),
                    "limit": common::json::js_number(limit),
                    "total": summary.total,
                },
            }),
        ),
    ))
}

/// `parseInt(rating, 10)` within 1–5.
fn rating_in_range(n: f64) -> Option<u8> {
    (1.0..=5.0).contains(&n).then_some(n as u8)
}

/// `POST /api/reviews/create` `{ product_id, rating, title?, review_text }`
async fn create(state: &AppState, user: AuthUser, body: &Value) -> Result<Response, ApiError> {
    let product_id = body.get("product_id");
    let rating = body.get("rating");
    let title = body.get("title");
    let review_text = body.get("review_text");

    if !is_non_empty_string(product_id)
        || matches!(rating, None | Some(Value::Null))
        || !truthy(review_text)
    {
        return Ok(reply(
            StatusCode::BAD_REQUEST,
            failure("Missing required fields"),
        ));
    }
    if !is_optional_string(title) {
        return Ok(reply(
            StatusCode::BAD_REQUEST,
            failure("Title must be text"),
        ));
    }
    let Some(rating) = rating.map(express::parse_int).and_then(rating_in_range) else {
        return Ok(reply(
            StatusCode::BAD_REQUEST,
            failure("Rating must be between 1 and 5"),
        ));
    };
    let Some(Value::String(review_text)) = review_text.filter(|v| match v {
        Value::String(s) => !express::js_trim(s).is_empty(),
        _ => false,
    }) else {
        return Ok(reply(
            StatusCode::BAD_REQUEST,
            failure("Review text is required"),
        ));
    };
    let product_id = product_id.and_then(Value::as_str).unwrap_or_default();

    // One review per (user, product).
    let existing = sqlx::query_scalar!(
        "SELECT id FROM product_reviews WHERE user_id = ? AND product_id = ?",
        user.id,
        product_id
    )
    .fetch_optional(&state.pool)
    .await?;
    if existing.is_some() {
        return Ok(reply(
            StatusCode::CONFLICT,
            failure("You have already reviewed this product"),
        ));
    }

    // Verified purchase: a delivered order of this product, linked by its item.
    let order_item_id = sqlx::query_scalar!(
        "SELECT oi.id AS order_item_id
         FROM order_items oi
         JOIN orders o ON oi.order_id = o.id
         WHERE o.user_id = ? AND oi.product_id = ? AND o.status = 'delivered'
         LIMIT 1",
        user.id,
        product_id
    )
    .fetch_optional(&state.pool)
    .await?;

    let unable = || {
        reply(
            StatusCode::INTERNAL_SERVER_ERROR,
            failure("Unable to submit review"),
        )
    };
    let id = match sqlx::query_scalar!(r#"SELECT get_next_id('REV') AS "id: String""#)
        .fetch_one(&state.pool)
        .await
    {
        Ok(Some(id)) if !id.is_empty() => id,
        Ok(_) => {
            tracing::error!("transno prefix REV is not registered");
            return Ok(unable());
        }
        Err(err) => {
            tracing::error!(error = %err, "review id generation failed");
            return Ok(unable());
        }
    };

    #[derive(Serialize)]
    struct Details<'a> {
        title: &'a str,
        comment: &'a str,
    }
    let title = title.and_then(Value::as_str).unwrap_or_default();
    let details = serde_json::to_string(&Details {
        title: express::js_trim(title),
        comment: express::js_trim(review_text),
    })?;
    let verified = i8::from(order_item_id.is_some());
    let inserted = sqlx::query!(
        "INSERT INTO product_reviews
            (id, product_id, user_id, order_item_id, rating, review_details, is_verified_purchase, is_approved)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0)",
        id,
        product_id,
        user.id,
        order_item_id,
        rating,
        details,
        verified
    )
    .execute(&state.pool)
    .await;
    if let Err(err) = inserted {
        // e.g. a product id that doesn't exist (foreign key).
        tracing::error!(error = %err, "creating review failed");
        return Ok(unable());
    }

    Ok(reply(
        StatusCode::CREATED,
        success(
            "Review submitted successfully",
            json!({
                "id": id,
                "is_approved": false,
                "message": "Your review will be published after moderation",
            }),
        ),
    ))
}

/// `PUT /api/reviews/{id}` `{ rating?, title?, review_text? }` — own review only;
/// back to moderation.
async fn update(
    state: &AppState,
    user: AuthUser,
    id: String,
    body: &Value,
) -> Result<Response, ApiError> {
    let existing = sqlx::query!(
        r#"SELECT user_id, rating, review_details AS "review_details: Value"
           FROM product_reviews WHERE id = ?"#,
        id
    )
    .fetch_optional(&state.pool)
    .await?;
    let Some(existing) = existing else {
        return Ok(reply(StatusCode::NOT_FOUND, failure("Review not found")));
    };
    if existing.user_id != user.id {
        return Ok(reply(
            StatusCode::FORBIDDEN,
            failure("You can only edit your own reviews"),
        ));
    }

    let mut details = parse_details(express::js_json(existing.review_details));
    let rating = match body.get("rating") {
        Some(v) => rating_in_range(express::parse_int(v)),
        None => Some(existing.rating),
    };
    let Some(rating) = rating else {
        return Ok(reply(
            StatusCode::BAD_REQUEST,
            failure("Rating must be between 1 and 5"),
        ));
    };

    let comment = match body.get("review_text") {
        Some(v) => js_string(v),
        None => match first_truthy(&details, &["comment", "review_text"]) {
            Value::String(s) => s,
            // `.trim()` of a non-string throws: the route's catch.
            _ => return Err(anyhow::anyhow!("review_details.comment is not text").into()),
        },
    };
    let comment = express::js_trim(&comment).to_owned();
    if comment.is_empty() {
        return Ok(reply(
            StatusCode::BAD_REQUEST,
            failure("Review text is required"),
        ));
    }

    let title = match body.get("title") {
        Some(v) => Value::String(express::js_trim(&js_string(v)).to_owned()),
        None => first_truthy(&details, &["title"]),
    };
    // Assigning properties only sticks on an object (JSON.stringify drops the
    // extras on an array and a primitive ignores them).
    if let Value::Object(map) = &mut details {
        map.insert("title".into(), title);
        map.insert("comment".into(), Value::String(comment));
    }
    let details = serde_json::to_string(&details)?;

    // Editing resets moderation: back to pending, clear the old approval trail.
    let updated = sqlx::query!(
        "UPDATE product_reviews
         SET rating = ?, review_details = ?, is_approved = 0, approved_by = NULL, approved_at = NULL
         WHERE id = ? AND user_id = ?",
        rating,
        details,
        id,
        user.id
    )
    .execute(&state.pool)
    .await;
    if let Err(err) = updated {
        tracing::error!(error = %err, "updating review failed");
        return Ok(reply(
            StatusCode::INTERNAL_SERVER_ERROR,
            failure("Unable to update review"),
        ));
    }
    Ok(reply(
        StatusCode::OK,
        success(
            "Review updated successfully",
            json!({ "id": id, "is_approved": false }),
        ),
    ))
}

/// `DELETE /api/reviews/{id}` — the owner or an admin.
async fn remove(state: &AppState, user: AuthUser, id: String) -> Result<Response, ApiError> {
    let owner = sqlx::query_scalar!("SELECT user_id FROM product_reviews WHERE id = ?", id)
        .fetch_optional(&state.pool)
        .await?;
    let Some(owner) = owner else {
        return Ok(reply(StatusCode::NOT_FOUND, failure("Review not found")));
    };
    if !user.is_admin() && owner != user.id {
        return Ok(reply(
            StatusCode::FORBIDDEN,
            failure("You can only delete your own reviews"),
        ));
    }
    // Helpful votes go with it (ON DELETE CASCADE).
    let deleted = sqlx::query!("DELETE FROM product_reviews WHERE id = ?", id)
        .execute(&state.pool)
        .await;
    if let Err(err) = deleted {
        tracing::error!(error = %err, "deleting review failed");
        return Ok(reply(
            StatusCode::INTERNAL_SERVER_ERROR,
            failure("Unable to delete review"),
        ));
    }
    Ok(reply(
        StatusCode::OK,
        success("Review deleted successfully", json!([])),
    ))
}

/// `POST /api/reviews/{id}/helpful` — one vote per user on an approved review;
/// the tally is recounted into `review_details.helpful_count`.
async fn helpful(state: &AppState, user: AuthUser, id: String) -> Result<Response, ApiError> {
    let approved = sqlx::query_scalar!(
        r#"SELECT is_approved AS "is_approved: i8" FROM product_reviews WHERE id = ?"#,
        id
    )
    .fetch_optional(&state.pool)
    .await?;
    if approved.flatten() != Some(1) {
        return Ok(reply(StatusCode::NOT_FOUND, failure("Review not found")));
    }

    let unable = |err: sqlx::Error| {
        tracing::error!(error = %err, "recording helpful vote failed");
        reply(
            StatusCode::INTERNAL_SERVER_ERROR,
            failure("Unable to record vote"),
        )
    };
    // A repeat vote is a no-op (primary key).
    if let Err(err) = sqlx::query!(
        "INSERT IGNORE INTO review_helpful_votes (user_id, review_id) VALUES (?, ?)",
        user.id,
        id
    )
    .execute(&state.pool)
    .await
    {
        return Ok(unable(err));
    }
    let count = sqlx::query_scalar!(
        "SELECT COUNT(*) AS cnt FROM review_helpful_votes WHERE review_id = ?",
        id
    )
    .fetch_one(&state.pool)
    .await?;
    // mysql2 binds the JS number as a DOUBLE, so the JSON holds `1.0`.
    let tally = count as f64;
    if let Err(err) = sqlx::query!(
        "UPDATE product_reviews SET review_details = JSON_SET(review_details, '$.helpful_count', ?) WHERE id = ?",
        tally,
        id
    )
    .execute(&state.pool)
    .await
    {
        return Ok(unable(err));
    }
    Ok(reply(
        StatusCode::OK,
        success("Marked as helpful", json!({ "helpful_count": count })),
    ))
}

#[derive(Debug, Serialize)]
pub struct ReviewedProduct {
    pub product_name: Option<String>,
    pub product_slug: Option<String>,
}

/// `GET /api/reviews/user/{userId}` — yourself, or anyone for an admin.
async fn by_user(state: &AppState, user: AuthUser, user_id: String) -> Result<Response, ApiError> {
    if user_id != user.id && !user.is_admin() {
        return Ok(reply(StatusCode::FORBIDDEN, failure("Access denied")));
    }
    let reviews: Vec<_> = sqlx::query!(
        r#"SELECT pr.id, pr.product_id, pr.user_id, pr.order_item_id, pr.rating,
             pr.review_details AS "review_details: Value",
             pr.is_verified_purchase AS "is_verified_purchase: i8",
             pr.is_approved AS "is_approved: i8",
             pr.approved_by, pr.approved_at, pr.created_at, pr.updated_at,
             p.name AS "product_name: String", p.slug AS "product_slug: String"
           FROM product_reviews pr
           LEFT JOIN products p ON pr.product_id = p.id
           WHERE pr.user_id = ?
           ORDER BY pr.created_at DESC"#,
        user_id
    )
    .fetch_all(&state.pool)
    .await?
    .into_iter()
    .map(|r| {
        review!(
            r,
            ReviewedProduct {
                product_name: r.product_name,
                product_slug: r.product_slug
            }
        )
    })
    .collect();
    Ok(reply(
        StatusCode::OK,
        success(
            "User reviews fetched successfully",
            json!({ "reviews": reviews }),
        ),
    ))
}

#[derive(Debug, Serialize)]
pub struct PendingContext {
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub email: Option<String>,
    pub product_name: Option<String>,
}

/// `GET /api/reviews/admin/pending` (admin)
async fn pending(state: &AppState) -> Result<Response, ApiError> {
    let reviews: Vec<_> = sqlx::query!(
        r#"SELECT pr.id, pr.product_id, pr.user_id, pr.order_item_id, pr.rating,
             pr.review_details AS "review_details: Value",
             pr.is_verified_purchase AS "is_verified_purchase: i8",
             pr.is_approved AS "is_approved: i8",
             pr.approved_by, pr.approved_at, pr.created_at, pr.updated_at,
             u.first_name AS "first_name: String", u.last_name AS "last_name: String",
             u.email AS "email: String", p.name AS "product_name: String"
           FROM product_reviews pr
           LEFT JOIN users u ON pr.user_id = u.id
           LEFT JOIN products p ON pr.product_id = p.id
           WHERE pr.is_approved = 0
           ORDER BY pr.created_at DESC"#
    )
    .fetch_all(&state.pool)
    .await?
    .into_iter()
    .map(|r| {
        review!(
            r,
            PendingContext {
                first_name: r.first_name,
                last_name: r.last_name,
                email: r.email,
                product_name: r.product_name
            }
        )
    })
    .collect();
    Ok(reply(
        StatusCode::OK,
        success(
            "Pending reviews fetched successfully",
            json!({ "reviews": reviews }),
        ),
    ))
}

/// `PUT /api/reviews/admin/{id}/approve` (admin + CSRF)
async fn approve(state: &AppState, admin: AuthUser, id: String) -> Result<Response, ApiError> {
    let result = sqlx::query!(
        "UPDATE product_reviews SET is_approved = 1, approved_by = ?, approved_at = NOW() WHERE id = ?",
        admin.id,
        id
    )
    .execute(&state.pool)
    .await;
    Ok(match result {
        Err(err) => {
            tracing::error!(error = %err, "approving review failed");
            reply(
                StatusCode::INTERNAL_SERVER_ERROR,
                failure("Unable to approve review"),
            )
        }
        // Matched rows (CLIENT_FOUND_ROWS, as with mysql2).
        Ok(done) if done.rows_affected() == 0 => {
            reply(StatusCode::NOT_FOUND, failure("Review not found"))
        }
        Ok(_) => reply(
            StatusCode::OK,
            success("Review approved successfully", json!([])),
        ),
    })
}

/// `PUT /api/reviews/admin/{id}/reject` (admin + CSRF). There is no rejected
/// state, so rejecting deletes the review.
async fn reject(state: &AppState, id: String) -> Result<Response, ApiError> {
    let result = sqlx::query!("DELETE FROM product_reviews WHERE id = ?", id)
        .execute(&state.pool)
        .await;
    Ok(match result {
        Err(err) => {
            tracing::error!(error = %err, "rejecting review failed");
            reply(
                StatusCode::INTERNAL_SERVER_ERROR,
                failure("Unable to reject review"),
            )
        }
        Ok(done) if done.rows_affected() == 0 => {
            reply(StatusCode::NOT_FOUND, failure("Review not found"))
        }
        Ok(_) => reply(
            StatusCode::OK,
            success("Review rejected successfully", json!([])),
        ),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn details_parse_like_node() {
        assert_eq!(parse_details(json!(null)), json!({}));
        assert_eq!(parse_details(json!("")), json!({}));
        assert_eq!(parse_details(json!({"a": 1})), json!({"a": 1}));
        assert_eq!(parse_details(json!("{\"a\":1}")), json!({"a": 1}));
        assert_eq!(parse_details(json!("nope")), json!({}));
        assert_eq!(parse_details(json!(5)), json!(5));
    }

    #[test]
    fn flat_fields_follow_or_chains() {
        let d = json!({"title": "", "comment": "c", "body": "b"});
        assert_eq!(first_truthy(&d, &["title"]), json!(""));
        assert_eq!(
            first_truthy(&d, &["review_text", "comment", "body"]),
            json!("c")
        );
        assert_eq!(first_truthy(&json!([1]), &["title"]), json!(""));
    }

    #[test]
    fn rating_bounds() {
        assert_eq!(rating_in_range(1.0), Some(1));
        assert_eq!(rating_in_range(5.0), Some(5));
        assert_eq!(rating_in_range(0.0), None);
        assert_eq!(rating_in_range(6.0), None);
        assert_eq!(rating_in_range(f64::NAN), None);
        assert_eq!(rating_in_range(1e20), None);
    }

    /// The whole mount point reaches the Express-style router (requests that
    /// stop at the 404 or at auth, so no database is needed).
    #[tokio::test]
    async fn every_path_under_both_mount_points_is_dispatched() {
        use axum::body::Body;
        use tower::ServiceExt;

        let pool = sqlx::mysql::MySqlPoolOptions::new()
            .connect_lazy("mysql://root@127.0.0.1:1/none")
            .unwrap();
        let app = crate::router_with_limiter(
            AppState::new(pool, Some("test-secret")),
            crate::ratelimit::RateLimiter::new(
                crate::ratelimit::presets::global(),
                crate::client_ip::TrustProxy(0),
            ),
        );
        for (method, uri, status) in [
            ("GET", "/api/reviews", 404),
            ("GET", "/api/reviews/", 404),
            ("GET", "/api/reviews/a/b/c?x=1", 404),
            ("POST", "/api/reviews/admin/helpful", 401),
            ("POST", "/api/reviews/product/helpful", 401),
            ("PUT", "/api/reviews/create", 401),
            ("GET", "/api/reviews/admin/pending", 401),
            ("GET", "/api/returns", 404),
            ("DELETE", "/api/returns/x", 404),
            ("PUT", "/api/returns/my-returns/status", 401),
            ("GET", "/api/returns/request", 401),
            ("GET", "/api/returns/%ZZ", 500),
        ] {
            let req = axum::http::Request::builder()
                .method(method)
                .uri(uri)
                .body(Body::empty())
                .unwrap();
            let res = app.clone().oneshot(req).await.unwrap();
            assert_eq!(res.status().as_u16(), status, "{method} {uri}");
            let bytes = axum::body::to_bytes(res.into_body(), 1 << 20)
                .await
                .unwrap();
            let body: Value = serde_json::from_slice(&bytes).unwrap();
            if status == 404 {
                assert_eq!(body["message"], "Endpoint not found");
                assert_eq!(body["keyValueTable"]["path"], uri, "{method} {uri}");
            }
        }
    }
}
