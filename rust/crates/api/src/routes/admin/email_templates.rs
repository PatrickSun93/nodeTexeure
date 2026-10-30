//! Mount `/api/admin/email-templates` (behind `protect, admin`):
//! backend/routes/emailTemplateRoutes.js — list, detail, create, update and
//! delete of `email_templates`; the writes also run `csrfProtection`.
//!
//! Request values are bound the way mysql2 binds them (`mysql_json::bind`:
//! numbers as DOUBLE, booleans as TINY, arrays/objects as their JSON text), so
//! a non-string `name` or `subject` is stored exactly as Node stores it.

use axum::http::StatusCode;
use axum::response::Response;
use common::response::{failure, failure_with, success};
use serde_json::{Map, Value, json};

use crate::admin::{AdminRequest, Routes, Step::*, json};
use crate::body::truthy;
use crate::mysql_json::{self, Js, JsRow};

/// `VALID_FIELDS` (template_content is only written through `content`).
const VALID_FIELDS: [&str; 7] = [
    "name",
    "subject",
    "category",
    "type",
    "status",
    "preheader",
    "template_content",
];

pub fn register(r: &mut Routes) {
    // The mount already ran `protect, admin`.
    r.get("/", &[], list);
    r.get("/:id", &[], detail);
    r.post("/", &[Csrf], create);
    r.put("/:id", &[Csrf], update);
    r.delete("/:id", &[Csrf], remove);
}

fn server_error(message: &str, err: &sqlx::Error) -> Response {
    json(
        StatusCode::INTERNAL_SERVER_ERROR,
        failure_with(message, json!({ "error": mysql_json::error_message(err) })),
    )
}

fn get(row: &JsRow, key: &str) -> Value {
    row.get(key).map_or(Value::Null, Js::to_json)
}

/// `GET /api/admin/email-templates`
async fn list(req: AdminRequest) -> Response {
    let rows = match mysql_json::fetch_rows(
        &req.state.pool,
        "SELECT id, name, subject, category, type, status, preheader, updated_at, created_at, is_active FROM email_templates ORDER BY updated_at DESC",
        &[],
    )
    .await
    {
        Ok(rows) => rows,
        Err(err) => {
            tracing::error!(error = %err, "Error fetching email templates");
            return server_error("Server error", &err);
        }
    };
    let templates: Vec<Value> = rows
        .iter()
        .map(|t| {
            // t.status || (t.is_active ? 'Active' : 'Inactive')
            let status = match t.get("status") {
                Some(s) if s.truthy() => s.to_json(),
                _ => Value::String(
                    if t.get("is_active").is_some_and(Js::truthy) {
                        "Active"
                    } else {
                        "Inactive"
                    }
                    .into(),
                ),
            };
            json!({
                "id": get(t, "id"),
                "name": get(t, "name"),
                "subject": get(t, "subject"),
                "category": get(t, "category"),
                "type": get(t, "type"),
                "status": status,
                "preheader": get(t, "preheader"),
                "lastEdited": get(t, "updated_at"),
                "updated_at": get(t, "updated_at"),
                "created_at": get(t, "created_at"),
            })
        })
        .collect();
    json(
        StatusCode::OK,
        success("Email templates fetched successfully", templates),
    )
}

/// `GET /api/admin/email-templates/:id` (`SELECT *`, with a template_content
/// that is a JSON string parsed once more).
async fn detail(req: AdminRequest) -> Response {
    let id = Value::String(req.param(0).to_owned());
    let rows = match mysql_json::fetch_rows(
        &req.state.pool,
        "SELECT * FROM email_templates WHERE id = ?",
        &[id],
    )
    .await
    {
        Ok(rows) => rows,
        Err(err) => {
            tracing::error!(error = %err, "Error fetching template");
            return server_error("Server error", &err);
        }
    };
    let Some(mut template) = rows.into_iter().next() else {
        return json(StatusCode::NOT_FOUND, failure("Template not found"));
    };
    if let Some(Js::String(text)) = template.get("template_content")
        && let Ok(parsed) = serde_json::from_str::<Value>(text)
    {
        let parsed = Js::from_json(&crate::express_router::js_json(parsed));
        template.set("template_content", parsed);
    }
    json(
        StatusCode::OK,
        success(
            "Template details fetched successfully",
            json!([Value::Object(template.to_json())]),
        ),
    )
}

/// `JSON.stringify(value)` of a request value (numbers as JavaScript writes
/// them; MySQL normalizes the JSON text anyway).
fn stringify(value: &Value) -> String {
    crate::express_router::js_json(value.clone()).to_string()
}

/// `req.body[key]` (destructuring an array or `{}` gives `undefined`).
fn field<'a>(body: &'a Value, key: &str) -> Option<&'a Value> {
    match body {
        Value::Object(m) => m.get(key),
        _ => None,
    }
}

/// `value || null`
fn or_null(v: Option<&Value>) -> Value {
    match v {
        Some(v) if truthy(Some(v)) => v.clone(),
        _ => Value::Null,
    }
}

/// `POST /api/admin/email-templates` `{ name, subject, category, type, preheader, content }`
async fn create(req: AdminRequest) -> Response {
    let body = &req.body;
    let name = field(body, "name");
    let subject = field(body, "subject");
    if !truthy(name) || !truthy(subject) {
        return json(
            StatusCode::BAD_REQUEST,
            failure("Name and Subject are required"),
        );
    }
    let content = field(body, "content");
    let template_content = if truthy(content) {
        stringify(content.unwrap_or(&Value::Null))
    } else {
        "{}".to_owned()
    };
    let result: Result<Option<String>, sqlx::Error> = async {
        let id = sqlx::query_scalar!(r#"SELECT get_next_id('EMAIL') AS "id: String""#)
            .fetch_one(&req.state.pool)
            .await?;
        let params = [
            json!(id),
            name.cloned().unwrap_or(Value::Null),
            subject.cloned().unwrap_or(Value::Null),
            or_null(field(body, "category")),
            or_null(field(body, "type")),
            Value::String("Draft".into()),
            or_null(field(body, "preheader")),
            Value::String(template_content),
            json!(1),
        ];
        let mut query = sqlx::query(
            "
      INSERT INTO email_templates
      (id, name, subject, category, type, status, preheader, template_content, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ",
        );
        for p in &params {
            query = mysql_json::bind(query, p);
        }
        query.execute(&req.state.pool).await?;
        Ok(id)
    }
    .await;
    match result {
        Ok(id) => json(
            StatusCode::CREATED,
            success("Template created successfully", json!([{ "id": id }])),
        ),
        Err(err) => {
            tracing::error!(error = %err, "Error creating template");
            if mysql_json::error_message(&err).contains("Duplicate entry") {
                return json(
                    StatusCode::CONFLICT,
                    failure("A template with this name already exists"),
                );
            }
            server_error("Failed to create template", &err)
        }
    }
}

/// `PUT /api/admin/email-templates/:id`: the body's VALID_FIELDS (and
/// `content` → template_content), plus `updated_at = NOW()`.
async fn update(req: AdminRequest) -> Response {
    let empty = Map::new();
    let updates = match &req.body {
        Value::Object(m) => m,
        // Object.keys of an array are its indices: none is a valid field.
        _ => &empty,
    };
    let mut fields: Vec<String> = Vec::new();
    let mut values: Vec<Value> = Vec::new();
    if let Some(content) = updates.get("content") {
        fields.push("template_content = ?".into());
        values.push(Value::String(stringify(content)));
    }
    for (key, value) in updates {
        if VALID_FIELDS.contains(&key.as_str()) && key != "template_content" {
            fields.push(format!("{key} = ?"));
            values.push(value.clone());
        }
    }
    fields.push("updated_at = NOW()".into());
    if fields.len() == 1 {
        return json(StatusCode::OK, success("No changes to save", json!([])));
    }
    values.push(Value::String(req.param(0).to_owned()));
    let sql = format!(
        "UPDATE email_templates SET {} WHERE id = ?",
        fields.join(", ")
    );
    let mut query = sqlx::query(&sql);
    for v in &values {
        query = mysql_json::bind(query, v);
    }
    match query.execute(&req.state.pool).await {
        Ok(done) if done.rows_affected() == 0 => {
            json(StatusCode::NOT_FOUND, failure("Template not found"))
        }
        Ok(_) => json(
            StatusCode::OK,
            success("Template updated successfully", json!([])),
        ),
        Err(err) => {
            tracing::error!(error = %err, "Error updating template");
            server_error("Server error", &err)
        }
    }
}

/// `DELETE /api/admin/email-templates/:id`
async fn remove(req: AdminRequest) -> Response {
    let id = req.param(0).to_owned();
    match sqlx::query!("DELETE FROM email_templates WHERE id = ?", id)
        .execute(&req.state.pool)
        .await
    {
        Ok(done) if done.rows_affected() == 0 => {
            json(StatusCode::NOT_FOUND, failure("Template not found"))
        }
        Ok(_) => json(
            StatusCode::OK,
            success("Template deleted successfully", json!([])),
        ),
        Err(err) => {
            tracing::error!(error = %err, "Error deleting template");
            server_error("Server error", &err)
        }
    }
}
