//! The parts of backend/services/inventoryService.js the admin inventory
//! routes call, statement for statement. Each Node method catches its own
//! errors and returns `{ success: false, error: err.message }`: `Err(message)`
//! here. Failures Node only logs (the movement insert, the low-stock alert)
//! are logged and ignored the same way.

use serde_json::{Map, Value, json};
use sqlx::MySqlPool;

use crate::mysql_json::{Js, JsRow};
use crate::routes::admin::products::exec::{
    self, Param, js_json, js_number, rows, stringify, write,
};

/// `updateInventory(inventoryId, { quantity_available, quantity_reserved,
/// reorder_point, reorder_quantity })`.
pub async fn update_inventory(
    pool: &MySqlPool,
    inventory_id: &str,
    values: [Param; 4],
) -> Result<(), String> {
    let query = "
        UPDATE inventory
        SET quantity_available = ?,
            quantity_reserved = ?,
            reorder_point = ?,
            reorder_quantity = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      ";
    let [a, b, c, d] = values;
    write(pool, query, &[a, b, c, d, Some(json!(inventory_id))])
        .await
        .map(|_| ())
        .map_err(|e| {
            if e.is_empty() {
                "Failed to update inventory".into()
            } else {
                e
            }
        })
}

/// `updateInventoryWithLogging(productId, variantId, quantityChange,
/// 'adjustment', 'manual', null, createdBy, details)`: the only movement type
/// the admin routes use.
pub async fn update_inventory_with_logging(
    pool: &MySqlPool,
    product_id: &str,
    variant_id: Option<&str>,
    quantity_change: f64,
    created_by: &str,
    details: Map<String, Value>,
) -> Result<Value, String> {
    let inventory_query = format!(
        "
        SELECT id, quantity_available, quantity_reserved, quantity_sold
        FROM inventory
        WHERE product_id = ? AND variant_id {}
      ",
        if variant_id.is_some() {
            "= ?"
        } else {
            "IS NULL"
        }
    );
    let mut params = vec![Some(json!(product_id))];
    if let Some(v) = variant_id {
        params.push(Some(json!(v)));
    }
    let not_found = || format!("Inventory not found for product {product_id}");
    let inventory = match rows(pool, &inventory_query, &params).await {
        Ok(rows) => rows.into_iter().next().ok_or_else(not_found)?,
        Err(_) => return Err(not_found()),
    };
    let inventory_id = js_json(inventory.get("id"));
    let available = js_number(inventory.get("quantity_available"));
    let new_available = available + quantity_change;
    let new_reserved = js_json(inventory.get("quantity_reserved"));
    let new_sold = js_json(inventory.get("quantity_sold"));

    if new_available < 0.0 {
        return Err(format!(
            "Insufficient inventory. Available: {}, Requested: {}",
            inventory
                .get("quantity_available")
                .map_or("undefined".into(), Js::js_string),
            common::json::js_number_string(quantity_change)
        ));
    }

    let update_query = "
        UPDATE inventory
        SET quantity_available = ?,
            quantity_reserved = ?,
            quantity_sold = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      ";
    if write(
        pool,
        update_query,
        &[
            Some(common::json::js_number(new_available)),
            Some(new_reserved),
            Some(new_sold),
            Some(inventory_id.clone()),
        ],
    )
    .await
    .is_err()
    {
        return Err("Failed to update inventory".into());
    }

    if let Err(e) = log_movement(
        pool,
        &inventory_id,
        "adjustment",
        quantity_change,
        "manual",
        created_by,
        details,
    )
    .await
    {
        tracing::error!(error = %e, "Failed to log inventory movement");
    }
    if let Err(e) = check_and_trigger_low_stock_alert(pool, &inventory_id).await {
        tracing::warn!(error = %e, "low stock check failed");
    }

    Ok(json!({
        "inventory_id": inventory_id,
        "previous_available": js_json(inventory.get("quantity_available")),
        "new_available": common::json::js_number(new_available),
        "movement_logged": true,
    }))
}

/// `Number` of a JSON number value (a row value read back with js_json).
fn num(v: &Value) -> f64 {
    crate::body::js_to_number(v)
}

/// `logMovement(...)`. Reads the inventory levels *after* the update (as
/// Node does) into `before_movement`, and adds the change again for
/// `after_movement`.
async fn log_movement(
    pool: &MySqlPool,
    inventory_id: &Value,
    movement_type: &str,
    quantity_change: f64,
    reference_type: &str,
    created_by: &str,
    mut details: Map<String, Value>,
) -> Result<(), String> {
    // `movementIdResult.data[0].id` throws when the query failed.
    let movement_id = match exec::next_id(pool, "INVMOV").await? {
        Some(id) => Value::String(id),
        None => Value::Null,
    };
    let current = rows(
        pool,
        "
        SELECT quantity_available, quantity_reserved, quantity_sold
        FROM inventory
        WHERE id = ?
      ",
        &[Some(inventory_id.clone())],
    )
    .await;
    if let Ok(Some(levels)) = current.map(|r| r.into_iter().next()) {
        let qa = js_json(levels.get("quantity_available"));
        let qr = js_json(levels.get("quantity_reserved"));
        let qs = js_json(levels.get("quantity_sold"));
        let sale = movement_type == "sale";
        details.insert(
            "before_movement".into(),
            json!({ "available": qa, "reserved": qr, "sold": qs }),
        );
        details.insert(
            "after_movement".into(),
            json!({
                "available": common::json::js_number(num(&qa) + if sale { 0.0 } else { quantity_change }),
                "reserved": qr,
                "sold": common::json::js_number(num(&qs) + if sale { quantity_change } else { 0.0 }),
            }),
        );
    }
    let query = "
        INSERT INTO inventory_movements
        (id, inventory_id, movement_type, quantity_change, reference_type, reference_id, movement_details, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ";
    write(
        pool,
        query,
        &[
            Some(movement_id),
            Some(inventory_id.clone()),
            Some(json!(movement_type)),
            Some(common::json::js_number(quantity_change)),
            Some(json!(reference_type)),
            Some(Value::Null),
            Some(Value::String(stringify(&Value::Object(details)))),
            Some(json!(created_by)),
        ],
    )
    .await
    .map(|_| ())
}

const ITEM_COLUMNS: &str = "
        SELECT
          i.*,
          p.name as product_name,
          p.sku as product_sku,
          pv.size,
          pv.color,
          pv.pattern,
          pv.sku as variant_sku
        FROM inventory i
        JOIN products p ON i.product_id = p.id
        LEFT JOIN product_variants pv ON i.variant_id = pv.id
        WHERE i.id = ? AND i.quantity_available <= i.reorder_point
      ";

/// `checkAndTriggerLowStockAlert(inventoryId)`.
async fn check_and_trigger_low_stock_alert(
    pool: &MySqlPool,
    inventory_id: &Value,
) -> Result<(), String> {
    let items = rows(pool, ITEM_COLUMNS, &[Some(inventory_id.clone())]).await?;
    if let Some(item) = items.first() {
        trigger_low_stock_alert(pool, item).await?;
    }
    Ok(())
}

/// backend/utils/escapeHtml.js: `String(value ?? '')`, HTML-escaped.
fn escape_html(value: Option<&Js>) -> String {
    let text = match value {
        None | Some(Js::Null) => String::new(),
        Some(v) => v.js_string(),
    };
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

/// `${value}` in a template literal.
fn template(value: Option<&Js>) -> String {
    value.map_or("undefined".into(), Js::js_string)
}

/// `a || ''` in a template literal.
fn or_empty(value: Option<&Js>) -> String {
    match value {
        Some(v) if v.truthy() => v.js_string(),
        _ => String::new(),
    }
}

/// `triggerLowStockAlert(inventoryItem)`: one email_queue row per active
/// admin, unless an alert for the product went out in the last 24 hours.
async fn trigger_low_stock_alert(pool: &MySqlPool, item: &JsRow) -> Result<(), String> {
    let recent_query = "
        SELECT id FROM email_queue
        WHERE to_email LIKE '%admin%'
        AND subject LIKE '%Low Stock Alert%'
        AND template_data->>'$.product_id' = ?
        AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
        LIMIT 1
      ";
    let product_id = js_json(item.get("product_id"));
    if let Ok(recent) = rows(pool, recent_query, &[Some(product_id.clone())]).await
        && !recent.is_empty()
    {
        return Ok(());
    }
    let staff_query = "
        SELECT email, CONCAT(first_name, ' ', last_name) as name
        FROM users
        WHERE role = 'admin' AND status = 'active'
      ";
    let staff = match rows(pool, staff_query, &[]).await {
        Ok(staff) if !staff.is_empty() => staff,
        _ => return Err("No authorized staff recipients found to send alert".into()),
    };
    let email_id = exec::next_id(pool, "EMAIL")
        .await?
        .ok_or_else(|| "Cannot read properties of undefined (reading 'id')".to_owned())?;

    let (size, color, pattern) = (item.get("size"), item.get("color"), item.get("pattern"));
    let has_variant = [size, color, pattern]
        .iter()
        .any(|v| v.is_some_and(Js::truthy));
    let variant = if has_variant {
        crate::express::js_trim(&format!(
            "{} {} {}",
            or_empty(size),
            or_empty(color),
            or_empty(pattern)
        ))
        .to_owned()
    } else {
        "Base Product".to_owned()
    };
    let variant_js = Js::String(variant.clone());

    let subject = format!("Low Stock Alert - {}", template(item.get("product_name")));
    let html = format!(
        "
          <h2>Low Stock Alert</h2>
          <p>The following product is running low on stock:</p>
          <ul>
            <li><strong>Product:</strong> {}</li>
            <li><strong>SKU:</strong> {}</li>
            <li><strong>Variant:</strong> {}</li>
            <li><strong>Current Stock:</strong> {}</li>
            <li><strong>Reorder Point:</strong> {}</li>
            <li><strong>Suggested Reorder Quantity:</strong> {}</li>
          </ul>
          <p>Please consider restocking this item soon.</p>
        ",
        escape_html(item.get("product_name")),
        escape_html(item.get("product_sku")),
        escape_html(Some(&variant_js)),
        escape_html(item.get("quantity_available")),
        escape_html(item.get("reorder_point")),
        escape_html(item.get("reorder_quantity")),
    );
    let text = format!(
        "Low Stock Alert: {} ({variant}) - Current Stock: {}, Reorder Point: {}",
        template(item.get("product_name")),
        template(item.get("quantity_available")),
        template(item.get("reorder_point")),
    );
    let content = json!({ "html_content": html, "text_content": text });
    let template_data = json!({
        "product_id": product_id,
        "product_name": js_json(item.get("product_name")),
        "variant": variant,
        "current_stock": js_json(item.get("quantity_available")),
        "reorder_point": js_json(item.get("reorder_point")),
        "reorder_quantity": js_json(item.get("reorder_quantity")),
    });
    let insert = "
          INSERT INTO email_queue
          (id, to_email, to_name, subject, email_content, template_data, status)
          VALUES (?, ?, ?, ?, ?, ?, 'pending')
        ";
    for admin in &staff {
        let email = admin.get("email").map_or("undefined".into(), Js::js_string);
        let id = format!("{email_id}_{}", email.replacen('@', "_", 1));
        if let Err(e) = write(
            pool,
            insert,
            &[
                Some(json!(id)),
                Some(js_json(admin.get("email"))),
                Some(js_json(admin.get("name"))),
                Some(json!(subject)),
                Some(Value::String(stringify(&content))),
                Some(Value::String(stringify(&template_data))),
            ],
        )
        .await
        {
            tracing::warn!(error = %e, "low stock alert email insert failed");
        }
    }
    Ok(())
}

/// `getMovementHistory(inventoryId || null, filters)`: the filters are the
/// query string's values (strings, checked by the route; `limit` unchecked).
pub struct Filters {
    pub inventory_id: Param,
    pub product_id: Param,
    pub movement_type: Param,
    pub reference_type: Param,
    pub date_from: Param,
    pub date_to: Param,
    pub limit: Param,
}

pub async fn movement_history(pool: &MySqlPool, f: Filters) -> Result<Vec<JsRow>, String> {
    let mut query = String::from(
        "
        SELECT
          im.*,
          i.product_id,
          i.variant_id,
          p.name as product_name,
          p.sku as product_sku,
          pv.size,
          pv.color,
          pv.pattern,
          u.first_name,
          u.last_name
        FROM inventory_movements im
        JOIN inventory i ON im.inventory_id = i.id
        JOIN products p ON i.product_id = p.id
        LEFT JOIN product_variants pv ON i.variant_id = pv.id
        LEFT JOIN users u ON im.created_by = u.id
      ",
    );
    let mut conditions = Vec::new();
    let mut params = Vec::new();
    let truthy = |v: &Param| crate::body::truthy(v.as_ref());
    for (value, condition) in [
        (&f.inventory_id, "im.inventory_id = ?"),
        (&f.product_id, "i.product_id = ?"),
        (&f.movement_type, "im.movement_type = ?"),
        (&f.reference_type, "im.reference_type = ?"),
        (&f.date_from, "im.created_at >= ?"),
        (&f.date_to, "im.created_at <= ?"),
    ] {
        if truthy(value) {
            conditions.push(condition);
            params.push(value.clone());
        }
    }
    if !conditions.is_empty() {
        query.push_str(" WHERE ");
        query.push_str(&conditions.join(" AND "));
    }
    query.push_str(" ORDER BY im.created_at DESC");
    if truthy(&f.limit) {
        // `parseInt(filters.limit)` (no radix), interpolated as JS writes it.
        let text = f
            .limit
            .as_ref()
            .map(crate::body::js_string)
            .unwrap_or_default();
        let n = crate::csv::js_parse_int(&text);
        query.push_str(&format!(" LIMIT {}", common::json::js_number_string(n)));
    }
    rows(pool, &query, &params).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn escapes_like_escape_html_js() {
        assert_eq!(
            escape_html(Some(&Js::String("<a href=\"x\">'&'</a>".into()))),
            "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;"
        );
        assert_eq!(escape_html(Some(&Js::Number(5.0))), "5");
        assert_eq!(escape_html(Some(&Js::Null)), "");
        assert_eq!(template(Some(&Js::Null)), "null");
        assert_eq!(or_empty(Some(&Js::String(String::new()))), "");
    }
}
