'use client';

export type MetaPixelCustomData = {
  content_ids?: string[];
  content_type?: string;
  content_name?: string;
  content_category?: string;
  contents?: Array<{ id: string; quantity: number; item_price?: number }>;
  currency?: string;
  value?: number;
  num_items?: number;
  order_id?: string;
};

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    _fbq?: unknown;
  }
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function getMetaCookies(): { fbp: string | null; fbc: string | null } {
  return {
    fbp: readCookie('_fbp'),
    fbc: readCookie('_fbc'),
  };
}

export function newMetaEventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function isMetaPixelEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_META_PIXEL_ID);
}

/**
 * Fire a standard Meta Pixel event + mirror to Conversions API (same event_id).
 */
export function trackMetaEvent(
  eventName: string,
  customData: MetaPixelCustomData = {},
  options?: { eventId?: string; eventSourceUrl?: string; sendToCapi?: boolean }
): string {
  const eventId = options?.eventId || newMetaEventId();
  if (!isMetaPixelEnabled()) return eventId;

  const payload = {
    currency: 'GHS',
    ...customData,
  };

  try {
    if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
      window.fbq('track', eventName, payload, { eventID: eventId });
    }
  } catch {
    /* ignore pixel errors */
  }

  if (options?.sendToCapi === false) return eventId;

  try {
    const { fbp, fbc } = getMetaCookies();
    const body = JSON.stringify({
      eventName,
      eventId,
      eventSourceUrl: options?.eventSourceUrl || (typeof window !== 'undefined' ? window.location.href : undefined),
      customData: payload,
      fbp,
      fbc,
    });

    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon('/api/meta/events', blob);
    } else {
      void fetch('/api/meta/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    /* ignore CAPI mirror errors */
  }

  return eventId;
}

export function trackViewContent(params: {
  id: string;
  name: string;
  price: number;
  category?: string;
}) {
  return trackMetaEvent('ViewContent', {
    content_ids: [params.id],
    content_type: 'product',
    content_name: params.name,
    content_category: params.category,
    value: params.price,
    currency: 'GHS',
  });
}

export function trackAddToCart(params: {
  id: string;
  name: string;
  price: number;
  quantity: number;
}) {
  return trackMetaEvent('AddToCart', {
    content_ids: [params.id],
    content_type: 'product',
    content_name: params.name,
    contents: [{ id: params.id, quantity: params.quantity, item_price: params.price }],
    value: params.price * params.quantity,
    currency: 'GHS',
    num_items: params.quantity,
  });
}

export function trackInitiateCheckout(params: {
  contentIds: string[];
  value: number;
  numItems: number;
}) {
  return trackMetaEvent('InitiateCheckout', {
    content_ids: params.contentIds,
    content_type: 'product',
    value: params.value,
    currency: 'GHS',
    num_items: params.numItems,
  });
}

export function trackPurchase(params: {
  orderId: string;
  value: number;
  contentIds: string[];
  contents?: Array<{ id: string; quantity: number; item_price?: number }>;
  numItems?: number;
}) {
  return trackMetaEvent(
    'Purchase',
    {
      content_ids: params.contentIds,
      content_type: 'product',
      contents: params.contents,
      value: params.value,
      currency: 'GHS',
      num_items: params.numItems,
      order_id: params.orderId,
    },
    {
      // Must match server CAPI event_id for deduplication
      eventId: `purchase_${params.orderId}`,
      // Browser already fires; server CAPI is authoritative for Purchase
      sendToCapi: false,
    }
  );
}
