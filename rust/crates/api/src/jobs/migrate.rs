//! backend/scripts/migrate.js: applies `<dir>/NNN_*.sql` in order and records
//! each one in `schema_migrations` (version, name, applied_at).
//!
//! * Baseline: a database without `schema_migrations` got migrations up to
//!   [`BASELINE_VERSION`] from docker/mysql/init.sql; those are recorded as
//!   applied, not run.
//! * Each file runs as one multi-statement batch (`sqlx::raw_sql`, like
//!   mysql2's `multipleStatements`). MySQL DDL auto-commits, so a failed file
//!   stops the run without recording it.
//! * The whole run holds [`super::MIGRATIONS_LOCK`] (waiting for it, unlike the
//!   periodic jobs), so the Node backend's `npm run migrate` and this runner
//!   never apply the same file twice.

use std::path::{Path, PathBuf};

use sqlx::MySqlPool;

/// migrate.js's `BASELINE_VERSION`.
pub const BASELINE_VERSION: i32 = 8;
/// How long to wait for another runner to finish (seconds).
const LOCK_WAIT_SECS: i32 = 600;

/// One migration file.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Migration {
    pub version: i32,
    pub file: String,
}

/// `MIGRATIONS_DIR`, else `../backend/migrations` (from `rust/`) or
/// `backend/migrations` (from the repo root), whichever exists.
pub fn default_dir() -> PathBuf {
    if let Some(dir) = common::env::var("MIGRATIONS_DIR") {
        return PathBuf::from(dir);
    }
    let from_rust = PathBuf::from("../backend/migrations");
    if from_rust.is_dir() {
        from_rust
    } else {
        PathBuf::from("backend/migrations")
    }
}

/// `listMigrations()`: `/^\d{3}_[\w-]+\.sql$/`, sorted by file name.
pub fn list(dir: &Path) -> anyhow::Result<Vec<Migration>> {
    let mut files: Vec<String> = std::fs::read_dir(dir)
        .map_err(|e| anyhow::anyhow!("cannot read {}: {e}", dir.display()))?
        .filter_map(|entry| entry.ok()?.file_name().into_string().ok())
        .filter(|f| is_migration_name(f))
        .collect();
    files.sort();
    Ok(files
        .into_iter()
        .map(|file| Migration {
            version: file[..3].parse().unwrap_or(0),
            file,
        })
        .collect())
}

fn is_migration_name(f: &str) -> bool {
    let Some(stem) = f.strip_suffix(".sql") else {
        return false;
    };
    let b = stem.as_bytes();
    b.len() > 4
        && b[..3].iter().all(u8::is_ascii_digit)
        && b[3] == b'_'
        && b[4..]
            .iter()
            .all(|c| c.is_ascii_alphanumeric() || *c == b'_' || *c == b'-')
}

/// `runMigrations()`: the files applied by this run.
pub async fn run(pool: &MySqlPool, dir: &Path) -> anyhow::Result<Vec<String>> {
    let migrations = list(dir)?;
    let mut conn = pool.acquire().await?;
    let got = sqlx::query_scalar!(
        "SELECT GET_LOCK(?, ?)",
        super::MIGRATIONS_LOCK,
        LOCK_WAIT_SECS
    )
    .fetch_one(&mut *conn)
    .await?;
    if got != Some(1) {
        anyhow::bail!("timed out waiting for the migration lock (another runner is busy)");
    }
    let result = apply(&mut conn, &migrations, dir).await;
    let _ = sqlx::query_scalar!("SELECT RELEASE_LOCK(?)", super::MIGRATIONS_LOCK)
        .fetch_one(&mut *conn)
        .await;
    result
}

async fn apply(
    conn: &mut sqlx::MySqlConnection,
    migrations: &[Migration],
    dir: &Path,
) -> anyhow::Result<Vec<String>> {
    let present = sqlx::query_scalar!(
        r#"SELECT COUNT(*) AS "n!: i64" FROM information_schema.tables
           WHERE table_schema = DATABASE() AND table_name = 'schema_migrations'"#
    )
    .fetch_one(&mut *conn)
    .await?;
    sqlx::raw_sql(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
           version INT PRIMARY KEY,
           name VARCHAR(255) NOT NULL,
           applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
         )",
    )
    .execute(&mut *conn)
    .await?;

    if present == 0 {
        let baseline: Vec<&Migration> = migrations
            .iter()
            .filter(|m| m.version <= BASELINE_VERSION)
            .collect();
        for m in &baseline {
            sqlx::query!(
                "INSERT IGNORE INTO schema_migrations (version, name) VALUES (?, ?)",
                m.version,
                m.file
            )
            .execute(&mut *conn)
            .await?;
        }
        tracing::info!(
            "Baselined {} migration(s) already present in init.sql",
            baseline.len()
        );
    }

    let applied = sqlx::query_scalar!("SELECT version FROM schema_migrations")
        .fetch_all(&mut *conn)
        .await?;
    let pending: Vec<&Migration> = migrations
        .iter()
        .filter(|m| !applied.contains(&m.version))
        .collect();
    for m in &pending {
        tracing::info!("Applying {}", m.file);
        let sql = std::fs::read_to_string(dir.join(&m.file))?;
        sqlx::raw_sql(&sql)
            .execute(&mut *conn)
            .await
            .map_err(|e| anyhow::anyhow!("{}: {e}", m.file))?;
        sqlx::query!(
            "INSERT INTO schema_migrations (version, name) VALUES (?, ?)",
            m.version,
            m.file
        )
        .execute(&mut *conn)
        .await?;
    }
    if pending.is_empty() {
        tracing::info!("Schema is up to date");
    } else {
        tracing::info!("Applied {} migration(s)", pending.len());
    }
    Ok(pending.into_iter().map(|m| m.file.clone()).collect())
}

/// `status()`: one `✔ file` / `· file` line per migration.
pub async fn status(pool: &MySqlPool, dir: &Path) -> anyhow::Result<Vec<String>> {
    // No table yet = nothing applied (Node's `.catch(() => [[]])`).
    let applied = sqlx::query_scalar!("SELECT version FROM schema_migrations ORDER BY version")
        .fetch_all(pool)
        .await
        .unwrap_or_default();
    Ok(list(dir)?
        .into_iter()
        .map(|m| {
            let mark = if applied.contains(&m.version) {
                '✔'
            } else {
                '·'
            };
            format!("{mark} {}", m.file)
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migration_names_match_the_node_pattern() {
        assert!(is_migration_name("009_newsletter.sql"));
        assert!(is_migration_name("014_order_confirmation_details.sql"));
        assert!(is_migration_name("010_a-b.sql"));
        assert!(!is_migration_name("9_x.sql"));
        assert!(!is_migration_name("009_.sql"));
        assert!(!is_migration_name("009_x.sql.bak"));
        assert!(!is_migration_name("009-x.sql"));
        assert!(!is_migration_name("009_x y.sql"));
        assert!(!is_migration_name("README.md"));
    }

    #[test]
    fn the_repo_migrations_list_in_order() {
        let list = list(Path::new("../../../backend/migrations")).unwrap();
        assert!(list.len() >= 15);
        assert!(list.windows(2).all(|w| w[0].version < w[1].version));
        assert_eq!(list[0].version, 1);
    }
}
