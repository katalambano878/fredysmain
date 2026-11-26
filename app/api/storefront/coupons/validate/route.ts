import { NextResponse } from 'next/server';
import { priceCoupon } from '@/lib/coupons';
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * POST /api/storefront/coupons/validate  { code, subtotal, email? }
 * A preview for the cart and checkout. The order itself is priced again on the server.
 */
export async function POST(request: Request) {
  const limit = checkRateLimit(`coupon:${getClientIdentifier(request)}`, RATE_LIMITS.payment);
  if (!limit.success) {
    return NextResponse.json(
      { ok: false, message: 'Too many tries. Wait a minute and try again.' },
      { status: 429, headers: NO_STORE }
    );
  }

  const body = await request.json().catch(() => null);
  const subtotal = Number(body?.subtotal);
  if (!Number.isFinite(subtotal) || subtotal <= 0) {
    return NextResponse.json({ ok: false, message: 'Your cart is empty.' }, { status: 400, headers: NO_STORE });
  }

  try {
    const outcome = await priceCoupon(body?.code, subtotal, typeof body?.email === 'string' ? body.email : null);
    return NextResponse.json(outcome, { headers: NO_STORE });
  } catch (err) {
    console.error('[coupons/validate] failed:', err);
    return NextResponse.json(
      { ok: false, message: 'We could not check that coupon. Please try again.' },
      { status: 500, headers: NO_STORE }
    );
  }
}
