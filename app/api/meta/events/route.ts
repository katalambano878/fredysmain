import { NextRequest, NextResponse } from 'next/server';
import { sendMetaCapiEvent, isMetaCapiConfigured } from '@/lib/meta-capi';

const ALLOWED_EVENTS = new Set([
  'PageView',
  'ViewContent',
  'AddToCart',
  'InitiateCheckout',
  'Purchase',
  'Lead',
  'CompleteRegistration',
  'Search',
]);

/**
 * Browser → Conversions API mirror (same event_id as Pixel for dedupe).
 */
export async function POST(request: NextRequest) {
  if (!isMetaCapiConfigured()) {
    return NextResponse.json({ ok: false, skipped: true }, { status: 200 });
  }

  try {
    const body = await request.json();
    const eventName = String(body.eventName || '');
    const eventId = String(body.eventId || '');

    if (!ALLOWED_EVENTS.has(eventName) || !eventId) {
      return NextResponse.json({ error: 'Invalid event' }, { status: 400 });
    }

    const customData =
      body.customData && typeof body.customData === 'object' ? body.customData : {};
    const eventSourceUrl =
      typeof body.eventSourceUrl === 'string' ? body.eventSourceUrl.slice(0, 2048) : undefined;

    const forwarded = request.headers.get('x-forwarded-for');
    const clientIp =
      (forwarded ? forwarded.split(',')[0]?.trim() : null) ||
      request.headers.get('x-real-ip') ||
      null;
    const userAgent = request.headers.get('user-agent');

    await sendMetaCapiEvent({
      eventName,
      eventId,
      eventSourceUrl,
      userData: {
        fbp: typeof body.fbp === 'string' ? body.fbp : null,
        fbc: typeof body.fbc === 'string' ? body.fbc : null,
        clientIpAddress: clientIp,
        clientUserAgent: userAgent,
        email: typeof body.email === 'string' ? body.email : null,
        phone: typeof body.phone === 'string' ? body.phone : null,
      },
      customData,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('[Meta events API]', e?.message || e);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
