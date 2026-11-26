/**
 * How much an order still has to pay.
 *
 * Normally that is the order total. A preorder with a deposit already taken (recorded by
 * staff as `metadata.deposit_paid` with `metadata.balance_due`) owes only the balance.
 * The pay link, the payment start and every "did they pay the right amount" check use this,
 * so a customer who paid a deposit is no longer asked for the full price again.
 *
 * No imports: used on the server and in the browser.
 */
type OrderLike = { total?: number | string | null; metadata?: unknown };

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function depositPaid(order: OrderLike): number {
  const meta = (order.metadata || {}) as Record<string, unknown>;
  const total = Number(order.total) || 0;
  const balance = Number(meta.balance_due);
  if (meta.deposit_paid !== true || !Number.isFinite(balance)) return 0;
  if (!(balance > 0) || !(balance < total)) return 0;
  return round2(total - balance);
}

export function amountDue(order: OrderLike): number {
  const total = Number(order.total) || 0;
  return round2(total - depositPaid(order));
}
