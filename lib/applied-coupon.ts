'use client';

/** The coupon code a shopper applied in the cart, remembered until the order is placed. */
const KEY = 'frebys_coupon_code';

export type CouponPreview = {
  code: string;
  discount: number;
  type: 'percentage' | 'fixed_amount';
  value: number;
};

export function readAppliedCouponCode(): string {
  try {
    return localStorage.getItem(KEY) || '';
  } catch {
    return '';
  }
}

export function writeAppliedCouponCode(code: string | null) {
  try {
    if (code) localStorage.setItem(KEY, code);
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode */
  }
}

/** Ask the server what a code takes off this subtotal. Never trusts a discount worked out in the browser. */
export async function previewCoupon(
  code: string,
  subtotal: number,
  email?: string
): Promise<{ ok: true; coupon: CouponPreview } | { ok: false; message: string }> {
  try {
    const res = await fetch('/api/storefront/coupons/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ code, subtotal, email }),
    });
    const json = await res.json().catch(() => null);
    if (json?.ok) {
      return { ok: true, coupon: { code: json.code, discount: Number(json.discount) || 0, type: json.type, value: Number(json.value) || 0 } };
    }
    return { ok: false, message: json?.message || 'We could not check that coupon. Please try again.' };
  } catch {
    return { ok: false, message: 'We could not check that coupon. Check your connection and try again.' };
  }
}
