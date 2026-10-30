//! Mount `/api/admin/email-queue`: backend/routes/emailQueueRoutes.js.
//!
//! The admin view of the `email_queue` table the transactional mail pipeline
//! runs on (producer: `crate::email_queue` / emailQueueProducer.js, consumer:
//! the Rust email daemon). No mount-level middleware: every route runs
//! `protect, admin` itself, then this router's own limiter pair
//! (`Limiter::EmailQueueRead` / `Limiter::EmailQueueWrite`, separate stores
//! from limiters.js's), and the writes `csrfProtection`.
//!
//! The worker status is a heuristic over the table, as in Node: the daemon is
//! a separate process, so "health" is read from what it leaves behind (sends
//! in the last 5 minutes, the age of the oldest pending row).
//!
//! UI status vocabulary ↔ DB status: queued ↔ pending, sending ↔ processing,
//! sent, failed, cancelled.

use axum::http::StatusCode;
use axum::response::Response;
use common::json::{js_number, js_number_string};
use common::response::{failure_with, success};
use serde_json::{Value, json};
use sqlx::MySqlPool;

use crate::admin::Limiter::{EmailQueueRead, EmailQueueWrite};
use crate::admin::{AdminRequest, Routes, Step::*, clamp_int, int_or, json};
use crate::mysql_json::{self, Js, JsRow};

pub fn register(r: &mut Routes) {
    // router.get('/', protect, admin, adminReadLimiter, handler)
    r.get("/", &[Protect, Admin, Limit(EmailQueueRead)], list);
    r.get(
        "/worker-status",
        &[Protect, Admin, Limit(EmailQueueRead)],
        worker_status,
    );
    // router.post('/retry-failed', protect, admin, adminWriteLimiter, csrfProtection, handler)
    r.post(
        "/retry-failed",
        &[Protect, Admin, Limit(EmailQueueWrite), Csrf],
        retry_failed,
    );
    r.post(
        "/:id/retry",
        &[Protect, Admin, Limit(EmailQueueWrite), Csrf],
        retry_one,
    );
}

/// `UI_TO_DB_STATUS[bucket]` (own keys only).
fn ui_to_db(bucket: &str) -> Option<&'static str> {
    Some(match bucket {
        "queued" => "pending",
        "sending" => "processing",
        "sent" => "sent",
        "failed" => "failed",
        "cancelled" => "cancelled",
        _ => return None,
    })
}

/// `dbStatusToBucket(raw)`: `String(raw || '').toLowerCase()` mapped back.
fn bucket(raw: Option<&Js>) -> Option<&'static str> {
    let s = match raw {
        Some(v) if v.truthy() => v.js_string().to_lowercase(),
        _ => String::new(),
    };
    Some(match s.as_str() {
        "pending" => "queued",
        "processing" => "sending",
        "sent" => "sent",
        "failed" => "failed",
        "cancelled" => "cancelled",
        _ => return None,
    })
}

/// `Number(v)`, 0 unless finite (`toNum`).
fn to_num(v: Option<&Js>) -> f64 {
    let n = match v {
        None => f64::NAN,
        Some(Js::Date(Some(d))) => d.and_utc().timestamp_millis() as f64,
        Some(Js::Date(None)) => f64::NAN,
        Some(Js::Buffer(b)) => {
            crate::body::js_to_number(&Value::String(String::from_utf8_lossy(b).into_owned()))
        }
        Some(js) => crate::body::js_to_number(&js.to_json()),
    };
    if n.is_finite() { n } else { 0.0 }
}

/// `row.x || null` in `res.json`.
fn or_null(v: Option<&Js>) -> Value {
    match v {
        Some(js) if js.truthy() => js.to_json(),
        _ => Value::Null,
    }
}

/// `extractError(processing_details)`: the daemon's `error_message` (or an
/// `error`) out of the JSON column; a string that isn't JSON is returned as is.
fn extract_error(details: Option<&Js>) -> Value {
    let Some(details) = details.filter(|d| d.truthy()) else {
        return Value::Null;
    };
    let obj = match details {
        Js::String(s) => match serde_json::from_str::<Value>(s) {
            Ok(v) => crate::express_router::js_json(v),
            Err(_) => return Value::String(s.clone()),
        },
        other => other.to_json(),
    };
    match &obj {
        Value::Object(m) => {
            for key in ["error_message", "error"] {
                if let Some(v) = m.get(key).filter(|v| crate::body::truthy(Some(v))) {
                    return v.clone();
                }
            }
            Value::Null
        }
        // Arrays are objects too, without those keys.
        _ => Value::Null,
    }
}

const BUCKETS: [&str; 5] = ["queued", "sending", "sent", "failed", "cancelled"];

/// `getStatusCounts()`: a failed query counts nothing (its rows are `[]`).
async fn status_counts(pool: &MySqlPool) -> ([f64; 5], f64) {
    let rows = mysql_json::fetch_rows(
        pool,
        "SELECT status, COUNT(*) AS count FROM email_queue GROUP BY status",
        &[],
    )
    .await
    .unwrap_or_else(|err| {
        tracing::error!(error = %err, "email queue: status counts failed");
        Vec::new()
    });
    let mut counts = [0.0; 5];
    let mut total = 0.0;
    for row in &rows {
        let n = to_num(row.get("count"));
        total += n;
        if let Some(b) = bucket(row.get("status"))
            && let Some(i) = BUCKETS.iter().position(|x| *x == b)
        {
            counts[i] += n;
        }
    }
    (counts, total)
}

/// `getWorkerStatus()`.
async fn worker(pool: &MySqlPool) -> Value {
    let row = mysql_json::fetch_rows(
        pool,
        "SELECT
        SUM(status = 'pending') AS pending_total,
        SUM(status = 'pending' AND scheduled_at <= NOW()) AS pending_ready,
        SUM(status = 'processing') AS sending_total,
        SUM(status = 'failed') AS failed_total,
        TIMESTAMPDIFF(SECOND, MIN(CASE WHEN status = 'pending' THEN created_at END), NOW()) AS oldest_pending_age_seconds,
        MAX(sent_at) AS last_sent_at,
        SUM(status = 'sent' AND sent_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)) AS sent_last_hour
     FROM email_queue",
        &[],
    )
    .await
    .unwrap_or_else(|err| {
        tracing::error!(error = %err, "email queue: worker status failed");
        Vec::new()
    })
    .into_iter()
    .next()
    .unwrap_or_default();
    let pending_total = to_num(row.get("pending_total"));
    let sending_total = to_num(row.get("sending_total"));
    let oldest_age = match row.get("oldest_pending_age_seconds") {
        None | Some(Js::Null) => None,
        v => Some(to_num(v)),
    };
    let last_sent = row.get("last_sent_at").filter(|v| v.truthy());
    let sent_last_hour = to_num(row.get("sent_last_hour"));

    // `new Date(lastSentAt).getTime()`
    let last_sent_ms = last_sent.map(|v| match v {
        Js::Date(Some(d)) => d.and_utc().timestamp_millis() as f64,
        _ => f64::NAN,
    });
    let now = chrono::Utc::now().timestamp_millis() as f64;
    let recently_active = last_sent_ms.is_some_and(|ms| now - ms < 5.0 * 60.0 * 1000.0);

    let health = if pending_total == 0.0 && sending_total == 0.0 {
        "idle"
    } else if recently_active {
        "active"
    } else if oldest_age.is_some_and(|age| age > 600.0) {
        "backlog"
    } else {
        "waiting"
    };
    json!({
        "health": health,
        "pendingCount": js_number(pending_total),
        "sendingCount": js_number(sending_total),
        "oldestQueuedAgeSeconds": oldest_age.map(js_number),
        "lastSentAt": last_sent.map_or(Value::Null, Js::to_json),
        "sentLastHour": js_number(sent_last_hour),
    })
}

fn email(row: &JsRow) -> Value {
    let status = row.get("status");
    json!({
        "id": row.get("id").map_or(Value::Null, Js::to_json),
        "to": row.get("to_email").map_or(Value::Null, Js::to_json),
        "toName": or_null(row.get("to_name")),
        "subject": or_null(row.get("subject")),
        "template": match row.get("template_name").filter(|v| v.truthy()) {
            Some(name) => name.to_json(),
            None => or_null(row.get("template_id")),
        },
        "status": match bucket(status) {
            Some(b) => b.to_owned(),
            // String(row.status || 'unknown')
            None => match status {
                Some(s) if s.truthy() => s.js_string(),
                _ => "unknown".to_owned(),
            },
        },
        "rawStatus": status.map_or(Value::Null, Js::to_json),
        "attempts": js_number(to_num(row.get("attempts"))),
        // toNum(row.max_attempts) || 3
        "maxAttempts": js_number(Some(to_num(row.get("max_attempts"))).filter(|n| *n != 0.0).unwrap_or(3.0)),
        "scheduledAt": or_null(row.get("scheduled_at")),
        "sentAt": or_null(row.get("sent_at")),
        "createdAt": or_null(row.get("created_at")),
        "error": extract_error(row.get("processing_details")),
    })
}

/// `GET /api/admin/email-queue?status=&limit=&offset=`
async fn list(req: AdminRequest) -> Response {
    let query = req.query();
    // String(req.query.status || 'all').toLowerCase()
    let raw_status = match query.get("status") {
        Some(v) if crate::body::truthy(Some(v)) => crate::body::js_string(v).to_lowercase(),
        _ => "all".to_owned(),
    };
    let db_status = ui_to_db(&raw_status);
    let has_filter = raw_status != "all" && db_status.is_some();

    let limit = clamp_int(query.get("limit"), 50.0, 1.0, 200.0);
    let offset = int_or(query.get("offset"), 0.0).max(0.0);

    let filter = if has_filter {
        "WHERE eq.status = ?"
    } else {
        ""
    };
    let params: Vec<Value> = db_status
        .filter(|_| has_filter)
        .map(|s| vec![Value::String(s.into())])
        .unwrap_or_default();
    // LIMIT/OFFSET inlined from the sanitized numbers (as `${limit}` writes them).
    let sql = format!(
        "SELECT eq.id, eq.to_email, eq.to_name, eq.subject, eq.template_id,
              eq.status, eq.attempts, eq.max_attempts, eq.scheduled_at,
              eq.sent_at, eq.created_at, eq.processing_details,
              t.name AS template_name
         FROM email_queue eq
         LEFT JOIN email_templates t ON eq.template_id = t.id
         {filter}
         ORDER BY eq.created_at DESC
         LIMIT {} OFFSET {}",
        js_number_string(limit),
        js_number_string(offset)
    );
    let rows = match mysql_json::fetch_rows(&req.state.pool, &sql, &params).await {
        Ok(rows) => rows,
        Err(err) => {
            tracing::error!(error = %err, "Email queue list error");
            let message = mysql_json::error_message(&err);
            let message = if message.is_empty() {
                "Failed to load email queue".to_owned()
            } else {
                message
            };
            return json(
                StatusCode::INTERNAL_SERVER_ERROR,
                failure_with("Failed to load email queue", json!({ "error": message })),
            );
        }
    };
    let emails: Vec<Value> = rows.iter().map(email).collect();
    let (counts, total) = status_counts(&req.state.pool).await;
    let worker = worker(&req.state.pool).await;

    let total_matching = if has_filter {
        BUCKETS
            .iter()
            .position(|b| *b == raw_status)
            .map_or(0.0, |i| counts[i])
    } else {
        total
    };
    let mut counts_json = serde_json::Map::new();
    for (name, n) in BUCKETS.iter().zip(counts) {
        counts_json.insert((*name).to_owned(), js_number(n));
    }
    counts_json.insert("total".into(), js_number(total));
    let returned = emails.len();
    json(
        StatusCode::OK,
        success(
            "Email queue loaded",
            json!([
                { "emails": emails },
                { "counts": counts_json },
                { "worker": worker },
                {
                    "pagination": {
                        "limit": js_number(limit),
                        "offset": js_number(offset),
                        "returned": returned,
                        "totalMatching": js_number(total_matching),
                        "filter": if has_filter { raw_status.as_str() } else { "all" },
                    }
                },
            ]),
        ),
    )
}

/// `GET /api/admin/email-queue/worker-status`
async fn worker_status(req: AdminRequest) -> Response {
    let worker = worker(&req.state.pool).await;
    json(
        StatusCode::OK,
        success("Worker status", json!([{ "worker": worker }])),
    )
}

/// `POST /api/admin/email-queue/retry-failed`: every failed row back to
/// pending, attempts reset, due now, error cleared.
async fn retry_failed(req: AdminRequest) -> Response {
    let result = sqlx::query!(
        "UPDATE email_queue
          SET status = 'pending', attempts = 0, scheduled_at = NOW(), processing_details = NULL
        WHERE status = 'failed'"
    )
    .execute(&req.state.pool)
    .await;
    match result {
        Ok(done) => {
            let requeued = done.rows_affected();
            json(
                StatusCode::OK,
                success(
                    &format!("Requeued {requeued} failed email(s)"),
                    json!([{ "requeued": requeued }]),
                ),
            )
        }
        Err(err) => {
            tracing::error!(error = %err, "Email queue retry-failed error");
            json(
                StatusCode::INTERNAL_SERVER_ERROR,
                failure_with(
                    "Failed to requeue emails",
                    json!({ "error": mysql_json::error_message(&err) }),
                ),
            )
        }
    }
}

/// `POST /api/admin/email-queue/:id/retry`: one failed/cancelled row.
async fn retry_one(req: AdminRequest) -> Response {
    let id = req.param(0).to_owned();
    // `if (!id)`: a `:id` segment is never empty, kept for the shape.
    if id.is_empty() {
        return json(
            StatusCode::BAD_REQUEST,
            common::response::failure("Email id is required"),
        );
    }
    let result = sqlx::query!(
        "UPDATE email_queue
          SET status = 'pending', attempts = 0, scheduled_at = NOW(), processing_details = NULL
        WHERE id = ? AND status IN ('failed', 'cancelled')",
        id
    )
    .execute(&req.state.pool)
    .await;
    match result {
        Ok(done) if done.rows_affected() == 0 => json(
            StatusCode::NOT_FOUND,
            failure_with(
                "Email not found or not in a retryable state",
                json!([{ "id": id }]),
            ),
        ),
        Ok(_) => json(
            StatusCode::OK,
            success("Email requeued", json!([{ "id": id }])),
        ),
        Err(err) => {
            tracing::error!(error = %err, "Email queue single retry error");
            json(
                StatusCode::INTERNAL_SERVER_ERROR,
                failure_with(
                    "Failed to requeue email",
                    json!({ "error": mysql_json::error_message(&err) }),
                ),
            )
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn statuses_map_both_ways() {
        for b in BUCKETS {
            let db = ui_to_db(b).unwrap();
            assert_eq!(bucket(Some(&Js::String(db.into()))), Some(b));
        }
        assert_eq!(ui_to_db("constructor"), None);
        assert_eq!(ui_to_db("all"), None);
        assert_eq!(bucket(Some(&Js::String("PENDING".into()))), Some("queued"));
        assert_eq!(bucket(Some(&Js::Null)), None);
        assert_eq!(bucket(None), None);
    }

    #[test]
    fn errors_come_out_of_processing_details() {
        let j = |v: Value| Some(Js::Json(v));
        assert_eq!(
            extract_error(j(json!({ "error_message": "boom", "error": "x" })).as_ref()),
            json!("boom")
        );
        assert_eq!(
            extract_error(j(json!({ "error_message": "", "error": "x" })).as_ref()),
            json!("x")
        );
        assert_eq!(extract_error(j(json!([1])).as_ref()), Value::Null);
        assert_eq!(extract_error(j(json!(0)).as_ref()), Value::Null);
        assert_eq!(
            extract_error(Some(&Js::String("not json".into()))),
            json!("not json")
        );
        assert_eq!(
            extract_error(Some(&Js::String(r#"{"error":"inner"}"#.into()))),
            json!("inner")
        );
        assert_eq!(extract_error(Some(&Js::String("5".into()))), Value::Null);
        assert_eq!(extract_error(None), Value::Null);
    }

    #[test]
    fn to_num_is_number_or_zero() {
        assert_eq!(to_num(Some(&Js::String("12".into()))), 12.0);
        assert_eq!(to_num(Some(&Js::String("x".into()))), 0.0);
        assert_eq!(to_num(Some(&Js::Null)), 0.0);
        assert_eq!(to_num(None), 0.0);
        assert_eq!(to_num(Some(&Js::Number(3.0))), 3.0);
    }
}
