//! `GET /api/journal`, `/api/journal/{idOrSlug}` — published editorial articles
//! (port of backend/routes/journalRoutes.js).

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use chrono::{DateTime, Utc};
use common::response::{failure_with, success};
use serde::Serialize;
use serde_json::{Value, json};

use crate::AppState;
use crate::error::ApiError;
use crate::params::{self, Pairs};

/// List entry: everything except the article body.
#[derive(Debug, Serialize)]
pub struct ArticleSummary {
    pub id: String,
    pub slug: String,
    pub title: String,
    pub excerpt: Option<String>,
    pub category: String,
    pub author: Option<String>,
    pub hero_image: Option<String>,
    pub read_minutes: Option<u32>,
    #[serde(serialize_with = "common::timestamp::optional")]
    pub published_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize)]
pub struct Article {
    pub id: String,
    pub slug: String,
    pub title: String,
    pub excerpt: Option<String>,
    pub content: String,
    pub category: String,
    pub author: Option<String>,
    pub hero_image: Option<String>,
    pub read_minutes: Option<u32>,
    #[serde(serialize_with = "common::timestamp::optional")]
    pub published_at: Option<DateTime<Utc>>,
    #[serde(serialize_with = "common::timestamp::optional")]
    pub created_at: Option<DateTime<Utc>>,
    #[serde(serialize_with = "common::timestamp::optional")]
    pub updated_at: Option<DateTime<Utc>>,
}

/// `GET /api/journal?category=&limit=` — newest first; `category=All` means all;
/// `limit` defaults to 50 (also for ≤0 / non-numeric) and caps at 100.
pub async fn list(
    State(state): State<AppState>,
    Query(pairs): Query<Pairs>,
) -> Result<Json<Value>, ApiError> {
    let category = params::first(&pairs, "category").filter(|c| *c != "All");
    let limit = params::first(&pairs, "limit")
        .and_then(params::js_parse_int)
        .filter(|n| *n > 0)
        .unwrap_or(50)
        .min(100);

    let articles = sqlx::query_as!(
        ArticleSummary,
        r#"SELECT id, slug, title, excerpt, category, author, hero_image, read_minutes, published_at
           FROM journal_articles
           WHERE status = 'published' AND (? IS NULL OR category = ?)
           ORDER BY published_at DESC, created_at DESC, id ASC
           LIMIT ?"#,
        category,
        category,
        limit
    )
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(success(
        "Journal articles fetched successfully",
        json!({ "articles": articles }),
    )))
}

/// `GET /api/journal/{idOrSlug}` — one published article by id (JRNL...) or slug.
pub async fn detail(
    State(state): State<AppState>,
    Path(id_or_slug): Path<String>,
) -> Result<Response, ApiError> {
    let article = sqlx::query_as!(
        Article,
        r#"SELECT id, slug, title, excerpt, content, category, author,
             hero_image, read_minutes, published_at, created_at, updated_at
           FROM journal_articles
           WHERE (id = ? OR slug = ?) AND status = 'published'
           LIMIT 1"#,
        id_or_slug,
        id_or_slug
    )
    .fetch_optional(&state.pool)
    .await?;
    Ok(match article {
        Some(article) => Json(success(
            "Journal article fetched successfully",
            json!({ "article": article }),
        ))
        .into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(failure_with(
                "Article not found",
                json!({ "idOrSlug": id_or_slug }),
            )),
        )
            .into_response(),
    })
}
