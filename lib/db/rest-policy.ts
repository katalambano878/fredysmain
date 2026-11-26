// Who may do what through the browser-facing data API (/rest/v1).
//
// The API used to run every request with full database rights and never looked at who
// was asking, so anyone on the internet could read or change any table. Rules now:
//   - admin and staff (a valid session whose profile says so): everything, as before
//   - a signed-in customer: the public catalogue, plus their own orders, plus posting a review
//   - anyone else: the public catalogue, and sending a contact message
// Anything not listed here is refused.

import { verifyAccessToken } from "./auth";
import { query } from "./pool";

export type Caller =
  | { kind: "anon" }
  | { kind: "customer"; userId: string }
  | { kind: "staff"; userId: string };

const ANON: Caller = { kind: "anon" };

export async function resolveCaller(req: Request): Promise<Caller> {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return ANON;
  // The public "anon key" is not one of our session tokens, so it fails here and reads as anonymous.
  const verified = await verifyAccessToken(token);
  if (!verified) return ANON;
  try {
    // The role comes from the database on every request, never from the token.
    const { rows } = await query<{ role: string }>("SELECT role FROM profiles WHERE id = $1 LIMIT 1", [
      verified.userId,
    ]);
    const role = String(rows[0]?.role || "");
    if (role === "admin" || role === "staff") return { kind: "staff", userId: verified.userId };
    return { kind: "customer", userId: verified.userId };
  } catch {
    return ANON;
  }
}

type ReadRule = {
  /** Equality filters added to the query no matter what the caller asked for. */
  forced?: Record<string, unknown>;
};

/** Tables anyone may read, with the rows they are limited to. */
const PUBLIC_READ: Record<string, ReadRule> = {
  products: { forced: { status: "active" } },
  product_variants: {},
  product_images: {},
  categories: {},
  banners: {},
  cms_content: {},
  blog_posts: { forced: { status: "published" } },
  reviews: { forced: { status: "approved" } },
};

/** Tables that may appear nested inside a select for someone who is not staff. */
const PUBLIC_EMBEDS = new Set(["products", "product_variants", "product_images", "categories"]);
const CUSTOMER_EMBEDS = new Set([...PUBLIC_EMBEDS, "order_items"]);

/** Columns that never leave the server for someone who is not staff, wherever they appear. */
const PRIVATE_COLUMNS = new Set(["cost_per_item"]);

/** Database functions callable through /rest/v1/rpc. */
const PUBLIC_RPC = new Set(["get_order_for_tracking"]);
const STAFF_RPC = new Set([
  ...PUBLIC_RPC,
  "upsert_customer_from_order",
  "search_chat_conversations",
  "get_support_dashboard_stats",
]);

export type Decision =
  | { allowed: true; forced: Record<string, unknown> }
  | { allowed: false; status: number; message: string };

const DENIED: Decision = { allowed: false, status: 403, message: "Not allowed" };
const SIGN_IN: Decision = { allowed: false, status: 401, message: "Sign in to continue" };

/** Table names nested in a PostgREST select, e.g. `*, items:order_items!fk(*)` gives order_items. */
function embeddedTables(select: string): string[] {
  const names: string[] = [];
  const pattern = /([A-Za-z_][A-Za-z0-9_]*)\s*(?:![A-Za-z0-9_]+)?\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(select))) names.push(match[1].toLowerCase());
  return names;
}

export function decideRead(caller: Caller, table: string, select: string): Decision {
  if (caller.kind === "staff") return { allowed: true, forced: {} };

  const allowedEmbeds = caller.kind === "customer" ? CUSTOMER_EMBEDS : PUBLIC_EMBEDS;
  if (embeddedTables(select).some((name) => !allowedEmbeds.has(name))) return DENIED;

  const rule = PUBLIC_READ[table];
  if (rule) return { allowed: true, forced: rule.forced || {} };

  // A customer's own orders (the account pages), and nothing else of anyone's.
  if (table === "orders") {
    if (caller.kind !== "customer") return SIGN_IN;
    return { allowed: true, forced: { user_id: caller.userId } };
  }
  return caller.kind === "anon" ? SIGN_IN : DENIED;
}

export type InsertDecision =
  | { allowed: true; rows: Record<string, unknown>[]; returnRows: boolean }
  | { allowed: false; status: number; message: string };

function pick(source: unknown, keys: string[], maxLength: number): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!source || typeof source !== "object") return out;
  for (const key of keys) {
    const value = (source as Record<string, unknown>)[key];
    if (value == null) continue;
    out[key] = typeof value === "string" ? value.slice(0, maxLength) : value;
  }
  return out;
}

export function decideInsert(caller: Caller, table: string, body: unknown): InsertDecision {
  const list = Array.isArray(body) ? body : [body];
  if (caller.kind === "staff") {
    return { allowed: true, rows: list as Record<string, unknown>[], returnRows: true };
  }
  if (list.length !== 1) return { allowed: false, status: 400, message: "One row at a time" };

  if (table === "contact_submissions") {
    const row = pick(list[0], ["name", "email", "phone", "subject", "message"], 4000);
    if (!row.message || !row.email) return { allowed: false, status: 400, message: "Email and message are required" };
    return { allowed: true, rows: [row], returnRows: false };
  }

  if (table === "reviews") {
    if (caller.kind !== "customer") return SIGN_IN as InsertDecision;
    const row = pick(list[0], ["product_id", "title", "content"], 4000);
    const rating = Math.round(Number((list[0] as Record<string, unknown>)?.rating));
    if (!row.product_id || !(rating >= 1 && rating <= 5)) {
      return { allowed: false, status: 400, message: "A product and a rating from 1 to 5 are required" };
    }
    // The shopper cannot choose who wrote it, or approve it themselves.
    return {
      allowed: true,
      rows: [{ ...row, rating, user_id: caller.userId, status: "pending", verified_purchase: false }],
      returnRows: false,
    };
  }

  return caller.kind === "anon" ? (SIGN_IN as InsertDecision) : (DENIED as InsertDecision);
}

/** Changing and deleting rows through this API is for staff only. */
export function mayWrite(caller: Caller): boolean {
  return caller.kind === "staff";
}

export function mayCallRpc(caller: Caller, fn: string): boolean {
  return (caller.kind === "staff" ? STAFF_RPC : PUBLIC_RPC).has(fn);
}

/** Remove private columns from rows (and nested rows) before they leave the server. */
export function scrub<T>(caller: Caller, data: T): T {
  if (caller.kind === "staff" || data == null) return data;
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(visit);
    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
        if (PRIVATE_COLUMNS.has(key)) continue;
        out[key] = inner && typeof inner === "object" ? visit(inner) : inner;
      }
      return out;
    }
    return value;
  };
  return visit(data) as T;
}
