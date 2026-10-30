//! `/api/database` — backend/routes/databaseRoutes.js: the connection test,
//! the table list, the `transno` counters and the dev-only raw `SELECT`
//! endpoint, every route behind `protect, admin`.
//!
//! The whole mount point goes through [`dispatch`], routed like the Express
//! router ([`crate::express_router`]): OPTIONS is the CORS preflight's 204, a
//! body `express.json()` / `express.urlencoded()` rejects is the error
//! handler's 500 before any auth, GET also answers HEAD, and any other path
//! or method is Node's 404.
//!
//! `POST /query` is default-deny exactly like Node: it answers only when
//! `NODE_ENV` is `development` or `test` **and** `ENABLE_RAW_SQL=true` (read
//! per request, as `process.env` is), only for text starting with `select`,
//! and returns the rows as mysql2 types them ([`crate::mysql_json`]).
//!
//! The connection details `/test` reports are Node's `dbConfig`
//! (`DB_HOST || 'localhost'`, `parseInt(DB_PORT) || 3306`, `DB_NAME ||
//! 'bed_texture_ecommerce'`, `DB_USER || 'root'`), and `/tables` lists the
//! schema named by `DB_NAME` the same way — the API reads the same `DB_*`
//! variables as the backend.

use axum::Json;
use axum::body::Body;
use axum::extract::{Request, State};
use axum::http::{Method, StatusCode};
use axum::response::{IntoResponse, Response};
use common::response::{failure, failure_with, success};
use serde_json::{Map, Value, json};
use sqlx::Executor;

use crate::AppState;
use crate::auth::Admin;
use crate::express_router::{Routed, Verb};
use crate::mysql_json::{self, Js};

/// Where the group is mounted (`app.use('/api/database', databaseRoutes)`).
pub const PREFIX: &str = "/api/database";

#[derive(Debug, Clone, Copy)]
enum R {
    Test,
    Tables,
    Transno,
    Query,
}

/// databaseRoutes.js, in registration order.
const ROUTES: &[(Verb, &str, R)] = &[
    (Verb::Get, "/test", R::Test),
    (Verb::Get, "/tables", R::Tables),
    (Verb::Get, "/transno", R::Transno),
    (Verb::Post, "/query", R::Query),
];

/// `/api/database` and every path below it, all to [`dispatch`].
pub fn router(_state: &AppState) -> axum::Router<AppState> {
    let all = axum::routing::any(dispatch);
    axum::Router::new()
        .route(PREFIX, all.clone())
        .route(&format!("{PREFIX}/"), all.clone())
        .route(&format!("{PREFIX}/{{*rest}}"), all)
}

fn reply(status: StatusCode, body: Value) -> Response {
    (status, Json(body)).into_response()
}

/// Every request under `/api/database`.
pub async fn dispatch(State(state): State<AppState>, req: Request) -> Response {
    let head = req.method() == Method::HEAD;
    let response = handle(state, req).await;
    if head {
        let (parts, _) = response.into_parts();
        return Response::from_parts(parts, Body::empty());
    }
    response
}

async fn handle(state: AppState, req: Request) -> Response {
    let (mut parts, body) = req.into_parts();
    // cors() answers every preflight.
    if parts.method == Method::OPTIONS {
        return StatusCode::NO_CONTENT.into_response();
    }
    // express.json() / express.urlencoded() run before any route.
    let body = match crate::express::read_body(&parts.headers, body).await {
        Ok(body) => body,
        Err(response) => return response,
    };
    let path = crate::admin::strip_mount(parts.uri.path(), PREFIX).unwrap_or("/");
    let route = match crate::express_router::route(ROUTES, &parts.method, path) {
        Routed::Route(route, _) => route,
        Routed::NotFound => return crate::express::not_found(&parts.uri),
        Routed::Error(message) => return crate::express_router::error(&message),
    };
    // Every route: protect, admin.
    if let Err(denied) = crate::routes::reviews::guard::<Admin>(&mut parts, &state).await {
        return denied;
    }
    match route {
        R::Test => test(&state).await,
        R::Tables => tables(&state).await,
        R::Transno => transno(&state).await,
        R::Query => query(&state, &body).await,
    }
}

/// `process.env[name] || fallback` (no trimming, empty is unset).
fn env_or(name: &str, fallback: &str) -> String {
    std::env::var(name)
        .ok()
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| fallback.to_owned())
}

/// `process.env.DB_NAME || 'bed_texture_ecommerce'`.
fn db_name() -> String {
    env_or("DB_NAME", "bed_texture_ecommerce")
}

/// `parseInt(process.env.DB_PORT) || 3306`.
fn db_port() -> Value {
    let n = std::env::var("DB_PORT")
        .map(|p| crate::csv::js_parse_int(&p))
        .unwrap_or(f64::NAN);
    common::json::js_number(if n.is_nan() || n == 0.0 { 3306.0 } else { n })
}

/// `GET /api/database/test` (`DatabaseUtil.testConnection()`): a failed
/// probe is still a 200, with only `connected: false` (the other keys are
/// `undefined`).
async fn test(state: &AppState) -> Response {
    let probe =
        mysql_json::fetch_rows(&state.pool, "SELECT 1 as test, VERSION() as version", &[]).await;
    let key_value_table = match probe {
        Ok(rows) => json!({
            "connected": true,
            "host": env_or("DB_HOST", "localhost"),
            "port": db_port(),
            "database": db_name(),
            "user": env_or("DB_USER", "root"),
            "version": rows.first().and_then(|r| r.get("version")).map_or(Value::Null, Js::to_json),
            "databaseExists": true,
        }),
        Err(err) => {
            tracing::error!(error = %err, "database test: probe failed");
            json!({ "connected": false })
        }
    };
    reply(
        StatusCode::OK,
        success("Database connection test completed", key_value_table),
    )
}

/// `GET /api/database/tables`
async fn tables(state: &AppState) -> Response {
    let schema = Value::String(db_name());
    let count = mysql_json::fetch_rows(
        &state.pool,
        "SELECT COUNT(*) as table_count FROM information_schema.tables WHERE table_schema = ?",
        std::slice::from_ref(&schema),
    )
    .await;
    let list = mysql_json::fetch_rows(
        &state.pool,
        "SELECT table_name FROM information_schema.tables WHERE table_schema = ? ORDER BY table_name",
        std::slice::from_ref(&schema),
    )
    .await;
    match (count, list) {
        (Ok(count), Ok(list)) => {
            // row.table_name || row.TABLE_NAME (MySQL 8 names it TABLE_NAME)
            let name = |r: &mysql_json::JsRow| match r.get("table_name").filter(|v| v.truthy()) {
                Some(v) => table_name(v),
                None => r.get("TABLE_NAME").map_or(Value::Null, table_name),
            };
            let tables: Vec<Value> = list.iter().map(name).collect();
            reply(
                StatusCode::OK,
                success(
                    "Table count retrieved successfully",
                    json!({
                        "success": true,
                        "count": count
                            .first()
                            .and_then(|r| r.get("table_count"))
                            .map_or(Value::Null, Js::to_json),
                        "tables": tables,
                    }),
                ),
            )
        }
        (count, list) => {
            for err in [count.err(), list.err()].into_iter().flatten() {
                tracing::error!(error = %err, "database tables: query failed");
            }
            reply(
                StatusCode::INTERNAL_SERVER_ERROR,
                failure_with(
                    "Failed to get table count",
                    json!({ "success": false, "error": "Failed to retrieve table information" }),
                ),
            )
        }
    }
}

/// information_schema's TABLE_NAME is `utf8mb3_bin` text, which sqlx (no
/// charset) reports as binary: mysql2 hands Node a string.
fn table_name(v: &Js) -> Value {
    match v {
        Js::Buffer(bytes) => Value::String(String::from_utf8_lossy(bytes).into_owned()),
        other => other.to_json(),
    }
}

/// `GET /api/database/transno`: the rows, a message when there are none, or
/// the query's error — always a 200.
async fn transno(state: &AppState) -> Response {
    let key_value_table =
        match mysql_json::fetch_rows(&state.pool, "SELECT * FROM transno", &[]).await {
            Ok(rows) if !rows.is_empty() => {
                Value::Array(rows.iter().map(|r| Value::Object(r.to_json())).collect())
            }
            Ok(_) => json!({ "message": "No data found in transno table" }),
            Err(err) => json!({ "error": mysql_json::error_message(&err) }),
        };
    reply(
        StatusCode::OK,
        success("Transno data retrieved successfully", key_value_table),
    )
}

/// `process.env.NODE_ENV` is development/test and `ENABLE_RAW_SQL === 'true'`.
fn raw_sql_enabled() -> bool {
    let env = std::env::var("NODE_ENV").unwrap_or_default();
    let is_dev = env == "development" || env == "test";
    is_dev && std::env::var("ENABLE_RAW_SQL").as_deref() == Ok("true")
}

/// mysql2's `execute()` argument check, then the parameters it sends.
fn bind_params(params: Option<&Value>) -> Result<Vec<Value>, String> {
    match params {
        // `params = []`
        None => Ok(Vec::new()),
        Some(Value::Array(items)) => Ok(items.clone()),
        // A falsy `values` is "no parameters"…
        Some(v) if !crate::body::truthy(Some(v)) => Ok(Vec::new()),
        // …anything else that isn't an array is a TypeError.
        Some(_) => Err(
            "Bind parameters must be array if namedPlaceholders parameter is not enabled".into(),
        ),
    }
}

/// `executeQuery(query, params)` for the raw endpoint: rows as mysql2 types
/// them, or (a statement with no result set, like `SELECT … INTO @v`) the
/// ResultSetHeader-like object mysql2 resolves with.
async fn run_raw(state: &AppState, sql: &str, params: &[Value]) -> Result<Value, String> {
    let message = |err: sqlx::Error| mysql_json::error_message(&err);
    let statement = state.pool.prepare(sql).await.map_err(message)?;
    // mysql2 sends exactly the statement's parameter count: extra values are
    // dropped, too few is the server's ER_WRONG_ARGUMENTS. (sqlx would send
    // them all, and the server misreads the packet.)
    let wanted = match sqlx::Statement::parameters(&statement) {
        Some(sqlx::Either::Right(n)) => n,
        Some(sqlx::Either::Left(types)) => types.len(),
        None => params.len(),
    };
    if params.len() < wanted {
        return Err("Incorrect arguments to COM_STMT_EXECUTE".into());
    }
    let params = &params[..wanted];
    if sqlx::Statement::columns(&statement).is_empty() {
        let mut query = sqlx::query(sql);
        for p in params {
            query = mysql_json::bind(query, p);
        }
        let done = query.execute(&state.pool).await.map_err(message)?;
        return Ok(json!({
            "fieldCount": 0,
            "affectedRows": done.rows_affected(),
            "insertId": done.last_insert_id(),
            "info": "",
            "serverStatus": 2,
            "warningStatus": 0,
            "changedRows": 0,
        }));
    }
    let rows = mysql_json::fetch_rows(&state.pool, sql, params)
        .await
        .map_err(message)?;
    Ok(Value::Array(
        rows.iter().map(|r| Value::Object(r.to_json())).collect(),
    ))
}

/// `POST /api/database/query` `{ query, params = [] }` (dev/test only).
async fn query(state: &AppState, body: &Value) -> Response {
    if !raw_sql_enabled() {
        return reply(StatusCode::FORBIDDEN, failure("Query endpoint disabled"));
    }
    let field = |k: &str| match body {
        Value::Object(m) => m.get(k),
        _ => None,
    };
    let sql_value = field("query");
    if !crate::body::truthy(sql_value) {
        return reply(
            StatusCode::BAD_REQUEST,
            failure_with(
                "Query is required",
                json!({ "error": "Query parameter is required" }),
            ),
        );
    }
    let sql_value = sql_value.cloned().unwrap_or(Value::Null);
    let failed = |error: String| {
        tracing::error!(%error, "Query execution error");
        reply(
            StatusCode::INTERNAL_SERVER_ERROR,
            failure_with(
                "Query execution failed",
                json!({ "error": error, "query": sql_value.clone() }),
            ),
        )
    };
    // `query.trim()` on a non-string is a TypeError.
    let Value::String(sql) = &sql_value else {
        return failed("query.trim is not a function".into());
    };
    if !crate::express::js_trim(sql)
        .to_lowercase()
        .starts_with("select")
    {
        return reply(
            StatusCode::FORBIDDEN,
            failure_with(
                "Only SELECT queries are allowed",
                json!({
                    "error": "Only SELECT queries are allowed for security reasons",
                    "provided_query": format!("{}...", crate::express::js_slice(sql, 50)),
                }),
            ),
        );
    }
    let params = match bind_params(field("params")) {
        Ok(p) => p,
        Err(message) => return failed(message),
    };
    match run_raw(state, sql, &params).await {
        Ok(results) => {
            let mut kvt = Map::new();
            kvt.insert("query".into(), sql_value.clone());
            // `rows.length` (undefined, so absent, for a result header)
            if let Value::Array(rows) = &results {
                kvt.insert("record_count".into(), json!(rows.len()));
            }
            kvt.insert("results".into(), results);
            reply(
                StatusCode::OK,
                success("Query executed successfully", Value::Object(kvt)),
            )
        }
        Err(message) => failed(message),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn params_follow_mysql2s_execute_check() {
        assert_eq!(bind_params(None), Ok(vec![]));
        assert_eq!(bind_params(Some(&json!(null))), Ok(vec![]));
        assert_eq!(bind_params(Some(&json!(0))), Ok(vec![]));
        assert_eq!(bind_params(Some(&json!(""))), Ok(vec![]));
        assert_eq!(
            bind_params(Some(&json!([1, "a"]))),
            Ok(vec![json!(1), json!("a")])
        );
        for bad in [json!("x"), json!(5), json!({ "a": 1 }), json!(true)] {
            assert!(bind_params(Some(&bad)).is_err(), "{bad}");
        }
    }

    #[test]
    fn routes_match_like_express() {
        let r = |m: Method, p: &str| {
            matches!(
                crate::express_router::route(ROUTES, &m, p),
                Routed::Route(_, _)
            )
        };
        assert!(r(Method::GET, "/test"));
        assert!(r(Method::HEAD, "/TEST/"));
        assert!(r(Method::POST, "/query"));
        assert!(!r(Method::GET, "/query"));
        assert!(!r(Method::POST, "/test"));
        assert!(!r(Method::GET, "/"));
    }
}
