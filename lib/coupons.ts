import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * Coupon codes created on the admin Coupons screen.
 *
 * The discount is always worked out here, on the server, from the coupon row and the
 * server-priced subtotal. The browser only ever sends the code.
 */

export type CouponOutcome =
  | { ok: true; code: string; type: 'percentage' | 'fixed_amount'; value: number; discount: number; description: string | null }
  | { ok: false; message: string };

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** The smallest amount an order may come to after a coupon, so there is always something to pay. */
const MIN_ORDER_TOTAL = 1;

export function normalizeCouponCode(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 40);
}

async function paidUses(code: string, email?: string | null): Promise<number> {
  let query = supabaseAdmin
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('payment_status', 'paid')
    .contains('metadata', { coupon_code: code });
  if (email) query = query.eq('email', email);
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count || 0;
}

/**
 * Check a code against an order subtotal and say what it takes off.
 * `email` (when known) enforces the per-customer limit.
 */
export async function priceCoupon(rawCode: unknown, subtotal: number, email?: string | null): Promise<CouponOutcome> {
  const code = normalizeCouponCode(rawCode);
  if (!code) return { ok: false, message: 'Enter a coupon code.' };

  const { data: rows, error } = await supabaseAdmin.from('coupons').select('*').ilike('code', code).limit(5);
  if (error) throw new Error(error.message);
  const coupon = (rows || []).find((c: any) => normalizeCouponCode(c.code) === code);
  if (!coupon || coupon.is_active === false) return { ok: false, message: 'That coupon code is not valid.' };

  const now = Date.now();
  if (coupon.start_date && new Date(coupon.start_date).getTime() > now) {
    return { ok: false, message: 'That coupon is not active yet.' };
  }
  if (coupon.end_date && new Date(coupon.end_date).getTime() < now) {
    return { ok: false, message: 'That coupon has expired.' };
  }

  const minimum = Number(coupon.minimum_purchase) || 0;
  if (minimum > 0 && subtotal < minimum) {
    return { ok: false, message: `This coupon needs an order of at least GH₵${minimum.toFixed(2)}.` };
  }

  if (coupon.type === 'free_shipping') {
    return { ok: false, message: 'This coupon is for delivery. Delivery is not charged at checkout, so there is nothing to take off.' };
  }
  if (coupon.type !== 'percentage' && coupon.type !== 'fixed_amount') {
    return { ok: false, message: 'That coupon code is not valid.' };
  }

  const usageLimit = Number(coupon.usage_limit) || 0;
  if (usageLimit > 0) {
    const used = await paidUses(code);
    // Keep the number the admin sees in step with what has really been paid for.
    if (used !== (Number(coupon.usage_count) || 0)) {
      await supabaseAdmin.from('coupons').update({ usage_count: used }).eq('id', coupon.id);
    }
    if (used >= usageLimit) return { ok: false, message: 'That coupon has been used up.' };
  }

  const cleanEmail = email ? String(email).trim().toLowerCase() : '';
  const perUser = Number(coupon.per_user_limit) || 0;
  if (perUser > 0 && cleanEmail) {
    const mine = await paidUses(code, cleanEmail);
    if (mine >= perUser) return { ok: false, message: 'You have already used this coupon.' };
  }

  const value = Number(coupon.value) || 0;
  let discount = coupon.type === 'percentage' ? subtotal * (Math.min(100, Math.max(0, value)) / 100) : value;
  const cap = Number(coupon.maximum_discount) || 0;
  if (cap > 0) discount = Math.min(discount, cap);
  discount = round2(Math.max(0, Math.min(discount, subtotal - MIN_ORDER_TOTAL)));
  if (!(discount > 0)) return { ok: false, message: 'That coupon does not take anything off this order.' };

  return {
    ok: true,
    code,
    type: coupon.type,
    value,
    discount,
    description: coupon.description ? String(coupon.description) : null,
  };
}
