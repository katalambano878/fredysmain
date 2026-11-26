import { NextResponse } from 'next/server';
import { denyUnlessPermission } from '@/lib/admin-route-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * PUT /api/admin/products/[id]/images
 * Body: { images: Array<{ url: string, position: number, alt_text?: string, media_type?: string }>, productName: string }
 * Replaces all product_images for the product. Uses service role so it always succeeds for admins.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const err = await denyUnlessPermission(request, ['products']);
  if (err) return err;

  const { id: productId } = await params;
  if (!productId) {
    return NextResponse.json({ error: 'Missing product id' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const images = Array.isArray(body?.images) ? body.images : [];
    const productName = typeof body?.productName === 'string' ? body.productName : '';

    await supabaseAdmin.from('product_images').delete().eq('product_id', productId);

    if (images.length > 0) {
      const rows = images.map((img: any, idx: number) => ({
        product_id: productId,
        url: typeof img.url === 'string' ? img.url : '',
        position: Number(img.position) ?? idx,
        alt_text: productName || (typeof img.alt_text === 'string' ? img.alt_text : null),
        media_type: img.media_type === 'video' ? 'video' : 'image',
      })).filter((r: any) => r.url);

      if (rows.length > 0) {
        const { error } = await supabaseAdmin.from('product_images').insert(rows);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to save images' }, { status: 500 });
  }
}
