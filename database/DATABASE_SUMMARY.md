# Database System Summary

## Overview
This document provides a comprehensive overview of the database schema for the Bed Texture E-commerce application. It allows developers to understand the purpose of each table, the meaning of each column, and the relationships between data entities.

## Table of Contents
1. [Core & System Functions](#core--system-functions)
2. [User Service](#user-service)
3. [Product Catalog](#product-catalog)
4. [Inventory Management](#inventory-management)
5. [Sales & Orders](#sales--orders)
6. [Payments & Financials](#payments--financials)
7. [Notifications](#notifications)
8. [Shipping & Tax](#shipping--tax)
9. [Database Views](#database-views)

---

## Core & System Functions

### transno
**Description**: Manages custom ID prefixes and counters for generating human-readable identifiers (e.g., ORD00001).

| Column | Type | Meaning |
| :--- | :--- | :--- |
| `prefix` | VARCHAR(20) | **PK**. The unique prefix string (e.g., 'ORDER', 'USER'). |
| `count` | BIGINT UNSIGNED | Current counter value for this prefix. Increments with each new ID. |
| `details` | TEXT | Description of what this prefix is used for. |
| `created_at` | TIMESTAMP | Record creation time. |
| `updated_at` | TIMESTAMP | Last update time. |

### system_settings
**Description**: Stores global application configuration accessible via API.

| Column | Type | Meaning |
| :--- | :--- | :--- |
| `id` | VARCHAR(50) | **PK**. Unique identifier. |
| `setting_key` | VARCHAR(100) | **Unique**. The lookup key for the setting (e.g., 'site_name'). |
| `setting_value` | TEXT | The value of the setting. |
| `setting_type` | ENUM | Data type: 'string', 'integer', 'decimal', 'boolean', 'json'. |
| `setting_details` | JSON | Metadata: description, validation rules, default value, help text. |
| `is_public` | BOOLEAN | If true, this setting can be exposed to the frontend/public API. |
| `updated_by` | VARCHAR(50) | FK to `users`. Who last modified this setting. |
| `updated_at` | TIMESTAMP | Last update time. |

### audit_logs
**Description**: Comprehensive audit trail for administrative actions and critical data changes.

| Column | Type | Meaning |
| :--- | :--- | :--- |
| `id` | VARCHAR(50) | **PK**. Unique identifier. |
| `user_id` | VARCHAR(50) | FK to `users`. The user who performed the action. |
| `action` | VARCHAR(100) | The type of action performed (e.g., 'product_update', 'login'). |
| `resource_type` | VARCHAR(50) | The entity type affected (e.g., 'product', 'order'). |
| `resource_id` | VARCHAR(50) | The ID of the specific entity instance. |
| `old_values` | JSON | Snapshot of data before the change. |
| `new_values` | JSON | Snapshot of data after the change. |
| `session_details` | JSON | Context: IP address, user agent, browser info, location. |
| `created_at` | TIMESTAMP | When the action occurred. |

### api_rate_limits
**Description**: Tracks API usage for rate limiting purposes.

| Column | Type | Meaning |
| :--- | :--- | :--- |
| `id` | VARCHAR(50) | **PK**. Unique identifier. |
| `identifier` | VARCHAR(255) | The user ID or IP address being limited. |
| `identifier_type` | ENUM | 'ip' or 'user'. |
| `endpoint` | VARCHAR(255) | The specific API endpoint being accessed. |
| `request_count` | INT UNSIGNED | Number of requests within the current window. |
| `window_start` | TIMESTAMP | Start time of the current rate limit window. |
| `created_at` | TIMESTAMP | Record creation time. |
| `updated_at` | TIMESTAMP | Last update time. |

---

## User Service

### users
**Description**: Central repository for all user accounts, including customers, staff, and admins.

| Column | Type | Meaning |
| :--- | :--- | :--- |
| `id` | VARCHAR(50) | **PK**. Unique user identifier. |
| `email` | VARCHAR(255) | **Unique**. User's email address. |
| `password_hash` | VARCHAR(255) | Bcrypt hash of the user's password. |
| `first_name` | VARCHAR(100) | User's first name. |
| `last_name` | VARCHAR(100) | User's last name. |
| `phone` | VARCHAR(20) | Contact phone number. |
| `role` | ENUM | Permission level: 'admin', 'staff', 'customer'. |
| `status` | ENUM | Account status: 'active', 'inactive', 'suspended'. |
| `email_verified` | BOOLEAN | True if the user has verified their email. |
| `email_verification_token` | VARCHAR(255) | Token sent for email verification. |
| `password_reset_token` | VARCHAR(255) | Token used for password recovery flow. |
| `password_reset_expires` | TIMESTAMP | Expiration time for the reset token. |
| `last_login` | TIMESTAMP | Timestamp of most recent successful login. |
| `created_at` | TIMESTAMP | Account creation time. |
| `updated_at` | TIMESTAMP | Last profile update time. |

### user_addresses
**Description**: Stores multiple shipping and billing addresses for users.

| Column | Type | Meaning |
| :--- | :--- | :--- |
| `id` | VARCHAR(50) | **PK**. Unique identifier. |
| `user_id` | VARCHAR(50) | FK to `users`. |
| `type` | ENUM | 'shipping' or 'billing'. |
| `first_name` | VARCHAR(100) | First name for this address. |
| `last_name` | VARCHAR(100) | Last name for this address. |
| `phone` | VARCHAR(20) | Contact phone for this address. |
| `address_json` | JSON | Structured address: company, line_1, line_2, city, state, zip, country. |
| `is_default` | BOOLEAN | If true, this is the default address for its type. |
| `created_at` | TIMESTAMP | Record creation time. |
| `updated_at` | TIMESTAMP | Last update time. |

---

## Product Catalog

### categories
**Description**: Hierarchical category structure for product organization.

| Column | Type | Meaning |
| :--- | :--- | :--- |
| `id` | VARCHAR(50) | **PK**. Unique identifier. |
| `name` | VARCHAR(100) | Display name of the category. |
| `slug` | VARCHAR(100) | **Unique**. URL-friendly version of the name. |
| `description` | TEXT | Description for SEO and UI. |
| `parent_id` | VARCHAR(50) | FK to `categories`. Self-reference for subcategories. |
| `sort_order` | INT | Display order. |
| `is_active` | BOOLEAN | Visibility toggle. |
| `created_at` | TIMESTAMP | Creation time. |
| `updated_at` | TIMESTAMP | Last update. |

### products
**Description**: The core product definition table.

| Column | Type | Meaning |
| :--- | :--- | :--- |
| `id` | VARCHAR(50) | **PK**. Unique identifier. |
| `sku` | VARCHAR(100) | **Unique**. Stock Keeping Unit. |
| `name` | VARCHAR(255) | Product name. |
| `slug` | VARCHAR(255) | **Unique**. URL-friendly name. |
| `description` | TEXT | Full HTML description. |
| `short_description` | VARCHAR(500) | Brief text for summary cards. |
| `category_id` | VARCHAR(50) | FK to `categories`. Primary category. |
| `base_price` | DECIMAL(10,2) | Starting price before variants. |
| `product_details` | JSON | Specs: weight, dimensions, material, care instructions. |
| `status` | ENUM | Workflow state: 'draft', 'pending_approval', 'approved', 'rejected', etc. |
| `approval_details` | JSON | Audit of approval: notes, approver ID, timestamps. |
| `created_by` | VARCHAR(50) | FK to `users`. Creator of the product. |
| `meta_title` | VARCHAR(255) | SEO title. |
| `meta_description` | VARCHAR(500) | SEO description. |
| `meta_keywords` | VARCHAR(255) | SEO keywords. |
| `created_at` | TIMESTAMP | Creation time. |
| `updated_at` | TIMESTAMP | Last update. |

### product_variants
**Description**: Variations of a base product (e.g., Size + Color).

| Column | Type | Meaning |
| :--- | :--- | :--- |
| `id` | VARCHAR(50) | **PK**. Unique identifier. |
| `product_id` | VARCHAR(50) | FK to `products`. |
| `sku` | VARCHAR(100) | **Unique**. specific SKU for this variant. |
| `size` | VARCHAR(50) | Size attribute (e.g., 'Queen'). |
| `color` | VARCHAR(50) | Color attribute (e.g., 'White'). |
| `pattern` | VARCHAR(100) | Pattern attribute. |
| `price_adjustment` | DECIMAL(10,2) | Added/subtracted from base price (default 0). |
| `weight_adjustment` | DECIMAL(8,3) | Added/subtracted from base weight. |
| `is_active` | BOOLEAN | Visibility toggle. |
| `created_at` | TIMESTAMP | Creation time. |
| `updated_at` | TIMESTAMP | Last update. |

### product_images
**Description**: Media assets for products and variants.

| Column | Type | Meaning |
| :--- | :--- | :--- |
| `id` | VARCHAR(50) | **PK**. Unique identifier. |
| `product_id` | VARCHAR(50) | FK to `products`. |
| `variant_id` | VARCHAR(50) | FK to `product_variants`. Optional specific variant. |
| `original_url` | VARCHAR(500) | URL to the high-res image. |
| `thumbnail_small_url` | VARCHAR(500) | Small thumbnail URL. |
| `thumbnail_medium_url` | VARCHAR(500) | Medium thumbnail URL. |
| `thumbnail_large_url` | VARCHAR(500) | Large thumbnail URL. |
| `alt_text` | VARCHAR(255) | Accessibility text. |
| `sort_order` | INT | Display order value. |
| `is_primary` | BOOLEAN | True if this is the main product image. |
| `file_size` | INT UNSIGNED | Size in bytes. |
| `width` | INT UNSIGNED | Pixel width. |
| `height` | INT UNSIGNED | Pixel height. |
| `created_at` | TIMESTAMP | Upload time. |

### product_bundles
**Description**: Defines "Bundles" which are sold as a single unit but composed of other items.

| Column | Type | Meaning |
| :--- | :--- | :--- |
| `id` | VARCHAR(50) | **PK**. Unique identifier. |
| `name` | VARCHAR(255) | Bundle name. |
| `slug` | VARCHAR(255) | **Unique**. Bundle URL slug. |
| `description` | TEXT | Description of the bundle. |
| `bundle_price` | DECIMAL(10,2) | Set price for the whole bundle. |
| `discount_amount` | DECIMAL(10,2) | Saved amount compared to buying separate items. |
| `is_active` | BOOLEAN | Visibility toggle. |
| `created_at` | TIMESTAMP | Creation time. |
| `updated_at` | TIMESTAMP | Last update. |

### bundle_items
**Description**: Join table defining the contents of a bundle.

| Column | Type | Meaning |
| :--- | :--- | :--- |
| `id` | VARCHAR(50) | **PK**. Unique identifier. |
| `bundle_id` | VARCHAR(50) | FK to `product_bundles`. |
| `product_id` | VARCHAR(50) | FK to `products`. |
| `variant_id` | VARCHAR(50) | FK to `product_variants` (optional). |
| `quantity` | INT UNSIGNED | How many of this item is in the bundle. |

### product_reviews
**Description**: Customer feedback and ratings.

| Column | Type | Meaning |
| :--- | :--- | :--- |
| `id` | VARCHAR(50) | **PK**. Unique identifier. |
| `product_id` | VARCHAR(50) | FK to `products`. |
| `user_id` | VARCHAR(50) | FK to `users`. |
| `order_item_id` | VARCHAR(50) | FK to verified order item (optional). |
| `rating` | TINYINT | 1 to 5 stars. |
| `review_details` | JSON | Content: title, text, pros, cons, images. |
| `is_verified_purchase` | BOOLEAN | True if linked to a completed order. |
| `is_approved` | BOOLEAN | Moderation flag. |
| `approved_by` | VARCHAR(50) | FK to `users`. Moderator ID. |
| `approved_at` | TIMESTAMP | Moderation time. |
| `created_at` | TIMESTAMP | Submission time. |
| `updated_at` | TIMESTAMP | Last update. |

---

## Inventory Management

### inventory
**Description**: Tracks stock levels for products and variants.

| Column | Type | Meaning |
| :--- | :--- | :--- |
| `id` | VARCHAR(50) | **PK**. Unique identifier. |
| `product_id` | VARCHAR(50) | FK to `products`. |
| `variant_id` | VARCHAR(50) | FK to `product_variants` (optional). |
| `quantity_available` | INT UNSIGNED | Sellable stock count. |
| `quantity_reserved` | INT UNSIGNED | Held stock (in carts/checkouts). |
| `quantity_sold` | INT UNSIGNED | Total sold count. |
| `reorder_point` | INT UNSIGNED | Threshold to trigger low stock alert. |
| `reorder_quantity` | INT UNSIGNED | Suggested restock amount. |
| `last_restocked_at` | TIMESTAMP | Time of last restock. |
| `updated_at` | TIMESTAMP | Last update. |

### inventory_movements
**Description**: Ledger for all stock changes (restock, sale, return).

| Column | Type | Meaning |
| :--- | :--- | :--- |
| `id` | VARCHAR(50) | **PK**. Unique identifier. |
| `inventory_id` | VARCHAR(50) | FK to `inventory`. |
| `movement_type` | ENUM | 'restock', 'sale', 'adjustment', 'return', 'damage'. |
| `quantity_change` | INT | Delta value (+ for add, - for remove). |
| `reference_type` | ENUM | Source of change: 'order', 'manual', 'return'. |
| `reference_id` | VARCHAR(50) | ID of the source (e.g., order ID). |
| `movement_details` | JSON | Notes, batch numbers, supplier info. |
| `created_by` | VARCHAR(50) | FK to `users`. Who initiated the movement. |
| `created_at` | TIMESTAMP | Time of movement. |

### stock_reservations
**Description**: Temporary holds on inventory during the checkout process.

| Column | Type | Meaning |
| :--- | :--- | :--- |
| `id` | VARCHAR(50) | **PK**. Unique identifier. |
| `product_id` | VARCHAR(50) | FK to `products`. |
| `variant_id` | VARCHAR(50) | FK to `product_variants`. |
| `cart_id` | VARCHAR(50) | FK to `shopping_carts`. |
| `user_id` | VARCHAR(50) | FK to `users`. |
| `quantity` | INT UNSIGNED | Amount reserved. |
| `expires_at` | TIMESTAMP | When this reservation expires and releases stock. |
| `created_at` | TIMESTAMP | Time of reservation. |

---

## Sales & Orders

### shopping_carts
**Description**: Manages active shopping sessions for both guests and authenticated users.

| Column | Type | Meaning |
| :--- | :--- | :--- |
| `id` | VARCHAR(50) | **PK**. Unique identifier. |
| `session_id` | VARCHAR(255) | Session cookie ID for guests. |
| `user_id` | VARCHAR(50) | FK to `users` for logged-in users. |
| `created_at` | TIMESTAMP | Cart creation time. |
| `updated_at` | TIMESTAMP | Last activity. |

### cart_items
**Description**: Individual line items within a shopping cart.

| Column | Type | Meaning |
| :--- | :--- | :--- |
| `id` | VARCHAR(50) | **PK**. Unique identifier. |
| `cart_id` | VARCHAR(50) | FK to `shopping_carts`. |
| `product_id` | VARCHAR(50) | FK to `products`. |
| `variant_id` | VARCHAR(50) | FK to `product_variants`. |
| `bundle_id` | VARCHAR(50) | FK to `product_bundles`. |
| `quantity` | INT UNSIGNED | Quantity of items. |
| `price` | DECIMAL(10,2) | Unit price at moment of addition. |
| `created_at` | TIMESTAMP | Time added. |
| `updated_at` | TIMESTAMP | Last update. |

### orders
**Description**: The primary record of a purchase.

| Column | Type | Meaning |
| :--- | :--- | :--- |
| `id` | VARCHAR(50) | **PK**. Unique identifier. |
| `order_number` | VARCHAR(50) | **Unique**. Human-readable order ID (e.g., ORD10050). |
| `user_id` | VARCHAR(50) | FK to `users` (NULL for guest). |
| `guest_email` | VARCHAR(255) | Email for guest checkouts. |
| `status` | ENUM | 'pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'. |
| `currency` | VARCHAR(3) | Currency code (e.g., USD). |
| `exchange_rate` | DECIMAL | Rate for conversion if applicable. |
| `subtotal` | DECIMAL(10,2) | Sum of item prices. |
| `tax_amount` | DECIMAL(10,2) | Total tax. |
| `shipping_amount` | DECIMAL(10,2) | Shipping cost. |
| `discount_amount` | DECIMAL(10,2) | Total discounts applied. |
| `total_amount` | DECIMAL(10,2) | Final payable amount. |
| `shipping_address_json` | JSON | Complete snapshot of shipping address. |
| `billing_address_json` | JSON | Complete snapshot of billing address. |
| `shipping_method` | VARCHAR(100) | Selected shipping service. |
| `tracking_number` | VARCHAR(100) | Courier tracking code. |
| `shipped_at` | TIMESTAMP | Time of shipment. |
| `delivered_at` | TIMESTAMP | Time of delivery. |
| `created_at` | TIMESTAMP | Order placement time. |
| `updated_at` | TIMESTAMP | Last update. |

### order_items
**Description**: Frozen snapshot of items purchased in an order.

| Column | Type | Meaning |
| :--- | :--- | :--- |
| `id` | VARCHAR(50) | **PK**. Unique identifier. |
| `order_id` | VARCHAR(50) | FK to `orders`. |
| `product_id` | VARCHAR(50) | FK to `products`. |
| `variant_id` | VARCHAR(50) | FK to `product_variants`. |
| `bundle_id` | VARCHAR(50) | FK to `product_bundles`. |
| `product_name` | VARCHAR(255) | Name snapshot (in case product name changes). |
| `product_sku` | VARCHAR(100) | SKU snapshot. |
| `variant_details` | JSON | Snapshot of attributes (size, color). |
| `quantity` | INT UNSIGNED | Purchased quantity. |
| `unit_price` | DECIMAL(10,2) | Price per unit paid. |
| `total_price` | DECIMAL(10,2) | Line total (unit * qty). |
| `created_at` | TIMESTAMP | Creation time. |

### order_status_history
**Description**: Log of status changes for an order.

| Column | Type | Meaning |
| :--- | :--- | :--- |
| `id` | VARCHAR(50) | **PK**. Unique identifier. |
| `order_id` | VARCHAR(50) | FK to `orders`. |
| `status` | ENUM | The status moved to. |
| `status_details` | JSON | Notes, tracking info updates. |
| `changed_by` | VARCHAR(50) | FK to `users` (admin/staff). |
| `created_at` | TIMESTAMP | Time of change. |

---

## Payments & Financials

### payment_methods
**Description**: Configuration of accepted payment types.

| Column | Type | Meaning |
| :--- | :--- | :--- |
| `id` | VARCHAR(50) | **PK**. Unique identifier. |
| `name` | VARCHAR(100) | Display name (e.g., 'Credit Card'). |
| `type` | ENUM | 'credit_card', 'paypal', etc. |
| `is_active` | BOOLEAN | Enable/disable toggle. |
| `processing_fee_percentage` | DECIMAL | Fee calc: % part. |
| `processing_fee_fixed` | DECIMAL | Fee calc: fixed part. |
| `created_at` | TIMESTAMP | Creation time. |

### payments
**Description**: Records actual payment transactions attempt and success.

| Column | Type | Meaning |
| :--- | :--- | :--- |
| `id` | VARCHAR(50) | **PK**. Unique identifier. |
| `order_id` | VARCHAR(50) | FK to `orders`. |
| `payment_method_id` | VARCHAR(50) | FK to `payment_methods`. |
| `payment_gateway` | VARCHAR(50) | Gateway used (e.g., 'stripe'). |
| `gateway_transaction_id` | VARCHAR(255) | ID from the provider. |
| `gateway_payment_intent_id` | VARCHAR(255) | Intent ID (Stripe specific). |
| `amount` | DECIMAL(10,2) | Amount charged. |
| `currency` | VARCHAR(3) | Currency code. |
| `status` | ENUM | 'pending', 'completed', 'failed', 'refunded'. |
| `gateway_response` | JSON | Raw response from provider. |
| `failure_reason` | TEXT | Error message if failed. |
| `processed_at` | TIMESTAMP | Time processed. |
| `created_at` | TIMESTAMP | Creation time. |
| `updated_at` | TIMESTAMP | Last update. |

### refunds
**Description**: Tracks refunds issued against payments.

| Column | Type | Meaning |
| :--- | :--- | :--- |
| `id` | VARCHAR(50) | **PK**. Unique identifier. |
| `payment_id` | VARCHAR(50) | FK to `payments`. |
| `order_id` | VARCHAR(50) | FK to `orders`. |
| `amount` | DECIMAL(10,2) | Refunded amount. |
| `reason` | ENUM | 'customer_request', 'defective', etc. |
| `refund_details` | JSON | Explanation and notes. |
| `status` | ENUM | 'pending', 'completed', 'failed'. |
| `gateway_refund_id` | VARCHAR(255) | Provider refund ID. |
| `processed_by` | VARCHAR(50) | FK to `users`. Staff who issued it. |
| `processed_at` | TIMESTAMP | Time processed. |
| `created_at` | TIMESTAMP | Creation time. |

### discount_codes
**Description**: Definition of coupons and promotions.

| Column | Type | Meaning |
| :--- | :--- | :--- |
| `id` | VARCHAR(50) | **PK**. Unique identifier. |
| `code` | VARCHAR(50) | **Unique**. The code users type (e.g., 'SUMMER20'). |
| `name` | VARCHAR(255) | Internal marketing name. |
| `discount_details` | JSON | Rules: products included/excluded, description. |
| `type` | ENUM | 'percentage', 'fixed_amount', 'free_shipping'. |
| `value` | DECIMAL(10,2) | The numeric value (e.g., 20.00). |
| `minimum_order_amount` | DECIMAL | Min spend required. |
| `maximum_discount_amount` | DECIMAL | Cap for % discounts. |
| `usage_limit` | INT UNSIGNED | Global max uses. |
| `usage_count` | INT UNSIGNED | Current global usage. |
| `usage_limit_per_customer` | INT UNSIGNED | Max uses per user. |
| `is_active` | BOOLEAN | Toggle activation. |
| `starts_at` | TIMESTAMP | Start date. |
| `expires_at` | TIMESTAMP | End date. |
| `created_by` | VARCHAR(50) | FK to `users`. |
| `created_at` | TIMESTAMP | Creation time. |
| `updated_at` | TIMESTAMP | Last update. |

### discount_code_usage
**Description**: Log of every time a discount code is successfully used.

| Column | Type | Meaning |
| :--- | :--- | :--- |
| `id` | VARCHAR(50) | **PK**. Unique identifier. |
| `discount_code_id` | VARCHAR(50) | FK to `discount_codes`. |
| `order_id` | VARCHAR(50) | FK to `orders`. |
| `user_id` | VARCHAR(50) | FK to `users`. |
| `discount_amount` | DECIMAL(10,2) | Value received. |
| `created_at` | TIMESTAMP | Usage time. |

---

## Notifications

### email_templates
**Description**: Stores HTML and text templates for automated emails.

| Column | Type | Meaning |
| :--- | :--- | :--- |
| `id` | VARCHAR(50) | **PK**. Unique identifier. |
| `name` | VARCHAR(100) | **Unique**. System name (e.g., 'order_confirmation'). |
| `subject` | VARCHAR(255) | Default email subject line. |
| `template_content` | JSON | Contains HTML body, text body, and variable schemas. |
| `is_active` | BOOLEAN | Toggle usage. |
| `created_at` | TIMESTAMP | Creation time. |
| `updated_at` | TIMESTAMP | Last update. |

### email_queue
**Description**: Asynchronous queue for sending emails.

| Column | Type | Meaning |
| :--- | :--- | :--- |
| `id` | VARCHAR(50) | **PK**. Unique identifier. |
| `to_email` | VARCHAR(255) | Recipient address. |
| `to_name` | VARCHAR(255) | Recipient name. |
| `subject` | VARCHAR(255) | Email subject. |
| `email_content` | JSON | Rendered content and headers. |
| `template_id` | VARCHAR(50) | FK to `email_templates` (if template used). |
| `template_data` | JSON | Variables used to render template. |
| `status` | ENUM | 'pending', 'sent', 'failed'. |
| `attempts` | INT UNSIGNED | Retry count. |
| `max_attempts` | INT UNSIGNED | Max retries before failure. |
| `processing_details` | JSON | Errors, delivery info. |
| `scheduled_at` | TIMESTAMP | Send after this time. |
| `sent_at` | TIMESTAMP | Actual send time. |
| `created_at` | TIMESTAMP | Creation time. |

### abandoned_cart_recovery
**Description**: Tracks recovery sequence for users who leave without buying.

| Column | Type | Meaning |
| :--- | :--- | :--- |
| `id` | VARCHAR(50) | **PK**. Unique identifier. |
| `cart_id` | VARCHAR(50) | FK to `shopping_carts`. |
| `email` | VARCHAR(255) | Target email. |
| `recovery_token` | VARCHAR(255) | Unique token for recovery link. |
| `email_sent_count` | INT UNSIGNED | Number of reminders sent. |
| `last_email_sent_at` | TIMESTAMP | Time of last reminder. |
| `recovered_at` | TIMESTAMP | Time user returned and bought (success). |
| `recovery_order_id` | VARCHAR(50) | FK to `orders`. Resulting order. |
| `created_at` | TIMESTAMP | Creation time. |

---

## Shipping & Tax

### shipping_zones
**Description**: Defines regions for shipping logic.

| Column | Type | Meaning |
| :--- | :--- | :--- |
| `id` | VARCHAR(50) | **PK**. Unique identifier. |
| `name` | VARCHAR(100) | Zone name (e.g., 'North America'). |
| `countries` | JSON | Array of ISO country codes included. |
| `is_active` | BOOLEAN | Toggle zone. |
| `created_at` | TIMESTAMP | Creation time. |
| `updated_at` | TIMESTAMP | Last update. |

### shipping_rates
**Description**: Cost rules associated with zones.

| Column | Type | Meaning |
| :--- | :--- | :--- |
| `id` | VARCHAR(50) | **PK**. Unique identifier. |
| `zone_id` | VARCHAR(50) | FK to `shipping_zones`. |
| `name` | VARCHAR(100) | Rate name (e.g., 'Standard Shipping'). |
| `min_weight` | DECIMAL | Start of weight range. |
| `max_weight` | DECIMAL | End of weight range (NULL = infinite). |
| `base_rate` | DECIMAL | Fixed cost. |
| `per_kg_rate` | DECIMAL | Variable cost per unit weight. |
| `min_order_amount` | DECIMAL | Threshold for free shipping. |
| `estimated_days_min` | INT | Delivery estimate start. |
| `estimated_days_max` | INT | Delivery estimate end. |
| `is_active` | BOOLEAN | Toggle rate. |
| `created_at` | TIMESTAMP | Creation time. |
| `updated_at` | TIMESTAMP | Last update. |

### tax_rates
**Description**: Tax calculations based on location.

| Column | Type | Meaning |
| :--- | :--- | :--- |
| `id` | VARCHAR(50) | **PK**. Unique identifier. |
| `location_json` | JSON | Country, state, zip rules. |
| `tax_name` | VARCHAR(100) | Label (e.g., 'VAT'). |
| `tax_rate` | DECIMAL | Decimal percentage (0.08 = 8%). |
| `is_active` | BOOLEAN | Toggle tax. |
| `created_at` | TIMESTAMP | Creation time. |
| `updated_at` | TIMESTAMP | Last update. |

---

## Database Views

### product_inventory_view
**Description**: Simplifies checking stock levels by joining products, variants, and inventory.
**Columns**: `product_id`, `product_name`, `product_sku`, `variant_id`, `variant_sku`, `size`, `color`, `quantity_available`, `quantity_reserved`, `reorder_point`, `stock_status`

### order_summary_view
**Description**: Aggregates order data for easier reporting.
**Columns**: `id`, `order_number`, `status`, `total_amount`, `currency`, `created_at`, `customer_email`, `customer_name`, `item_count`, `total_quantity`