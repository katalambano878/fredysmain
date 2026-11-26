import { NextResponse } from 'next/server';
import { denyUnlessPermission } from '@/lib/admin-route-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * DELETE /api/admin/categories/[id]
 * Unlinks products from this category (sets category_id to null), then deletes the category.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const err = await denyUnlessPermission(request, ['categories']);
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
