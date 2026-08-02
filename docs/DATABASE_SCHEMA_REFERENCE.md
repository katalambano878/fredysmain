# DATABASE SCHEMA REFERENCE — Frebys (`frebys`)

PostgreSQL **16.14** · Schema `public` (+ `auth.users`)

## Core commerce

| Table | Purpose | PK | Key FKs / uniques |
|-------|---------|----|-------------------|
| `products` | Catalog | `id` uuid | `slug` unique; status enum |
| `product_variants` | Size/options + prices | `id` | `product_id` → products |
| `product_images` | Images | `id` | `product_id` → products |
| `categories` | Categories | `id` | optional parent |
| `orders` | Orders + payment status | `id` | `order_number` **unique** |
| `order_items` | Line items | `id` | `order_id`, `product_id` |
| `order_status_history` | Status audit | `id` | `order_id` |
| `customers` | CRM aggregate | `id` | `email` unique |
| `coupons` | Discounts | `id` | code |
| `addresses` | Saved addresses | `id` | `user_id` → auth.users |

## Payments (added 2026-08-02)

| Table | Purpose |
|-------|---------|
| `payment_attempts` | Per-gateway attempt; unique `internal_reference` |
| `payment_callback_events` | Deduped callbacks; unique `(gateway, payload_hash)` |
| `sms_message_logs` | SMS send attempts; unique `idempotency_key` (partial) |

### `orders` money fields
`subtotal`, `tax_total`, `shipping_total`, `discount_total`, `total` → `numeric`  
Checks: `total >= 0`, `subtotal >= 0`  
Status enums: `order_status`, `payment_status`

## Auth
`auth.users` (shim) · `public.profiles` (role: admin/staff/customer)

## Content / ops
`blog_posts`, `homepage_gallery`, `gallery_preorders`, `store_modules`, `site_settings`, `cms_content`, `banners`, `pages`, support_*, delivery_*, `production_*`, `product_cost_of_production`, chat (`chat_conversations`, `ai_memory`), `notifications`, `wishlist_items`, `cart_items`, `reviews`

## Important RPCs
- `mark_order_paid(order_ref text, moolre_ref text)` → jsonb (Hubtel/Moolre)
- `mark_order_paid(p_order_id uuid, ...)` → void (admin)
- `get_dashboard_stats()`, `get_storefront_products(...)`, `upsert_customer_from_order(...)`, `update_customer_stats(...)`

Full column dumps: generate via `scripts/db-introspect.mjs` against `DATABASE_URL`.
