import { NextRequest, NextResponse } from "next/server";
import {
  createClient,
  applyPostgrestParams,
} from "@/lib/db/supabase-compat";
import { isPlainPostgres } from "@/lib/db/mode";
import { decideInsert, decideRead, mayWrite, resolveCaller, scrub } from "@/lib/db/rest-policy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PG_IDENT = /^[a-z_][a-z0-9_]*$/i;

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, prefer, x-client-info, accept-profile, content-profile",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
  };
}

function preferSingle(req: NextRequest): boolean {
  const accept = req.headers.get("accept") || "";
  return accept.includes("application/vnd.pgrst.object+json");
}

function preferReturn(req: NextRequest): boolean {
  const prefer = req.headers.get("prefer") || "";
  return prefer.includes("return=representation") || prefer.includes("resolution=");
}

function preferCount(req: NextRequest): boolean {
  const prefer = req.headers.get("prefer") || "";
  return prefer.includes("count=exact");
}

function jsonError(message: string, status = 400) {
  return NextResponse.json(
    { message, code: "PGRST", details: null, hint: null },
    { status, headers: corsHeaders() }
  );
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ table: string }> }
) {
  if (!isPlainPostgres()) {
    return jsonError("Plain Postgres mode is not enabled (DATABASE_URL missing)", 503);
  }
  const { table } = await ctx.params;
  if (!PG_IDENT.test(table)) return jsonError("Invalid table");

  const select = req.nextUrl.searchParams.get("select") || "*";
  const caller = await resolveCaller(req);
  const decision = decideRead(caller, table.toLowerCase(), select);
  if (!decision.allowed) return jsonError(decision.message, decision.status);

  const client = createClient();
  const qb = client.from(table);
  if (preferCount(req)) {
    qb.select(select, {
      count: "exact",
      head: req.headers.get("prefer")?.includes("head=true"),
    });
  } else {
    qb.select(select);
  }
  // Apply filters/order/limit without re-applying select
  const params = new URLSearchParams(req.nextUrl.searchParams);
  params.delete("select");
  applyPostgrestParams(qb as any, params, {
    preferSingle: preferSingle(req),
  });
  // Rows this caller is limited to, whatever filters they sent.
  for (const [column, value] of Object.entries(decision.forced)) {
    (qb as any).eq(column, value);
  }

  const result = await qb;
  if (result.error) {
    return jsonError(caller.kind === "staff" ? result.error.message || "Query failed" : "Query failed", 400);
  }
  result.data = scrub(caller, result.data);

  const headers = new Headers(corsHeaders());
  headers.set("Content-Type", "application/json");
  if (result.count != null) {
    const rows = Array.isArray(result.data)
      ? result.data
      : result.data
        ? [result.data]
        : [];
    const len = rows.length;
    const offset = Math.max(0, Number(params.get("offset") || 0) || 0);
    // PostgREST: empty/head counts use */N (fixes shop "12 of 0")
    if (len === 0) {
      headers.set("Content-Range", `*/${result.count}`);
    } else {
      headers.set(
        "Content-Range",
        `${offset}-${offset + len - 1}/${result.count}`
      );
    }
  }

  if (preferSingle(req)) {
    return NextResponse.json(result.data, { status: 200, headers });
  }
  return NextResponse.json(result.data ?? [], { status: 200, headers });
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ table: string }> }
) {
  if (!isPlainPostgres()) {
    return jsonError("Plain Postgres mode is not enabled (DATABASE_URL missing)", 503);
  }
  const { table } = await ctx.params;
  if (!PG_IDENT.test(table)) return jsonError("Invalid table");

  const body = await req.json().catch(() => null);
  if (body == null) return jsonError("Invalid JSON body");

  const caller = await resolveCaller(req);
  const decision = decideInsert(caller, table.toLowerCase(), body);
  if (!decision.allowed) return jsonError(decision.message, decision.status);

  const client = createClient();
  let qb = client.from(table).insert(decision.rows);
  if (decision.returnRows && (preferReturn(req) || preferSingle(req))) {
    qb = qb.select("*") as typeof qb;
  }
  if (decision.returnRows && preferSingle(req)) qb = qb.single() as typeof qb;

  const result = await qb;
  if (result.error) {
    return jsonError(caller.kind === "staff" ? result.error.message || "Insert failed" : "Could not save that", 400);
  }

  return NextResponse.json(result.data, {
    status: 201,
    headers: corsHeaders(),
  });
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ table: string }> }
) {
  if (!isPlainPostgres()) {
    return jsonError("Plain Postgres mode is not enabled (DATABASE_URL missing)", 503);
  }
  const { table } = await ctx.params;
  if (!PG_IDENT.test(table)) return jsonError("Invalid table");

  const body = await req.json().catch(() => null);
  if (body == null || typeof body !== "object") return jsonError("Invalid JSON body");

  if (!mayWrite(await resolveCaller(req), table, body)) return jsonError("Not allowed", 403);

  const client = createClient();
  let qb = client.from(table).update(body);
  applyPostgrestParams(qb as any, req.nextUrl.searchParams);
  if (preferReturn(req) || preferSingle(req)) {
    qb = qb.select("*") as typeof qb;
  }
  if (preferSingle(req)) qb = qb.single() as typeof qb;

  const result = await qb;
  if (result.error) return jsonError(result.error.message || "Update failed", 400);

  return NextResponse.json(result.data, { status: 200, headers: corsHeaders() });
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ table: string }> }
) {
  if (!isPlainPostgres()) {
    return jsonError("Plain Postgres mode is not enabled (DATABASE_URL missing)", 503);
  }
  const { table } = await ctx.params;
  if (!PG_IDENT.test(table)) return jsonError("Invalid table");

  if (!mayWrite(await resolveCaller(req), table, null, true)) return jsonError("Not allowed", 403);

  const client = createClient();
  let qb = client.from(table).delete();
  applyPostgrestParams(qb as any, req.nextUrl.searchParams);
  if (preferReturn(req)) {
    qb = qb.select("*") as typeof qb;
  }

  const result = await qb;
  if (result.error) return jsonError(result.error.message || "Delete failed", 400);

  return NextResponse.json(result.data ?? null, { status: 200, headers: corsHeaders() });
}
