import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { compressImageBuffer } from '@/lib/image-compress';
import { isPlainPostgres } from '@/lib/db/mode';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Reject absurd payloads early (Android camera originals can be large). */
const MAX_UPLOAD_BYTES = 40 * 1024 * 1024;

function getAccessToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7).trim();
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(/\bsb-access-token=([^;]+)/);
  if (match) return decodeURIComponent(match[1].trim());
  const authCookie = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('sb-') && (c.includes('-auth-token') || c.includes('auth')));
  if (!authCookie) return null;
  const value = authCookie.split('=').slice(1).join('=').trim();
  const decoded = decodeURIComponent(value);
  try {
    const parsed = JSON.parse(decoded);
    if (Array.isArray(parsed) && parsed[0]) return parsed[0];
    if (parsed?.access_token) return parsed.access_token;
    if (typeof parsed === 'string') return parsed;
  } catch {
    return decoded;
  }
  return null;
}

async function requireAdmin(request: Request): Promise<NextResponse | null> {
  if (!isPlainPostgres() && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 503 });
  }
  const token = getAccessToken(request);
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  const role = profile?.role != null ? String(profile.role) : '';
  if (role !== 'admin' && role !== 'staff') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

/**
 * POST /api/admin/upload
 * Body: multipart/form-data with field "file" (and optional "bucket", default "product-images").
 * Returns { url: string } public URL. Compresses images before storage.
 */
export async function POST(request: Request) {
  const err = await requireAdmin(request);
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
