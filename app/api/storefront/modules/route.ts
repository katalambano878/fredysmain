import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isPlainPostgres } from '@/lib/db/mode';

/**
 * GET /api/storefront/modules
 *
 * Public, read-only endpoint exposing a safe subset of store feature flags
 * for the storefront (e.g. maintenance mode, AI chat).
 */
export async function GET() {
  if (!isPlainPostgres() && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: 'Server misconfiguration' },
      { status: 503 },
    );
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('store_modules')
      .select('id, enabled')
      .in('id', ['ai-chat', 'maintenance-mode']);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data ?? []);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Failed to load modules' },
      { status: 500 },
    );
  }
}

