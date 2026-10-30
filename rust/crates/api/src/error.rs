//! Handler errors. Internal details are logged, never sent to the client.

use axum::Json;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use common::response::failure;

#[derive(Debug)]
pub struct ApiError(anyhow::Error);

impl<E: Into<anyhow::Error>> From<E> for ApiError {
    fn from(err: E) -> Self {
        Self(err.into())
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        tracing::error!(error = %format!("{:#}", self.0), "request failed");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(failure("Server error")),
        )
            .into_response()
    }
}
