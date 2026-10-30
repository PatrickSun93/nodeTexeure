//! Where uploaded images go, as backend/services/s3Service.js decides:
//!
//! * **S3** when `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are set and
//!   the key id isn't the `.env.example` placeholder (`your-aws…`): a
//!   `PutObject` to `AWS_S3_BUCKET_NAME` (default `your-s3-bucket-name`) in
//!   `AWS_REGION` (default `us-east-1`) with `ACL: public-read` and the given
//!   content type, using exactly those static credentials (like the Node
//!   client, no session token or profile chain); the URL is
//!   `https://<bucket>.s3.<region>.amazonaws.com/<key>`.
//! * **Local files** otherwise: `<uploads>/<key>`, URL `/uploads/<key>`,
//!   refusing a key that resolves outside the uploads directory. Node writes
//!   to `backend/uploads` (and serves it at `/uploads`); this service writes
//!   to `UPLOADS_DIR`, default `uploads` under its working directory — run it
//!   from `backend/` or point `UPLOADS_DIR` at the same directory (a shared
//!   volume in Docker) so both services see the same files.
//!
//! Deleting works the same way (`DeleteObject`, or unlinking the file if it
//! exists).

use std::path::{Component, Path, PathBuf};
use std::sync::LazyLock;

use aws_sdk_s3::config::{BehaviorVersion, Credentials, Region};
use aws_sdk_s3::primitives::ByteStream;
use aws_sdk_s3::types::ObjectCannedAcl;

/// The storage, from the environment (read once, like the Node module).
pub static STORAGE: LazyLock<Storage> = LazyLock::new(Storage::from_env);

/// `{ url, key }` of an uploaded file.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Uploaded {
    pub url: String,
    pub key: String,
}

pub enum Storage {
    Local {
        root: PathBuf,
    },
    S3 {
        client: aws_sdk_s3::Client,
        bucket: String,
        region: String,
    },
}

/// `process.env[name] || fallback`.
fn env_or(name: &str, fallback: &str) -> String {
    std::env::var(name)
        .ok()
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| fallback.to_owned())
}

/// The uploads directory, absolute.
pub fn uploads_dir() -> PathBuf {
    let dir = PathBuf::from(env_or("UPLOADS_DIR", "uploads"));
    std::path::absolute(&dir).unwrap_or(dir)
}

impl Storage {
    pub fn from_env() -> Self {
        let id = std::env::var("AWS_ACCESS_KEY_ID").unwrap_or_default();
        let secret = std::env::var("AWS_SECRET_ACCESS_KEY").unwrap_or_default();
        let bucket = env_or("AWS_S3_BUCKET_NAME", "your-s3-bucket-name");
        let region = env_or("AWS_REGION", "us-east-1");
        if !id.is_empty() && !secret.is_empty() && !id.contains("your-aws") {
            tracing::info!("AWS S3 storage for image uploads");
            Self::s3(client(&id, &secret, &region, None), bucket, region)
        } else {
            Self::Local {
                root: uploads_dir(),
            }
        }
    }

    pub fn s3(client: aws_sdk_s3::Client, bucket: String, region: String) -> Self {
        Self::S3 {
            client,
            bucket,
            region,
        }
    }

    /// `uploadFile(buffer, key, contentType)`.
    pub async fn upload_file(
        &self,
        buffer: Vec<u8>,
        key: &str,
        content_type: &str,
    ) -> Result<Uploaded, String> {
        match self {
            Self::Local { root } => save_locally(root, &buffer, key).await,
            Self::S3 {
                client,
                bucket,
                region,
            } => {
                client
                    .put_object()
                    .bucket(bucket)
                    .key(key)
                    .body(ByteStream::from(buffer))
                    .content_type(content_type)
                    .acl(ObjectCannedAcl::PublicRead)
                    .send()
                    .await
                    .map_err(s3_message)?;
                Ok(Uploaded {
                    url: format!("https://{bucket}.s3.{region}.amazonaws.com/{key}"),
                    key: key.to_owned(),
                })
            }
        }
    }

    /// `deleteFile(key)`.
    pub async fn delete_file(&self, key: &str) -> Result<(), String> {
        match self {
            Self::Local { root } => {
                let path = inside(root, key)?;
                if tokio::fs::symlink_metadata(&path).await.is_ok() {
                    tokio::fs::remove_file(&path)
                        .await
                        .map_err(|e| io_message(&e, "unlink", &path))?;
                }
                Ok(())
            }
            Self::S3 { client, bucket, .. } => {
                client
                    .delete_object()
                    .bucket(bucket)
                    .key(key)
                    .send()
                    .await
                    .map_err(s3_message)?;
                Ok(())
            }
        }
    }
}

/// An S3 client with static credentials (`endpoint` for tests).
pub fn client(id: &str, secret: &str, region: &str, endpoint: Option<&str>) -> aws_sdk_s3::Client {
    let mut config = aws_sdk_s3::Config::builder()
        .behavior_version(BehaviorVersion::latest())
        .region(Region::new(region.to_owned()))
        .credentials_provider(Credentials::new(id, secret, None, None, "environment"));
    if let Some(url) = endpoint {
        config = config.endpoint_url(url).force_path_style(true);
    }
    aws_sdk_s3::Client::from_conf(config.build())
}

/// The message the AWS SDK for JavaScript puts on a failed command: the
/// service's `Message` (or its code), else the SDK's own description.
fn s3_message<E, R>(err: aws_sdk_s3::error::SdkError<E, R>) -> String
where
    E: aws_sdk_s3::error::ProvideErrorMetadata + std::error::Error + 'static,
    R: std::fmt::Debug,
{
    if let Some(service) = err.as_service_error() {
        if let Some(message) = service.message() {
            return message.to_owned();
        }
        if let Some(code) = service.code() {
            return code.to_owned();
        }
    }
    aws_sdk_s3::error::DisplayErrorContext(err).to_string()
}

/// `path.resolve(path.join(root, key))`: lexical, no symlinks followed.
fn join_normalized(root: &Path, key: &str) -> PathBuf {
    let mut out = PathBuf::new();
    for part in root.join(key.trim_start_matches('/')).components() {
        match part {
            Component::ParentDir => {
                out.pop();
            }
            Component::CurDir => {}
            other => out.push(other),
        }
    }
    out
}

/// The file for `key`, which must stay inside `root` (s3Service.js's
/// path-traversal guard).
fn inside(root: &Path, key: &str) -> Result<PathBuf, String> {
    let root = join_normalized(root, "");
    let path = join_normalized(&root, key);
    if path.starts_with(&root) && path != root {
        Ok(path)
    } else {
        Err("Invalid upload path".into())
    }
}

/// Node's message for a failed fs call: `CODE: description, syscall 'path'`.
fn io_message(err: &std::io::Error, syscall: &str, path: &Path) -> String {
    use std::io::ErrorKind as K;
    let (code, text) = match err.kind() {
        K::NotFound => ("ENOENT", "no such file or directory"),
        K::PermissionDenied => ("EACCES", "permission denied"),
        K::AlreadyExists => ("EEXIST", "file already exists"),
        K::IsADirectory => ("EISDIR", "illegal operation on a directory"),
        K::NotADirectory => ("ENOTDIR", "not a directory"),
        K::StorageFull => ("ENOSPC", "no space left on device"),
        K::ReadOnlyFilesystem => ("EROFS", "read-only file system"),
        _ => return format!("{err}, {syscall} '{}'", path.display()),
    };
    format!("{code}: {text}, {syscall} '{}'", path.display())
}

/// `saveLocally(buffer, key)`.
async fn save_locally(root: &Path, buffer: &[u8], key: &str) -> Result<Uploaded, String> {
    let path = inside(root, key)?;
    if let Some(dir) = path.parent() {
        tokio::fs::create_dir_all(dir)
            .await
            .map_err(|e| io_message(&e, "mkdir", dir))?;
    }
    tokio::fs::write(&path, buffer)
        .await
        .map_err(|e| io_message(&e, "open", &path))?;
    Ok(Uploaded {
        url: format!("/uploads/{key}"),
        key: key.to_owned(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keys_stay_inside_the_uploads_dir() {
        let root = Path::new("/srv/backend/uploads");
        assert_eq!(
            inside(root, "general/a.png").unwrap(),
            PathBuf::from("/srv/backend/uploads/general/a.png")
        );
        assert_eq!(
            inside(root, "/images/bedding/x.jpg").unwrap(),
            PathBuf::from("/srv/backend/uploads/images/bedding/x.jpg")
        );
        assert_eq!(
            inside(root, "products/P1/../P2/./x.jpg").unwrap(),
            PathBuf::from("/srv/backend/uploads/products/P2/x.jpg")
        );
        assert!(inside(root, "../server.js").is_err());
        assert!(inside(root, "a/../../uploads2/x").is_err());
        assert!(inside(root, "").is_err());
        assert!(inside(root, "a/..").is_err());
    }

    #[tokio::test]
    async fn local_files() {
        let dir = tempfile::tempdir().unwrap();
        let storage = Storage::Local {
            root: dir.path().to_owned(),
        };
        let up = storage
            .upload_file(b"abc".to_vec(), "products/P1/x_original.png", "image/png")
            .await
            .unwrap();
        assert_eq!(up.url, "/uploads/products/P1/x_original.png");
        assert_eq!(
            std::fs::read(dir.path().join("products/P1/x_original.png")).unwrap(),
            b"abc"
        );
        assert_eq!(
            storage
                .upload_file(vec![], "../x", "image/png")
                .await
                .unwrap_err(),
            "Invalid upload path"
        );
        storage
            .delete_file("products/P1/x_original.png")
            .await
            .unwrap();
        assert!(!dir.path().join("products/P1/x_original.png").exists());
        // Missing files are fine; escaping keys are refused.
        storage.delete_file("products/P1/nope.png").await.unwrap();
        assert!(storage.delete_file("../../etc/passwd").await.is_err());
    }

    /// A local fake S3: PutObject / DeleteObject as the Node SDK sends them
    /// (bucket, key, ACL, content type), and the URL built from them.
    #[tokio::test]
    async fn s3_requests() {
        use std::sync::{Arc, Mutex};
        type Seen = Arc<Mutex<Vec<(String, String, axum::http::HeaderMap, usize)>>>;
        let seen: Seen = Arc::default();
        let app = {
            let seen = seen.clone();
            axum::Router::new().fallback(move |req: axum::extract::Request| {
                let seen = seen.clone();
                async move {
                    use axum::response::IntoResponse;
                    let method = req.method().to_string();
                    let uri = req.uri().to_string();
                    let headers = req.headers().clone();
                    let body = axum::body::to_bytes(req.into_body(), 1 << 20).await.unwrap();
                    seen.lock().unwrap().push((method.clone(), uri.clone(), headers, body.len()));
                    if uri.contains("denied") {
                        return (
                            axum::http::StatusCode::FORBIDDEN,
                            "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Error><Code>AccessDenied</Code><Message>Access Denied</Message></Error>",
                        )
                            .into_response();
                    }
                    if method == "DELETE" {
                        axum::http::StatusCode::NO_CONTENT.into_response()
                    } else {
                        axum::http::StatusCode::OK.into_response()
                    }
                }
            })
        };
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        let storage = Storage::s3(
            client(
                "AKIATEST",
                "secret",
                "eu-west-2",
                Some(&format!("http://{addr}")),
            ),
            "nt-bucket".into(),
            "eu-west-2".into(),
        );
        let up = storage
            .upload_file(vec![1, 2, 3], "products/P1/a_small.jpg", "image/jpeg")
            .await
            .unwrap();
        assert_eq!(
            up,
            Uploaded {
                url: "https://nt-bucket.s3.eu-west-2.amazonaws.com/products/P1/a_small.jpg".into(),
                key: "products/P1/a_small.jpg".into(),
            }
        );
        storage
            .delete_file("products/P1/a_small.jpg")
            .await
            .unwrap();
        assert_eq!(
            storage
                .upload_file(vec![1], "denied/x.jpg", "image/jpeg")
                .await
                .unwrap_err(),
            "Access Denied"
        );
        let seen = seen.lock().unwrap();
        let (method, uri, headers, len) = &seen[0];
        assert_eq!(method, "PUT");
        assert!(
            uri.starts_with("/nt-bucket/products/P1/a_small.jpg"),
            "{uri}"
        );
        assert_eq!(headers["x-amz-acl"], "public-read");
        assert_eq!(headers["content-type"], "image/jpeg");
        assert!(
            headers["authorization"]
                .to_str()
                .unwrap()
                .contains("Credential=AKIATEST/")
        );
        assert!(
            headers["authorization"]
                .to_str()
                .unwrap()
                .contains("/eu-west-2/s3/")
        );
        assert_eq!(*len, 3);
        assert_eq!(seen[1].0, "DELETE");
        assert!(seen[1].1.starts_with("/nt-bucket/products/P1/a_small.jpg"));
    }
}
