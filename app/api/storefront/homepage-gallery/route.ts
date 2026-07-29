import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isPlainPostgres } from '@/lib/db/mode';

export const dynamic = 'force-dynamic';

/** Public: active lookbook images for the homepage */
export async function GET() {
  if (!isPlainPostgres() && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 503 });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('homepage_gallery')
      .select('id, title, caption, image_url, sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ items: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to load gallery' }, { status: 500 });
  }
}
