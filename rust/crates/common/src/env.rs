//! Environment variables: trimmed, and empty treated as unset.

/// The variable's value, or `None` when unset or blank.
pub fn var(name: &str) -> Option<String> {
    std::env::var(name)
        .ok()
        .map(|v| v.trim().to_owned())
        .filter(|v| !v.is_empty())
}

/// Parse a variable, falling back to `default` when unset or unparseable.
pub fn number<T: std::str::FromStr>(name: &str, default: T) -> T {
    var(name).and_then(|v| v.parse().ok()).unwrap_or(default)
}
