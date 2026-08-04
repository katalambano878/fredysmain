import { createHash } from 'crypto';

export type MetaContentItem = {
  id: string;
  quantity: number;
  item_price?: number;
};

export type MetaUserData = {
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  clientIpAddress?: string | null;
  clientUserAgent?: string | null;
  externalId?: string | null;
};

export type MetaCapiEventInput = {
  eventName: string;
  eventId: string;
  eventSourceUrl?: string;
  eventTime?: number;
  actionSource?: 'website' | 'other';
  customData?: Record<string, unknown>;
  userData?: MetaUserData;
};

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Ghana-friendly phone normalize → digits with country code when possible. */
export function normalizePhoneForMeta(phone: string): string {
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length === 10) {
    digits = `233${digits.slice(1)}`;
  } else if (digits.startsWith('2330') && digits.length === 13) {
    digits = `233${digits.slice(4)}`;
  }
  return digits;
}

function hashIfPresent(value: string | null | undefined, normalizer?: (v: string) => string): string | undefined {
  if (!value || !String(value).trim()) return undefined;
  const normalized = normalizer ? normalizer(String(value)) : String(value).trim().toLowerCase();
  if (!normalized) return undefined;
  return sha256(normalized);
}

function buildUserData(user?: MetaUserData) {
  if (!user) return {};

  const out: Record<string, unknown> = {};
  const em = hashIfPresent(user.email, normalizeEmail);
  if (em) out.em = [em];

  const ph = hashIfPresent(user.phone, normalizePhoneForMeta);
  if (ph) out.ph = [ph];

  const fn = hashIfPresent(user.firstName);
  if (fn) out.fn = [fn];

  const ln = hashIfPresent(user.lastName);
  if (ln) out.ln = [ln];

  const ct = hashIfPresent(user.city);
  if (ct) out.ct = [ct];

  const st = hashIfPresent(user.state);
  if (st) out.st = [st];

  const country = hashIfPresent(user.country || 'gh');
  if (country) out.country = [country];

  if (user.fbp) out.fbp = user.fbp;
  if (user.fbc) out.fbc = user.fbc;
  if (user.clientIpAddress) out.client_ip_address = user.clientIpAddress;
  if (user.clientUserAgent) out.client_user_agent = user.clientUserAgent;

  const externalId = hashIfPresent(user.externalId);
  if (externalId) out.external_id = [externalId];

  return out;
}

export function isMetaCapiConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_META_PIXEL_ID && process.env.META_CAPI_ACCESS_TOKEN);
}

export function purchaseEventId(orderNumber: string): string {
  return `purchase_${orderNumber}`;
}

/**
 * Send one or more events to Meta Conversions API.
 * Failures are logged and never thrown — ads tracking must not break checkout.
 */
export async function sendMetaCapiEvents(events: MetaCapiEventInput[]): Promise<{ ok: boolean; status?: number }> {
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const accessToken = process.env.META_CAPI_ACCESS_TOKEN;
  if (!pixelId || !accessToken || events.length === 0) {
    return { ok: false };
  }

  const testCode = process.env.META_CAPI_TEST_EVENT_CODE;
  const payload = {
    data: events.map((event) => ({
      event_name: event.eventName,
      event_time: event.eventTime || Math.floor(Date.now() / 1000),
      event_id: event.eventId,
      event_source_url: event.eventSourceUrl,
      action_source: event.actionSource || 'website',
      user_data: buildUserData(event.userData),
      custom_data: event.customData || {},
    })),
    ...(testCode ? { test_event_code: testCode } : {}),
  };

  try {
    const url = `https://graph.facebook.com/v21.0/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('[Meta CAPI] Error:', res.status, body);
      return { ok: false, status: res.status };
    }
    return { ok: true, status: res.status };
  } catch (e: any) {
    console.error('[Meta CAPI] Request failed:', e?.message || e);
    return { ok: false };
  }
}

export async function sendMetaCapiEvent(event: MetaCapiEventInput) {
  return sendMetaCapiEvents([event]);
}

type OrderLike = {
  id?: string;
  order_number?: string;
  email?: string | null;
  phone?: string | null;
  total?: number | string | null;
  shipping_address?: any;
  metadata?: any;
  order_items?: Array<{
    product_id?: string;
    product_name?: string;
    quantity?: number;
    unit_price?: number;
    price?: number;
  }>;
};

/**
 * Server-side Purchase event after payment confirmation.
 * Uses stable event_id so browser Pixel Purchase dedupes with CAPI.
 */
export async function trackMetaPurchaseServer(
  order: OrderLike,
  extras?: {
    fbp?: string | null;
    fbc?: string | null;
    clientIpAddress?: string | null;
    clientUserAgent?: string | null;
    eventSourceUrl?: string;
  }
) {
  if (!isMetaCapiConfigured()) return { ok: false as const, skipped: true as const };

  const orderNumber = String(order.order_number || order.id || '').trim();
  if (!orderNumber) return { ok: false as const, skipped: true as const };

  const shipping = order.shipping_address || {};
  const meta = order.metadata || {};
  const phone = order.phone || shipping.phone || meta.phone || null;
  const firstName = shipping.firstName || shipping.first_name || meta.first_name || null;
  const lastName = shipping.lastName || shipping.last_name || meta.last_name || null;
  const city = shipping.city || null;
  const state = shipping.region || shipping.state || null;

  const items = Array.isArray(order.order_items) ? order.order_items : [];
  const contentIds = items
    .map((i) => i.product_id)
    .filter((id): id is string => Boolean(id));
  const contents: MetaContentItem[] = items
    .filter((i) => i.product_id)
    .map((i) => ({
      id: String(i.product_id),
      quantity: Number(i.quantity) || 1,
      item_price: Number(i.unit_price ?? i.price) || undefined,
    }));

  const value = Number(order.total) || 0;
  const siteUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.frebysfashion.com').replace(/\/+$/, '');

  return sendMetaCapiEvent({
    eventName: 'Purchase',
    eventId: purchaseEventId(orderNumber),
    eventSourceUrl: extras?.eventSourceUrl || `${siteUrl}/order-success?order=${encodeURIComponent(orderNumber)}`,
    userData: {
      email: order.email,
      phone,
      firstName,
      lastName,
      city,
      state,
      country: 'gh',
      fbp: extras?.fbp,
      fbc: extras?.fbc,
      clientIpAddress: extras?.clientIpAddress,
      clientUserAgent: extras?.clientUserAgent,
      externalId: order.email || orderNumber,
    },
    customData: {
      currency: 'GHS',
      value,
      content_type: 'product',
      content_ids: contentIds.length ? contentIds : undefined,
      contents: contents.length ? contents : undefined,
      num_items: contents.reduce((sum, c) => sum + c.quantity, 0) || undefined,
      order_id: orderNumber,
    },
  });
}
