import { NextRequest, NextResponse } from 'next/server';
import { denyUnlessPermission, requireAdminSession } from '@/lib/admin-route-auth';
import { confirmSmsCheckout, getSmsBilling, startSmsCheckout, taysendConfigured } from '@/lib/taysend-billing';

export const dynamic = 'force-dynamic';

const PACKAGE_ID = /^[a-z0-9-]{1,40}$/;
const PAYMENT_ID = /^pay_[A-Za-z0-9]+$/;

export async function GET(request: NextRequest) {
  // The balance feeds the red "SMS credit is empty" bar on every admin screen, so any signed-in
  // admin or staff member may read it.
  const denied = await requireAdminSession(request);
  if (denied) return denied;
  if (!taysendConfigured()) {
    return NextResponse.json({ configured: false });
  }

  try {
    const billing = await getSmsBilling();
    const checkoutId = request.nextUrl.searchParams.get('checkout') || '';
    const checkout = PAYMENT_ID.test(checkoutId) ? await confirmSmsCheckout(checkoutId) : null;
    return NextResponse.json({ configured: true, ...billing, checkout });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not load SMS packages.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  const denied = await denyUnlessPermission(request, ['sms_credit']);
  if (denied) return denied;
  if (!taysendConfigured()) {
    return NextResponse.json({ error: 'SMS buying is not connected on this store yet.' }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const packageId = typeof body?.package_id === 'string' ? body.package_id : '';
  if (!PACKAGE_ID.test(packageId)) {
    return NextResponse.json({ error: 'Choose a package from the list.' }, { status: 400 });
  }

  try {
    const checkout = await startSmsCheckout(packageId);
    return NextResponse.json(checkout);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not start payment.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
