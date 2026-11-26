import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/supabase-compat";
import { isPlainPostgres } from "@/lib/db/mode";
import { mayCallRpc, resolveCaller } from "@/lib/db/rest-policy";

import { guardRpc } from "@/lib/db/rest-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PG_IDENT = /^[a-z_][a-z0-9_]*$/i;

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    },
  });
}

async function postUnguarded(
  req: NextRequest,
  ctx: { params: Promise<{ fn: string }> }
) {
  if (!isPlainPostgres()) {
    return NextResponse.json({ message: "DATABASE_URL not set" }, { status: 503 });
  }
  const { fn } = await ctx.params;
  if (!PG_IDENT.test(fn)) {
    return NextResponse.json({ message: "Invalid function name" }, { status: 400 });
  }

  // Only the few functions the site's own pages call. Everything else (marking an order paid,
  // for one) is reachable from server code only.
  const caller = await resolveCaller(req);
  if (!mayCallRpc(caller, fn.toLowerCase())) {
    return NextResponse.json({ message: "Not allowed" }, { status: caller.kind === "anon" ? 401 : 403 });
  }

  const args = (await req.json().catch(() => ({}))) as Record<string, any>;
  const client = createClient();
  const { data, error } = await client.rpc(fn, args);
  if (error) {
    return NextResponse.json(
      { message: error.message, code: "PGRST202" },
      { status: 400 }
    );
  }
  return NextResponse.json(data);
}

export const POST = guardRpc(postUnguarded);
