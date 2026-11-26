import { supabaseAdmin } from '@/lib/supabase-admin';
import { isPlainPostgres } from '@/lib/db/mode';
import { query } from '@/lib/db/pool';

/**
 * Add keys to an order's metadata without touching the keys already there.
 *
 * Several places used to write a whole new metadata object, which erased payment
 * references, the "stock already reduced" flag and preorder deposits recorded earlier.
 * `set` may also change `payment_status` in the same statement.
 */
export async function mergeOrderMetadata(
  where: { id?: string; orderNumber?: string },
  patch: Record<string, unknown>,
  set: { payment_status?: string; onlyIfNotPaid?: boolean } = {}
): Promise<{ error: string | null }> {
  const column = where.id ? 'id' : 'order_number';
  const value = where.id || where.orderNumber;
  if (!value) return { error: 'No order given' };

  try {
    if (isPlainPostgres()) {
      const params: unknown[] = [JSON.stringify(patch), value];
      let sql = `UPDATE orders SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb, updated_at = now()`;
      if (set.payment_status) {
        params.push(set.payment_status);
        sql += `, payment_status = $${params.length}`;
      }
      sql += ` WHERE ${column} = $2`;
      if (set.onlyIfNotPaid) sql += ` AND payment_status IS DISTINCT FROM 'paid'`;
      await query(sql, params);
      return { error: null };
    }

    // Hosted mode: read, merge, write.
    const { data: order, error: readError } = await supabaseAdmin
      .from('orders')
      .select('id, payment_status, metadata')
      .eq(column, value)
      .maybeSingle();
    if (readError || !order) return { error: readError?.message || 'Order not found' };
    if (set.onlyIfNotPaid && order.payment_status === 'paid') return { error: null };
    const { error } = await supabaseAdmin
      .from('orders')
      .update({
        metadata: { ...(order.metadata || {}), ...patch },
        ...(set.payment_status ? { payment_status: set.payment_status } : {}),
      })
      .eq('id', order.id);
    return { error: error?.message || null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Update failed' };
  }
}
