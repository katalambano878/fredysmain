import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isPlainPostgres } from '@/lib/db/mode';

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
 * DELETE /api/admin/categories/[id]
 * Unlinks products from this category (sets category_id to null), then deletes the category.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const err = await requireAdmin(request);
  if (err) return err;

  const { id: categoryId } = await params;
  if (!categoryId) {
    return NextResponse.json({ error: 'Missing category id' }, { status: 400 });
  }

  try {
    // Check first, change nothing if it cannot be deleted. A category that still has
    // sub-categories cannot be removed, and products must not be un-filed for a delete that then fails.
    const { data: children, error: childError } = await supabaseAdmin
      .from('categories')
      .select('id, name')
      .eq('parent_id', categoryId)
      .limit(5);
    if (childError) {
      return NextResponse.json({ error: childError.message }, { status: 500 });
    }
    if (children && children.length > 0) {
      const names = children.map((c: any) => c.name).join(', ');
      return NextResponse.json(
        {
          error: `This category has sub-categories (${names}). Move or delete those first, then delete this one. Nothing was changed.`,
        },
        { status: 409 }
      );
    }

    const { data: filed, error: filedError } = await supabaseAdmin
      .from('products')
      .select('id')
      .eq('category_id', categoryId);
    if (filedError) {
      return NextResponse.json({ error: filedError.message }, { status: 500 });
    }
    const productIds: string[] = (filed || []).map((p: any) => p.id);

    const { error: unlinkError } = await supabaseAdmin
      .from('products')
      .update({ category_id: null })
      .eq('category_id', categoryId);
    if (unlinkError) {
      return NextResponse.json({ error: unlinkError.message }, { status: 500 });
    }

    const { error } = await supabaseAdmin.from('categories').delete().eq('id', categoryId);
    if (error) {
      // Put the products back where they were.
      for (let i = 0; i < productIds.length; i += 200) {
        await supabaseAdmin.from('products').update({ category_id: categoryId }).in('id', productIds.slice(i, i + 200));
      }
      return NextResponse.json({ error: `The category was not deleted: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to delete category' }, { status: 500 });
  }
}
