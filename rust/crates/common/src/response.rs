//! The response envelope every endpoint returns (backend/utils/responseFormatter.js):
//! `{ "status": "SUCCESS" | "FAIL", "message": ..., "keyValueTable": ... }`.

use serde::Serialize;
use serde_json::{Value, json};

pub fn success(message: &str, key_value_table: impl Serialize) -> Value {
    json!({ "status": "SUCCESS", "message": message, "keyValueTable": key_value_table })
}

/// Failure with the Node default `keyValueTable` of `[]`.
pub fn failure(message: &str) -> Value {
    json!({ "status": "FAIL", "message": message, "keyValueTable": [] })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn envelope_shapes_match_the_node_formatter() {
        assert_eq!(
            success("ok", json!({ "a": 1 })),
            json!({ "status": "SUCCESS", "message": "ok", "keyValueTable": { "a": 1 } })
        );
        assert_eq!(
            failure("nope"),
            json!({ "status": "FAIL", "message": "nope", "keyValueTable": [] })
        );
    }
}
