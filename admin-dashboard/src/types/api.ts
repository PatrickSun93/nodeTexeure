// Shapes of what the backend sends the admin dashboard. Node and Rust answer
// identically (backend/tests/parity*.test.js), so these come from the Express
// routes in backend/routes/admin/ and backend/utils/responseFormatter.js.

export type ApiStatus = 'SUCCESS' | 'FAIL';

/**
 * Every endpoint's envelope (ResponseFormatter). keyValueTable is usually an
 * array holding one named object, e.g. `[{ orders: [...] }]`; failures may
 * omit `message` or carry details instead.
 */
export interface ApiResponse<T = unknown> {
  status: ApiStatus;
  message?: string;
  keyValueTable: T;
}

/** `[{ name: value }]`, the common keyValueTable shape. */
export type Named<K extends string, V> = [Record<K, V>];

/** MySQL DECIMAL and BIGINT columns arrive as strings (mysql2 bigNumberStrings). */
export type Decimal = string;

/** DATETIME / TIMESTAMP columns, serialized by res.json as ISO strings. */
export type IsoDate = string;

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded';

/** GET /api/admin/orders: one row per order, status capitalized. */
export interface OrderListItem {
  /** order_number, or the id when there is none */
  id: string;
  /** the orders.id to act on */
  _id: string;
  date: IsoDate;
  customer: string;
  amount: Decimal;
  destination: string;
  status: string;
}

export interface Address {
  first_name?: string;
  last_name?: string;
  company?: string;
  address_line_1?: string;
  address_line_2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  phone?: string;
  [key: string]: unknown;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  variant_id: string | null;
  product_name: string;
  product_sku: string;
  variant_details: unknown;
  quantity: number;
  unit_price: Decimal;
  total_price: Decimal;
  [key: string]: unknown;
}

/** GET /api/admin/orders/:id: the orders row plus the customer and items. */
export interface OrderDetail {
  id: string;
  order_number: string;
  user_id: string | null;
  guest_email: string | null;
  status: OrderStatus;
  payment_status: string;
  subtotal: Decimal;
  tax_amount: Decimal;
  shipping_amount: Decimal;
  discount_amount: Decimal;
  total_amount: Decimal;
  currency: string;
  shipping_address_json: Address;
  billing_address_json: Address;
  shipping_method: string | null;
  tracking_number: string | null;
  shipped_at: IsoDate | null;
  delivered_at: IsoDate | null;
  paid_at: IsoDate | null;
  created_at: IsoDate;
  updated_at: IsoDate;
  first_name: string | null;
  last_name: string | null;
  user_email: string | null;
  items: OrderItem[];
  [key: string]: unknown;
}

/** GET /api/admin/products: one row per variant (or per product without variants). */
export interface ProductListItem {
  id: string;
  product_id: string;
  name: string;
  sku: string | null;
  category: string;
  price: string;
  stock: number;
  status: 'Active' | 'Draft' | 'Out of Stock';
  image: string | null;
}

export interface ProductVariant {
  id: string;
  product_id: string;
  sku: string;
  size: string | null;
  color: string | null;
  price_adjustment: Decimal | null;
  stock: number | null;
  [key: string]: unknown;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parent_id: string | null;
  sort_order: number | null;
  is_active: number | null;
}

/** GET /api/admin/users: customers with order totals. */
export interface CustomerListItem {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  orders: number;
  spent: Decimal;
  lastOrder: IsoDate | null;
}

/** GET /api/admin/staff: role and status capitalized. */
export interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  lastActive: IsoDate | 'Never';
}

/** GET /api/admin/coupons: discount_codes rows plus derived dates and status. */
export interface Coupon {
  id: string;
  code: string;
  name: string;
  discount_details: Record<string, unknown>;
  type: 'percentage' | 'fixed_amount' | 'free_shipping';
  value: Decimal;
  minimum_order_amount: Decimal | null;
  maximum_discount_amount: Decimal | null;
  usage_limit: number | null;
  usage_count: number | null;
  usage_limit_per_customer: number | null;
  /** BOOLEAN, i.e. TINYINT(1): 0 or 1 */
  is_active: number | null;
  starts_at: IsoDate | null;
  expires_at: IsoDate | null;
  startDate: IsoDate | null;
  endDate: IsoDate | null;
  status: 'Draft' | 'Expired' | 'Scheduled' | 'Active';
  [key: string]: unknown;
}
