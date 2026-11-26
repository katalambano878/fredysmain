import { query } from '@/lib/db/pool';

/**
 * Is this gateway reference one that this shop created for this order?
 *
 * A payment may only settle the order it was started for. The checks used to accept any
 * reference that merely began with the order number, so one real payment could be replayed
 * to mark a second order paid.
 */
export async function referenceBelongsToOrder(
  reference: string,
  order: { id: string; order_number: string }
): Promise<boolean> {
  const ref = String(reference || '').trim();
  if (!ref) return false;
  if (ref === order.order_number) return true;

  // The record written by this server when the payment was started is the authority.
  try {
    const { rows } = await query<{ order_id: string }>(
      'SELECT order_id FROM payment_attempts WHERE internal_reference = $1 LIMIT 1',
      [ref]
    );
    if (rows[0]) return String(rows[0].order_id) === String(order.id);
  } catch {
    /* table not available: fall through to the shape check */
  }

  // No record (older payments): accept only "<order number>-<r|b|d><stamp>", nothing in between.
  const prefix = `${order.order_number}-`;
  if (!ref.startsWith(prefix)) return false;
  return /^[rbd][a-z0-9]{4,}$/i.test(ref.slice(prefix.length));
}
