// Foreign-key map for PostgREST-style embeds — Frebys (fredysmain) Jul 2026
export interface FkEdge {
  column: string;
  foreignTable: string;
  foreignColumn: string;
}

export const JSONB_COLUMNS: Record<string, Set<string>> = {
  addresses: new Set(["metadata"]),
  audit_logs: new Set(["details"]),
  categories: new Set(["metadata"]),
  chat_conversations: new Set(["messages", "metadata"]),
  cms_content: new Set(["metadata"]),
  coupons: new Set(["metadata"]),
  customer_insights: new Set(["ai_notes", "preferences"]),
  customers: new Set(["default_address"]),
  delivery_assignments: new Set(["metadata"]),
  notifications: new Set(["data"]),
  order_items: new Set(["metadata"]),
  orders: new Set(["billing_address", "metadata", "shipping_address"]),
  product_cost_of_production: new Set(["per_variant_costs"]),
  product_variants: new Set(["metadata"]),
  products: new Set(["metadata", "options"]),
  profiles: new Set(["preferences"]),
  riders: new Set(["metadata"]),
  roles: new Set(["permissions"]),
  site_settings: new Set(["value"]),
  store_settings: new Set(["value"]),
  support_analytics_daily: new Set(["sentiment_distribution", "top_categories", "top_intents"]),
  support_escalation_rules: new Set(["action_value", "condition_value"]),
  support_ticket_messages: new Set(["attachments", "metadata"]),
  support_tickets: new Set(["metadata"]),
};

/** Keyed by the table that OWNS the FK column. */
export const FK_MAP: Record<string, FkEdge[]> = {
  ai_memory: [
    { column: "source_conversation_id", foreignTable: "chat_conversations", foreignColumn: "id" },
  ],
  cart_items: [
    { column: "product_id", foreignTable: "products", foreignColumn: "id" },
    { column: "variant_id", foreignTable: "product_variants", foreignColumn: "id" },
  ],
  categories: [
    { column: "parent_id", foreignTable: "categories", foreignColumn: "id" },
  ],
  delivery_assignments: [
    { column: "order_id", foreignTable: "orders", foreignColumn: "id" },
    { column: "rider_id", foreignTable: "riders", foreignColumn: "id" },
    { column: "zone_id", foreignTable: "delivery_zones", foreignColumn: "id" },
  ],
  delivery_status_history: [
    { column: "assignment_id", foreignTable: "delivery_assignments", foreignColumn: "id" },
  ],
  gallery_preorders: [
    { column: "gallery_item_id", foreignTable: "homepage_gallery", foreignColumn: "id" },
  ],
  navigation_items: [
    { column: "menu_id", foreignTable: "navigation_menus", foreignColumn: "id" },
    { column: "parent_id", foreignTable: "navigation_items", foreignColumn: "id" },
  ],
  order_items: [
    { column: "order_id", foreignTable: "orders", foreignColumn: "id" },
    { column: "product_id", foreignTable: "products", foreignColumn: "id" },
    { column: "variant_id", foreignTable: "product_variants", foreignColumn: "id" },
  ],
  order_status_history: [
    { column: "order_id", foreignTable: "orders", foreignColumn: "id" },
  ],
  orders: [
    { column: "packed_by", foreignTable: "profiles", foreignColumn: "id" },
    { column: "staff_id", foreignTable: "profiles", foreignColumn: "id" },
  ],
  product_cost_of_production: [
    { column: "product_id", foreignTable: "products", foreignColumn: "id" },
    { column: "production_staff_id", foreignTable: "production_staff", foreignColumn: "id" },
  ],
  product_images: [
    { column: "product_id", foreignTable: "products", foreignColumn: "id" },
  ],
  product_variants: [
    { column: "product_id", foreignTable: "products", foreignColumn: "id" },
  ],
  production_logs: [
    { column: "product_id", foreignTable: "products", foreignColumn: "id" },
    { column: "production_staff_id", foreignTable: "production_staff", foreignColumn: "id" },
  ],
  products: [
    { column: "category_id", foreignTable: "categories", foreignColumn: "id" },
    { column: "created_by", foreignTable: "profiles", foreignColumn: "id" },
  ],
  return_items: [
    { column: "order_item_id", foreignTable: "order_items", foreignColumn: "id" },
    { column: "return_request_id", foreignTable: "return_requests", foreignColumn: "id" },
  ],
  return_requests: [
    { column: "order_id", foreignTable: "orders", foreignColumn: "id" },
  ],
  review_images: [
    { column: "review_id", foreignTable: "reviews", foreignColumn: "id" },
  ],
  reviews: [
    { column: "product_id", foreignTable: "products", foreignColumn: "id" },
  ],
  riders: [
    { column: "zone_id", foreignTable: "delivery_zones", foreignColumn: "id" },
  ],
  support_feedback: [
    { column: "conversation_id", foreignTable: "chat_conversations", foreignColumn: "id" },
    { column: "ticket_id", foreignTable: "support_tickets", foreignColumn: "id" },
  ],
  support_knowledge_base: [
    { column: "source_ticket_id", foreignTable: "support_tickets", foreignColumn: "id" },
  ],
  support_ticket_messages: [
    { column: "ticket_id", foreignTable: "support_tickets", foreignColumn: "id" },
  ],
  support_tickets: [
    { column: "conversation_id", foreignTable: "chat_conversations", foreignColumn: "id" },
  ],
  wishlist_items: [
    { column: "product_id", foreignTable: "products", foreignColumn: "id" },
  ],
};

