import { NextResponse } from 'next/server';
import { denyUnlessPermission } from '@/lib/admin-route-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { compressImageBuffer } from '@/lib/image-compress';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Reject absurd payloads early (Android camera originals can be large). */
const MAX_UPLOAD_BYTES = 40 * 1024 * 1024;

/**
 * POST /api/admin/upload
 * Body: multipart/form-data with field "file" (and optional "bucket", default "product-images").
 * Returns { url: string } public URL. Compresses images before storage.
 */
export async function POST(request: Request) {
  const err = await denyUnlessPermission(request, ['products', 'categories']);
  if (err) return err;

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const ALLOWED_BUCKETS = new Set([
      'product-images', 'category-images', 'avatars', 'blog-covers',
      'blog-images', 'cms-images', 'banners', 'review-images', 'site-media',
    ]);
    const rawBucket = (formData.get('bucket') as string) || 'product-images';
    const bucket = ALLOWED_BUCKETS.has(rawBucket) ? rawBucket : 'product-images';

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 });
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `File too large (max ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))}MB). Try a smaller photo.` },
        { status: 413 }
      );
    }

    const originalExt = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const inputBuf = Buffer.from(await file.arrayBuffer());
    let inputType = file.type || `image/${originalExt === 'jpg' ? 'jpeg' : originalExt}`;
    // Android/iOS often send HEIC with empty or generic type
    if (
      (!file.type || file.type === 'application/octet-stream') &&
      (originalExt === 'heic' || originalExt === 'heif')
    ) {
      inputType = 'image/heic';
    }

    const compressed = await compressImageBuffer(inputBuf, inputType);
    const ext = compressed.ext || (compressed.contentType.includes('webp') ? 'webp' : originalExt);
    const path = `cat-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error } = await supabaseAdmin.storage.from(bucket).upload(path, compressed.buffer, {
      cacheControl: '31536000',
      upsert: false,
      contentType: compressed.contentType,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: { publicUrl } } = supabaseAdmin.storage.from(bucket).getPublicUrl(path);
    return NextResponse.json({
      url: publicUrl,
      bytes: compressed.buffer.length,
      contentType: compressed.contentType,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Upload failed' }, { status: 500 });
  }
}
