//! `/api/images` — backend/routes/imageRoutes.js with services/s3Service.js:
//! admin image uploads (`multer` memory storage, 10 MB, JPEG/PNG/GIF/WebP by
//! declared type), product images with three sharp-style thumbnails
//! ([`crate::imaging`]), and deletion; files go to S3 or the local uploads
//! directory ([`crate::s3`]).
//!
//! Routed like Express ([`crate::express_router`]): the app's JSON/urlencoded
//! parsers first (a body they reject is the 500 before auth), then
//! `protect` → `admin` (no CSRF on these routes, as in Node) → `upload.single
//! ('image')` (its errors are the app error handler's 500), then the route.
//! Unrouted paths and methods get the app's 404; OPTIONS the CORS 204.

use axum::Json;
use axum::body::Body;
use axum::extract::{Request, State};
use axum::http::{Method, StatusCode};
use axum::response::{IntoResponse, Response};
use common::response::{failure, success};
use serde_json::{Map, Value, json};

use crate::AppState;
use crate::auth::Admin;
use crate::email_queue::uuid_v4;
use crate::express_router::{self as express, Routed, Verb};
use crate::imaging::{THUMBNAIL_SIZES, thumbnail};
use crate::multer::{FileInfo, Limits, Multer, Storage as MulterStorage};
use crate::routes::reviews::guard;
use crate::s3::{STORAGE, Uploaded};

/// Where the group is mounted (`app.use('/api/images', ...)`).
pub const PREFIX: &str = "/api/images";

const ALLOWED_TYPES: [&str; 4] = ["image/jpeg", "image/png", "image/gif", "image/webp"];

fn file_filter(file: &FileInfo) -> Result<bool, String> {
    if ALLOWED_TYPES.contains(&file.mimetype.as_str()) {
        Ok(true)
    } else {
        Err("Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.".into())
    }
}

/// imageRoutes.js's `upload`.
const UPLOAD: Multer = Multer {
    storage: MulterStorage::Memory,
    limits: Limits {
        file_size: Some(10 * 1024 * 1024),
        ..Limits::NONE
    },
    file_filter: Some(file_filter),
};

#[derive(Debug, Clone, Copy)]
enum R {
    Upload,
    Product,
    Delete,
}

/// imageRoutes.js, in registration order.
const ROUTES: &[(Verb, &str, R)] = &[
    (Verb::Post, "/upload", R::Upload),
    (Verb::Post, "/product/:productId", R::Product),
    (Verb::Delete, "/:imageId", R::Delete),
];

/// `/api/images` and every path below it, all to [`dispatch`].
pub fn router(_state: &AppState) -> axum::Router<AppState> {
    let all = axum::routing::any(dispatch);
    axum::Router::new()
        .route(PREFIX, all.clone())
        .route(&format!("{PREFIX}/"), all.clone())
        .route(&format!("{PREFIX}/{{*path}}"), all)
}

fn reply(status: StatusCode, body: Value) -> Response {
    (status, Json(body)).into_response()
}

/// `res.status(500).json(ResponseFormatter.failure(error.message || fallback))`.
fn server_error(message: &str, fallback: &str) -> Response {
    let message = if message.is_empty() {
        fallback
    } else {
        message
    };
    reply(StatusCode::INTERNAL_SERVER_ERROR, failure(message))
}

/// Does express.json() or express.urlencoded() read this body?
fn parsed_by_body_parsers(headers: &axum::http::HeaderMap) -> bool {
    let has_body = headers.contains_key(axum::http::header::TRANSFER_ENCODING)
        || headers.contains_key(axum::http::header::CONTENT_LENGTH);
    has_body
        && headers
            .get(axum::http::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .map(|ct| {
                ct.split(';')
                    .next()
                    .unwrap_or("")
                    .trim()
                    .to_ascii_lowercase()
            })
            .is_some_and(|m| m == "application/json" || m == "application/x-www-form-urlencoded")
}

/// Every request under `/api/images`.
pub async fn dispatch(State(state): State<AppState>, req: Request) -> Response {
    let (mut parts, body) = req.into_parts();
    // cors() answers every preflight before anything else runs.
    if parts.method == Method::OPTIONS {
        return StatusCode::NO_CONTENT.into_response();
    }
    // express.json() / express.urlencoded() run first; multipart stays
    // unread for multer.
    let body = if parsed_by_body_parsers(&parts.headers) {
        if let Err(response) = crate::express::read_body(&parts.headers, body).await {
            return response;
        }
        Body::empty()
    } else {
        body
    };
    let path = parts.uri.path().strip_prefix(PREFIX).unwrap_or_default();
    // One extra slash belongs to the mount path (`/api/images//upload`).
    let path = if path.starts_with("//") {
        &path[1..]
    } else {
        path
    };
    let (route, params) = match express::route(ROUTES, &parts.method, path) {
        Routed::Route(route, params) => (route, params),
        Routed::NotFound => return express::not_found(&parts.uri),
        Routed::Error(message) => return express::error(&message),
    };
    let param = params.into_iter().next().unwrap_or_default();
    // protect, admin
    if let Err(denied) = guard::<Admin>(&mut parts, &state).await {
        return denied;
    }
    match route {
        R::Upload | R::Product => {
            let upload = match UPLOAD.single("image", &parts.headers, body).await {
                Ok(upload) => upload,
                Err(err) => return err.into_response(),
            };
            let Some(file) = upload.file else {
                return reply(StatusCode::BAD_REQUEST, failure("No image file provided"));
            };
            let buffer = file.buffer.unwrap_or_default();
            match route {
                R::Upload => upload_image(buffer, &file.originalname, &file.mimetype).await,
                _ => product_image(&state, &param, buffer, &file.originalname).await,
            }
        }
        R::Delete => delete_image(&state, &param).await,
    }
}

/// Node's `path.extname` (POSIX).
pub fn extname(path: &str) -> &str {
    let b = path.as_bytes();
    let (mut start_dot, mut start_part, mut end) = (None::<usize>, 0, None::<usize>);
    let mut matched_slash = true;
    // 0: no dot seen before the last one; 1: one; -1: other characters.
    let mut pre_dot_state = 0i8;
    for i in (0..b.len()).rev() {
        let c = b[i];
        if c == b'/' {
            if !matched_slash {
                start_part = i + 1;
                break;
            }
            continue;
        }
        if end.is_none() {
            matched_slash = false;
            end = Some(i + 1);
        }
        if c == b'.' {
            if start_dot.is_none() {
                start_dot = Some(i);
            } else if pre_dot_state != 1 {
                pre_dot_state = 1;
            }
        } else if start_dot.is_some() {
            pre_dot_state = -1;
        }
    }
    let (Some(start_dot), Some(end)) = (start_dot, end) else {
        return "";
    };
    if pre_dot_state == 0
        || (pre_dot_state == 1 && start_dot == end - 1 && start_dot == start_part + 1)
    {
        return "";
    }
    &path[start_dot..end]
}

/// The upload route's extension: `extname(name).toLowerCase()` with anything
/// but `[a-z0-9.]` removed, kept only if it is an image extension.
pub fn safe_extension(name: &str) -> &'static str {
    let ext: String = extname(name)
        .to_lowercase()
        .chars()
        .filter(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || *c == '.')
        .collect();
    match ext.as_str() {
        ".jpg" => ".jpg",
        ".jpeg" => ".jpeg",
        ".png" => ".png",
        ".gif" => ".gif",
        ".webp" => ".webp",
        _ => ".jpg",
    }
}

/// s3Service.js's `getMimeType(ext)`.
pub fn mime_type(ext: &str) -> &'static str {
    match ext.to_lowercase().as_str() {
        ".jpg" | ".jpeg" => "image/jpeg",
        ".png" => "image/png",
        ".gif" => "image/gif",
        ".webp" => "image/webp",
        ".svg" => "image/svg+xml",
        _ => "application/octet-stream",
    }
}

/// `POST /api/images/upload` (multipart `image`).
async fn upload_image(buffer: Vec<u8>, originalname: &str, mimetype: &str) -> Response {
    let key = match uuid_v4() {
        Ok(id) => format!("general/{id}{}", safe_extension(originalname)),
        Err(err) => return server_error(&err.to_string(), "Failed to upload image"),
    };
    match STORAGE.upload_file(buffer, &key, mimetype).await {
        Ok(Uploaded { url, key }) => Json(success(
            "Image uploaded successfully",
            json!({ "url": url, "key": key }),
        ))
        .into_response(),
        Err(message) => {
            tracing::error!(%message, "image upload failed");
            server_error(&message, "Failed to upload image")
        }
    }
}

/// s3Service.js's `uploadProductImage(buffer, originalName, productId)`: the
/// original, then each thumbnail (a failed one is `None`, as Node's `null`).
async fn upload_product_image(
    buffer: Vec<u8>,
    original_name: &str,
    product_id: &str,
) -> Result<(Uploaded, Vec<Option<Uploaded>>), String> {
    // Allowlisted, as the /upload route does: never the client's .svg/.html.
    let ext = safe_extension(original_name);
    let base = uuid_v4().map_err(|e| e.to_string())?;
    let prefix = format!("products/{product_id}");
    let original = STORAGE
        .upload_file(
            buffer.clone(),
            &format!("{prefix}/{base}_original{ext}"),
            mime_type(ext),
        )
        .await?;
    let mut thumbnails = Vec::new();
    for (name, size) in THUMBNAIL_SIZES {
        let input = buffer.clone();
        let resized = tokio::task::spawn_blocking(move || thumbnail(&input, size))
            .await
            .unwrap_or_else(|e| Err(e.to_string()));
        let uploaded = match resized {
            Ok(jpeg) => {
                STORAGE
                    .upload_file(jpeg, &format!("{prefix}/{base}_{name}.jpg"), "image/jpeg")
                    .await
            }
            Err(message) => Err(message),
        };
        thumbnails.push(
            uploaded
                .map_err(|message| {
                    tracing::error!(%message, "Error generating {name} thumbnail");
                })
                .ok(),
        );
    }
    Ok((original, thumbnails))
}

/// `POST /api/images/product/:productId` (multipart `image`).
async fn product_image(
    state: &AppState,
    product_id: &str,
    buffer: Vec<u8>,
    originalname: &str,
) -> Response {
    const FAILED: &str = "Failed to upload product image";
    // A failed lookup reads as "not found", as DatabaseUtil.first does.
    let product = sqlx::query_scalar!("SELECT id FROM products WHERE id = ?", product_id)
        .fetch_optional(&state.pool)
        .await
        .inspect_err(|error| tracing::error!(%error, "product image: product lookup failed"))
        .ok()
        .flatten();
    if product.is_none() {
        return reply(StatusCode::NOT_FOUND, failure("Product not found"));
    }

    let (original, thumbnails) = match upload_product_image(buffer, originalname, product_id).await
    {
        Ok(result) => result,
        Err(message) => {
            tracing::error!(%message, "product image upload failed");
            return server_error(&message, FAILED);
        }
    };

    // MAX(sort_order) + 1 (the max read as a number; see imageRoutes.js).
    let max_sort = sqlx::query_scalar!(
        "SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM product_images WHERE product_id = ?",
        product_id
    )
    .fetch_one(&state.pool)
    .await
    .inspect_err(|error| tracing::error!(%error, "product image: sort order lookup failed"))
    .unwrap_or(0);
    let sort_order = max_sort + 1;

    let image_id = match uuid_v4() {
        Ok(id) => id,
        Err(err) => return server_error(&err.to_string(), FAILED),
    };
    let url = |i: usize| {
        thumbnails[i]
            .as_ref()
            .map_or_else(|| original.url.clone(), |t| t.url.clone())
    };
    let inserted = sqlx::query!(
        "INSERT INTO product_images (id, product_id, original_url, thumbnail_small_url, thumbnail_medium_url, thumbnail_large_url, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
        image_id,
        product_id,
        original.url,
        url(0),
        url(1),
        url(2),
        sort_order
    )
    .execute(&state.pool)
    .await;
    if let Err(error) = inserted {
        tracing::error!(%error, "product image: insert failed");
        return server_error("Failed to save product image", FAILED);
    }

    let mut thumbs = Map::new();
    for ((name, _), thumb) in THUMBNAIL_SIZES.iter().zip(&thumbnails) {
        if let Some(t) = thumb {
            thumbs.insert((*name).to_owned(), Value::String(t.url.clone()));
        }
    }
    Json(success(
        "Product image uploaded successfully",
        json!({ "imageId": image_id, "original": original.url, "thumbnails": thumbs }),
    ))
    .into_response()
}

/// The storage key of a stored image URL, as the delete route derives it.
pub fn key_of(url: &str) -> String {
    match url.split_once("amazonaws.com/") {
        // `url.split('amazonaws.com/')[1]`: up to a second occurrence.
        Some((_, rest)) => rest.split("amazonaws.com/").next().unwrap_or("").to_owned(),
        None => url.replacen("/uploads/", "", 1),
    }
}

/// `DELETE /api/images/:imageId`.
async fn delete_image(state: &AppState, image_id: &str) -> Response {
    let image = sqlx::query!(
        "SELECT original_url, thumbnail_small_url, thumbnail_medium_url, thumbnail_large_url FROM product_images WHERE id = ?",
        image_id
    )
    .fetch_optional(&state.pool)
    .await
    .inspect_err(|error| tracing::error!(%error, "delete image: lookup failed"))
    .ok()
    .flatten();
    let Some(image) = image else {
        return reply(StatusCode::NOT_FOUND, failure("Image not found"));
    };
    let urls = [
        Some(image.original_url),
        image.thumbnail_small_url,
        image.thumbnail_medium_url,
        image.thumbnail_large_url,
    ];
    for url in urls.into_iter().flatten().filter(|u| !u.is_empty()) {
        if let Err(message) = STORAGE.delete_file(&key_of(&url)).await {
            tracing::warn!(%url, %message, "Non-fatal: could not delete file");
        }
    }
    if let Err(error) = sqlx::query!("DELETE FROM product_images WHERE id = ?", image_id)
        .execute(&state.pool)
        .await
    {
        // Unchecked in Node too: the route still answers success.
        tracing::error!(%error, "delete image: delete failed");
    }
    Json(success("Image deleted successfully", json!([]))).into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// path.extname and the routes' extension handling, recorded from Node.
    #[test]
    fn extensions_match_node() {
        let f: Value =
            serde_json::from_str(include_str!("../../fixtures/payments_images.json")).unwrap();
        for case in f["paths"].as_array().unwrap() {
            let name = case["name"].as_str().unwrap();
            assert_eq!(extname(name), case["extname"], "{name}");
            assert_eq!(safe_extension(name), case["uploadExt"], "{name}");
            let product_ext = match extname(name).to_lowercase() {
                e if e.is_empty() => ".jpg".to_owned(),
                e => e,
            };
            assert_eq!(product_ext, case["productExt"].as_str().unwrap(), "{name}");
            assert_eq!(mime_type(&product_ext), case["mime"], "{name}");
        }
        assert_eq!(extname("a/b.c/"), ".c");
        assert_eq!(extname("dir.x/file"), "");
    }

    #[test]
    fn keys_from_urls() {
        assert_eq!(
            key_of("/uploads/products/P1/a_small.jpg"),
            "products/P1/a_small.jpg"
        );
        assert_eq!(
            key_of("https://b.s3.us-east-1.amazonaws.com/products/P1/a.jpg"),
            "products/P1/a.jpg"
        );
        assert_eq!(key_of("https://x.amazonaws.com/a/amazonaws.com/b"), "a/");
        assert_eq!(key_of("/images/bedding/x.jpg"), "/images/bedding/x.jpg");
        assert_eq!(key_of("/x/uploads/y/uploads/z"), "/xy/uploads/z");
    }
}
