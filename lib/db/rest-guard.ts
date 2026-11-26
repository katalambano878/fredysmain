// Access rules for the browser-facing data API (/rest/v1, /rest/v1/rpc,
// /storage/v1) on plain Postgres.
//
// On Supabase, row-level security decided who could read or change which
// rows. After the move to plain Postgres the shim ran every request as the
// database owner, so anyone holding the public anon key could list all
// orders, customers and profiles, and change or delete products. This guard
// puts rules back in front of the existing handlers. It only ever refuses a
// request or narrows it; it never widens what the handler behind it allows.
//   - The service key and staff accounts (checked live against the
//     database, not the token) keep full access.
//   - Everyone else may read the public catalogue tables, their own rows
//     (orders, addresses, profile...) and one order by its exact order number
//     or id (order success and pay pages).
//   - Writes are limited to what the shop's own pages do (checkout, contact
//     form, reviews, own address book...). Protected columns (role, payment
//     status...) are dropped from non-staff writes.
//   - Embedded tables in select= follow the same rules, so a public table
//     cannot be used to reach order data through an embed.
// Server code that uses the in-process admin client never passes through here.
//
// The shop's own table lists live in rest-guard.config.ts.

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { query } from "./pool";
import { verifyAccessToken } from "./auth";
import { REST_GUARD, type GuardConfig } from "./rest-guard.config";

// ---- the caller ------------------------------------------------------------

export type GuardActor =
  | { kind: "service" }
  | { kind: "staff"; userId: string }
  | {
      kind: "user";
      userId: string;
      /** Set only when the account's email address is confirmed. */
      confirmedEmail: string | null;
    }
  | { kind: "anon" };

function sameSecret(a: string, b: string): boolean {
  if (!a || !b) return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function presentedKeys(req: Request): string[] {
  const out: string[] = [];
  const apikey = (req.headers.get("apikey") || "").trim();
  if (apikey) out.push(apikey);
  const t = bearer(req);
  if (t) out.push(t);
  return out;
}

function bearer(req: Request): string | null {
  const m = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}

/** The live account. Deleted or banned accounts count as anonymous. */
async function loadAccount(
  cfg: GuardConfig,
  userId: string
): Promise<{ role: string; email: string | null; confirmed: boolean } | null> {
  try {
    const { rows } = await query<{ email: string | null; confirmed: boolean; banned: boolean }>(
      `SELECT u.email,
              (u.email_confirmed_at IS NOT NULL) AS confirmed,
              (u.banned_until IS NOT NULL AND u.banned_until > now()) AS banned
         FROM auth.users u
        WHERE u.id = $1`,
      [userId]
    );
    const u = rows[0];
    if (!u || u.banned) return null;
    let role = "";
    try {
      const r = await query<{ role: string | null }>(cfg.staffRoleSql, [userId]);
      role = String(r.rows[0]?.role ?? "").toLowerCase();
    } catch {
      role = "";
    }
    return { role, email: u.email, confirmed: Boolean(u.confirmed) };
  } catch {
    return null;
  }
}

export async function resolveGuardActor(req: Request): Promise<GuardActor> {
  const cfg = REST_GUARD;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (serviceKey && presentedKeys(req).some((k) => sameSecret(k, serviceKey))) {
    return { kind: "service" };
  }
  const token = bearer(req);
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";
  if (token && !sameSecret(token, anonKey)) {
    const verified = await verifyAccessToken(token);
    const claimRole = verified?.payload?.role;
    // A signed token that is not a user session (anon or service claims) grants nothing.
    if (verified && claimRole !== "anon" && claimRole !== "service_role") {
      const account = await loadAccount(cfg, verified.userId);
      if (account) {
        if (cfg.staffRoles.includes(account.role)) return { kind: "staff", userId: verified.userId };
        return {
          kind: "user",
          userId: verified.userId,
          confirmedEmail: account.confirmed && account.email ? account.email : null,
        };
      }
    }
  }
  return { kind: "anon" };
}

const privileged = (a: GuardActor) => a.kind === "service" || a.kind === "staff";

// ---- select= parsing -------------------------------------------------------

export interface SelectNode {
  table: string;
  /** Plain column names selected inside this embed ("*" when all). */
  columns: string[];
  children: SelectNode[];
}

/** Splits a PostgREST select list on top-level commas. */
function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

/** Plain column names of a select list (aliases and casts removed). */
export function parseColumns(select: string): string[] {
  const cols: string[] = [];
  for (const raw of splitTopLevel(select || "")) {
    const item = raw.trim();
    if (!item || item.includes("(")) continue;
    let c = item;
    const colon = c.indexOf(":");
    if (colon >= 0 && c[colon + 1] !== ":") c = c.slice(colon + 1);
    c = c.split("::")[0].split("->")[0].trim().toLowerCase();
    if (c) cols.push(c);
  }
  return cols;
}

/** The embedded tables of a select list, e.g. "*,order_items(*,products(name))". */
export function parseEmbeds(select: string): SelectNode[] {
  const nodes: SelectNode[] = [];
  for (const raw of splitTopLevel(select || "")) {
    const item = raw.trim();
    const open = item.indexOf("(");
    if (open < 0) continue;
    if (!item.endsWith(")")) {
      // Something we cannot read safely: treat it as an embed of an unknown table.
      nodes.push({ table: "?", columns: ["*"], children: [] });
      continue;
    }
    let head = item.slice(0, open).trim();
    if (head.startsWith("...")) head = head.slice(3).trim();
    const colon = head.lastIndexOf(":");
    if (colon >= 0) head = head.slice(colon + 1);
    const bang = head.indexOf("!");
    if (bang >= 0) head = head.slice(0, bang);
    const table = head.trim().toLowerCase();
    const inner = item.slice(open + 1, -1);
    nodes.push({ table: table || "?", columns: parseColumns(inner), children: parseEmbeds(inner) });
  }
  return nodes;
}

// ---- reads -----------------------------------------------------------------

type ReadDecision =
  | { ok: true; set?: Record<string, string>; parentCheck?: { parent: string; id: string } }
  | { ok: false; status: number; message: string };

const deny = (message: string, status = 403): { ok: false; status: number; message: string } => ({
  ok: false,
  status,
  message,
});

function likeLiteral(v: string): string {
  return v.replace(/[\\%_]/g, (c) => "\\" + c);
}

/** True when the query could match more than rows equal on `keyCol`. */
function hasWideningParams(params: URLSearchParams, keyCol: string): boolean {
  if (params.getAll(keyCol).length !== 1) return true;
  for (const [k, v] of params.entries()) {
    if (/^(not\.)?(or|and)$/.test(k)) return true;
    if (k === keyCol && !/^eq\./.test(v)) return true;
  }
  return false;
}

/** May the caller read `node` embedded under `parent`? */
function embedAllowed(cfg: GuardConfig, parent: string, node: SelectNode): boolean {
  const t = node.table;
  let ok = cfg.publicRead.includes(t);
  if (!ok) {
    const child = cfg.ownChildren[t];
    // e.g. order_items under orders: the parent read is already limited to
    // rows the caller may see.
    if (child && child.parent === parent) ok = true;
  }
  if (!ok) {
    // e.g. reviews > profiles(full_name): only the listed columns.
    const cols = cfg.publicEmbeds[`${parent}>${t}`];
    if (cols && node.columns.length > 0 && node.columns.every((c) => cols.includes(c))) ok = true;
  }
  if (!ok) return false;
  return node.children.every((c) => embedAllowed(cfg, t, c));
}

function embedDenial(cfg: GuardConfig, actor: GuardActor, table: string, select: string | null) {
  if (privileged(actor) || !select) return null;
  for (const node of parseEmbeds(select)) {
    if (!embedAllowed(cfg, table, node)) return deny(`Embedding '${node.table}' in '${table}' is not allowed`);
  }
  return null;
}

function decideRead(cfg: GuardConfig, actor: GuardActor, table: string, params: URLSearchParams): ReadDecision {
  if (privileged(actor)) return { ok: true };
  const select = params.get("select") || "*";

  // Hidden columns (cost prices...) cannot be filtered or sorted on either.
  for (const [k, v] of params.entries()) {
    const col = k.replace(/^not\./, "").split(".").pop() || "";
    if (cfg.hiddenColumnNames.includes(col.toLowerCase())) return deny(`Filtering on '${col}' is not allowed`);
    if ((k === "order" || /^(not\.)?(or|and)$/.test(k)) && cfg.hiddenColumnNames.some((h) => v.toLowerCase().includes(h))) {
      return deny("Sorting or filtering on a hidden column is not allowed");
    }
  }

  if (cfg.publicRead.includes(table)) {
    const e = embedDenial(cfg, actor, table, select);
    if (e) return e;
    return { ok: true };
  }

  // One order by its exact order number or id (order success, pay link).
  const guest = cfg.guestLookup[table];
  if (guest) {
    for (const col of guest.columns) {
      const v = params.get(col);
      if (!v || hasWideningParams(params, col)) continue;
      const pattern = guest.patterns[col];
      if (pattern && !pattern.test(v.slice(3))) continue;
      const e = embedDenial(cfg, actor, table, select);
      if (e) return e;
      return { ok: true };
    }
  }

  const own = cfg.ownRows[table];
  if (own && actor.kind === "user") {
    const e = embedDenial(cfg, actor, table, select);
    if (e) return e;
    // A read filtered on the email column is pinned to the caller's own
    // confirmed address; any other read is pinned to their user id.
    if (own.emailColumn && params.has(own.emailColumn) && actor.confirmedEmail) {
      return { ok: true, set: { [own.emailColumn]: `ilike.${likeLiteral(actor.confirmedEmail)}` } };
    }
    // Unconfirmed address: the client's email filter stays, and the read is
    // also pinned to the caller's user id.
    return { ok: true, set: { [own.userColumn]: `eq.${actor.userId}` } };
  }

  // A child table read directly, e.g. order_items?order_id=eq.<id>: allowed
  // when the parent row is one the caller may read.
  const child = cfg.ownChildren[table];
  if (child) {
    const v = params.get(child.fk);
    if (v && !hasWideningParams(params, child.fk)) {
      const e = embedDenial(cfg, actor, table, select);
      if (e) return e;
      return { ok: true, parentCheck: { parent: child.parent, id: v.slice(3) } };
    }
  }

  if (actor.kind === "anon" && (own || child)) return deny("Sign in to see this", 401);
  return deny(`Reading '${table}' is not allowed`);
}

/** Can the caller read parent row `id` (own row, or an exact-id guest lookup)? */
async function parentReadable(cfg: GuardConfig, actor: GuardActor, parent: string, id: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
  if (cfg.guestLookup[parent]?.columns.includes("id")) return true;
  const rule = cfg.ownRows[parent];
  if (!rule || actor.kind !== "user") return false;
  const cols = [`${rule.userColumn}::text AS owner`];
  if (rule.emailColumn) cols.push(`${rule.emailColumn}::text AS email`);
  try {
    const { rows } = await query<Record<string, unknown>>(
      `SELECT ${cols.join(", ")} FROM public.${parent} WHERE id = $1`,
      [id]
    );
    const r = rows[0];
    if (!r) return false;
    if (r.owner === actor.userId) return true;
    return Boolean(
      actor.confirmedEmail &&
        typeof r.email === "string" &&
        r.email.toLowerCase() === actor.confirmedEmail.toLowerCase()
    );
  } catch {
    return false;
  }
}

// ---- writes ----------------------------------------------------------------

type Row = Record<string, unknown>;

type WriteDecision =
  | { ok: true; set?: Record<string, string>; body?: unknown }
  | { ok: false; status: number; message: string };

function rowsOf(body: unknown): Row[] | null {
  if (Array.isArray(body)) return body.every((r) => r && typeof r === "object" && !Array.isArray(r)) ? (body as Row[]) : null;
  if (body && typeof body === "object") return [body as Row];
  return null;
}

function stripColumns(rows: Row[], cols: string[]): Row[] {
  if (!cols.length) return rows;
  return rows.map((r) => {
    const n = { ...r };
    for (const c of cols) delete n[c];
    return n;
  });
}

/** A new, unpaid order of the caller's (or a guest order placed signed out). */
async function newOwnOrder(cfg: GuardConfig, actor: GuardActor, parent: string, id: string): Promise<boolean> {
  const rule = cfg.ownRows[parent];
  const cw = cfg.childWrite;
  if (!rule || !cw || !/^[0-9a-f-]{36}$/i.test(id)) return false;
  try {
    const { rows } = await query<{ owner: string | null; fresh: boolean; unpaid: boolean }>(
      `SELECT ${rule.userColumn}::text AS owner,
              (created_at > now() - make_interval(mins => $2::int)) AS fresh,
              (${cw.unpaidSql}) AS unpaid
         FROM public.${parent} WHERE id = $1`,
      [id, cw.maxAgeMinutes]
    );
    const r = rows[0];
    if (!r || !r.fresh || !r.unpaid) return false;
    if (actor.kind === "user") return r.owner === actor.userId || r.owner == null;
    return r.owner == null;
  } catch {
    return false;
  }
}

async function decideWrite(
  cfg: GuardConfig,
  actor: GuardActor,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  table: string,
  params: URLSearchParams,
  body: unknown,
  isUpsert: boolean
): Promise<WriteDecision> {
  if (privileged(actor)) return { ok: true };
  const rule = cfg.write[table];
  const protectedCols = cfg.protectedColumns[table] || [];
  const e = embedDenial(cfg, actor, table, params.get("select"));
  if (e) return e;
  const owner = rule?.ownerColumn || cfg.ownRows[table]?.userColumn;

  if (method === "POST") {
    const mode = rule?.insert;
    if (!mode) return deny(`Adding to '${table}' is not allowed`);
    if (isUpsert) {
      // An upsert can overwrite someone else's row through the conflict key,
      // unless the key includes the owner column (which is forced below).
      const onConflict = (params.get("on_conflict") || "").split(",").map((s) => s.trim());
      if (mode !== "own" || !rule?.upsertOn || !rule.upsertOn.every((c) => onConflict.includes(c))) {
        return deny(`Upsert on '${table}' is not allowed`);
      }
    }
    const rows = rowsOf(body);
    if (!rows) return deny("Invalid body", 400);
    if (mode === "user" && actor.kind !== "user") return deny("Sign in first", 401);
    if (mode === "own") {
      if (actor.kind !== "user" || !owner) return deny("Sign in first", 401);
      for (const r of rows) {
        if (r[owner] != null && r[owner] !== actor.userId) return deny("You can only add your own rows");
        r[owner] = actor.userId;
      }
    }
    if ((mode === "anyone" || mode === "user") && owner) {
      for (const r of rows) {
        if (r[owner] == null) continue;
        if (actor.kind !== "user" || r[owner] !== actor.userId) return deny("You can only add your own rows");
      }
    }
    if (mode === "childOfNewOrder") {
      const child = cfg.ownChildren[table];
      if (!child) return deny(`Adding to '${table}' is not allowed`);
      const ids = Array.from(new Set(rows.map((r) => String(r[child.fk] ?? ""))));
      for (const id of ids) {
        if (!(await newOwnOrder(cfg, actor, child.parent, id))) {
          return deny("Items can only be added to your own new order");
        }
      }
    }
    const clean = stripColumns(rows, protectedCols);
    return { ok: true, body: Array.isArray(body) ? clean : clean[0] };
  }

  const mode = method === "DELETE" ? rule?.delete : rule?.update;
  if (mode !== "own" || !owner) {
    return deny(`${method === "DELETE" ? "Deleting from" : "Changing"} '${table}' is not allowed`);
  }
  if (actor.kind !== "user") return deny("Sign in first", 401);
  if (method === "DELETE") return { ok: true, set: { [owner]: `eq.${actor.userId}` } };
  const rows = rowsOf(body);
  if (!rows || rows.length !== 1 || Array.isArray(body)) return deny("Invalid body", 400);
  if (rows[0][owner] != null && rows[0][owner] !== actor.userId) return deny("You can only change your own rows");
  return { ok: true, set: { [owner]: `eq.${actor.userId}` }, body: stripColumns(rows, protectedCols)[0] };
}

// ---- wiring ----------------------------------------------------------------

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, prefer, x-client-info, accept-profile, content-profile, x-upsert",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
};

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { message, code: status === 401 ? "PGRST301" : "42501", details: null, hint: null },
    { status, headers: CORS }
  );
}

function logDeny(method: string, path: string, actor: GuardActor, message: string) {
  // No values are logged; denied legitimate flows show up in the app log.
  console.warn(`[rest-guard] deny ${method} ${path} as ${actor.kind}: ${message}`);
}

type Ctx = { params: Promise<any> };
type Handler = (req: NextRequest, ctx: Ctx) => Promise<Response> | Response;

function rebuild(req: NextRequest, set: Record<string, string> | undefined, body?: string): NextRequest {
  const url = new URL(req.url);
  if (set) for (const [k, v] of Object.entries(set)) url.searchParams.set(k, v);
  const headers = new Headers(req.headers);
  headers.delete("content-length");
  const init: { method: string; headers: Headers; body?: string } = { method: req.method, headers };
  if (body !== undefined && req.method !== "GET" && req.method !== "HEAD") init.body = body;
  return new NextRequest(url, init);
}

/** Removes hidden columns (at any depth) and hidden rows from a non-staff read. */
async function hideFromResponse(cfg: GuardConfig, table: string, res: Response): Promise<Response> {
  const rowRule = cfg.hiddenRows[table];
  if ((!cfg.hiddenColumnNames.length && !rowRule) || res.status >= 300) return res;
  const text = await res.text();
  const headers = new Headers(res.headers);
  headers.delete("content-length");
  try {
    const scrub = (v: unknown): unknown => {
      if (Array.isArray(v)) return v.map(scrub);
      if (!v || typeof v !== "object") return v;
      const n: Row = {};
      for (const [k, val] of Object.entries(v as Row)) {
        if (cfg.hiddenColumnNames.includes(k.toLowerCase())) continue;
        n[k] = scrub(val);
      }
      return n;
    };
    let data = JSON.parse(text);
    if (rowRule) {
      const hidden = (r: unknown) =>
        !!r && typeof r === "object" && rowRule.values.includes(String((r as Row)[rowRule.column]));
      if (Array.isArray(data)) data = data.filter((r) => !hidden(r));
      else if (hidden(data)) data = null;
    }
    return new Response(JSON.stringify(scrub(data)), { status: res.status, headers });
  } catch {
    return new Response(text, { status: res.status, headers });
  }
}

/** Wraps a /rest/v1/[table] route handler with the access rules. */
export function guardTable(method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", handler: Handler): Handler {
  return async (req, ctx) => {
    const cfg = REST_GUARD;
    const p = await ctx.params;
    const table = String(p?.table || "").toLowerCase();
    const next = () => ({ params: Promise.resolve(p) });
    const actor = await resolveGuardActor(req);
    const params = new URL(req.url).searchParams;
    const path = `/rest/v1/${table}`;

    if (method === "GET") {
      const d = decideRead(cfg, actor, table, params);
      if (!d.ok) {
        logDeny(method, path, actor, d.message);
        return jsonError(d.message, d.status);
      }
      if (d.parentCheck && !(await parentReadable(cfg, actor, d.parentCheck.parent, d.parentCheck.id))) {
        logDeny(method, path, actor, "parent row not readable");
        return jsonError(`Reading '${table}' is not allowed`, actor.kind === "anon" ? 401 : 403);
      }
      const res = await handler(d.set ? rebuild(req, d.set) : req, next());
      return privileged(actor) ? res : hideFromResponse(cfg, table, res);
    }

    if (privileged(actor)) return handler(req, next());

    const raw = await req.text().catch(() => "");
    let body: unknown = undefined;
    if (raw) {
      try {
        body = JSON.parse(raw);
      } catch {
        return jsonError("Invalid JSON body", 400);
      }
    }
    const prefer = req.headers.get("prefer") || "";
    const d = await decideWrite(cfg, actor, method, table, params, body, prefer.includes("resolution=merge-duplicates"));
    if (!d.ok) {
      logDeny(method, path, actor, d.message);
      return jsonError(d.message, d.status);
    }
    const nextBody = d.body !== undefined ? JSON.stringify(d.body) : raw;
    return handler(rebuild(req, d.set, nextBody), next());
  };
}

/** Wraps a /rest/v1/rpc/[fn] route handler. */
export function guardRpc(handler: Handler): Handler {
  return async (req, ctx) => {
    const cfg = REST_GUARD;
    const p = await ctx.params;
    const fn = String(p?.fn || p?.name || p?.function || "").toLowerCase();
    const actor = await resolveGuardActor(req);
    if (!privileged(actor)) {
      const mode = cfg.rpc[fn];
      const ok = mode === "anyone" || (mode === "user" && actor.kind === "user");
      if (!ok) {
        const msg = mode === "user" ? "Sign in first" : `Calling '${fn}' is not allowed`;
        logDeny(req.method, `/rest/v1/rpc/${fn}`, actor, msg);
        return jsonError(msg, actor.kind === "anon" ? 401 : 403);
      }
    }
    return handler(req, { params: Promise.resolve(p) });
  };
}

/** Wraps a /storage/v1 upload, move or delete handler: staff only, except user upload buckets. */
export function guardStorageWrite(handler: Handler): Handler {
  return async (req, ctx) => {
    const cfg = REST_GUARD;
    const p = await ctx.params;
    const bucket = String(p?.bucket || "");
    const actor = await resolveGuardActor(req);
    if (!privileged(actor)) {
      const userUpload =
        actor.kind === "user" && req.method !== "DELETE" && cfg.userUploadBuckets.includes(bucket);
      if (!userUpload) {
        logDeny(req.method, `/storage/v1/object/${bucket}`, actor, "storage write");
        return jsonError("Changing files requires an admin account", actor.kind === "anon" ? 401 : 403);
      }
    }
    return handler(req, { params: Promise.resolve(p) });
  };
}
