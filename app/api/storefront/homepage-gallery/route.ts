import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isPlainPostgres } from '@/lib/db/mode';
import { normalizeStorageUrl } from '@/lib/storage-url';

export const dynamic = 'force-dynamic';

/** Public: active lookbook images for the homepage */
export async function GET(request: Request) {
  if (!isPlainPostgres() && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 503 });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('homepage_gallery')
      .select('id, title, caption, image_url, sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Storefront gallery] Query failed:', error);
      return NextResponse.json({ error: 'Failed to load gallery' }, { status: 500 });
    }

    const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
    const items = (data ?? [])
      .filter((item: any) => typeof item.image_url === 'string' && item.image_url.trim())
      .map((item: any) => ({ ...item, image_url: normalizeStorageUrl(item.image_url, origin) }));

    return NextResponse.json({ items });
  } catch (e: any) {
    console.error('[Storefront gallery] Unexpected error:', e);
    return NextResponse.json({ error: 'Failed to load gallery' }, { status: 500 });
  }
}
