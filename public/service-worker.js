// Freby's Fashion GH — network-first pages; no HTML shell cache (playbook §16)
const CACHE_VERSION = 'sw-v2.6';
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const IMAGE_CACHE = `images-${CACHE_VERSION}`;
const API_CACHE = `api-${CACHE_VERSION}`;

// Pre-cache only offline shell + tiny static assets (never HTML routes)
const STATIC_ASSETS = [
  '/offline',
  '/frebys-logo.png',
  '/manifest.json',
];

const IMAGE_CACHE_LIMIT = 80;
const API_CACHE_LIMIT = 30;

async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxItems) {
    await cache.delete(keys[0]);
    return trimCache(cacheName, maxItems);
  }
}

self.addEventListener('install', (event) => {
  console.log('[SW] Installing', CACHE_VERSION);
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) =>
        cache.addAll(STATIC_ASSETS).catch((err) => {
          console.warn('[SW] Some assets failed to cache:', err);
        })
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating', CACHE_VERSION);
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key !== STATIC_CACHE && key !== IMAGE_CACHE && key !== API_CACHE
            )
            .map((key) => {
              console.log('[SW] Removing old cache:', key);
              return caches.delete(key);
            })
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  // Never intercept payment / auth mutations
  if (url.pathname.startsWith('/api/payment')) return;
  if (url.pathname.startsWith('/api/notifications')) return;
  if (url.pathname.startsWith('/api/auth')) return;
  if (url.pathname.startsWith('/api/orders')) return;
  if (url.pathname.startsWith('/api/addresses')) return;
  if (url.pathname.startsWith('/api/newsletter')) return;
  if (url.pathname.startsWith('/auth/v1')) return;
  if (url.pathname.startsWith('/rest/v1')) return;

  // Admin: network only
  if (url.pathname.startsWith('/admin')) {
    if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
      event.respondWith(
        fetch(request).catch(() => {
          const html =
            '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Admin – Connection required</title><style>body{font-family:system-ui,sans-serif;margin:0;min-height:100vh;display:flex;align-items:center;justify-center;background:#f3f4f6}.box{text-align:center;max-width:24rem;padding:2rem}h1{font-size:1.5rem;color:#064e3b;margin-bottom:.5rem}p{color:#6b7280;margin-bottom:1.5rem}a{display:inline-block;background:#064e3b;color:#fff;padding:.75rem 1.5rem;border-radius:.5rem;text-decoration:none;font-weight:600}</style></head><body><div class="box"><h1>Connection required</h1><p>Admin needs an internet connection.</p><a href="/admin">Try again</a></div></body></html>';
          return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        })
      );
      return;
    }
    return;
  }

  // Product / CMS images on disk: network only (never poison with SVG fallback)
  if (url.pathname.startsWith('/uploads/') || url.pathname.startsWith('/storage/')) {
    event.respondWith(fetch(request));
    return;
  }

  // HTML / navigations / Next data: network only → offline shell
  if (
    request.mode === 'navigate' ||
    request.headers.get('accept')?.includes('text/html') ||
    url.pathname.startsWith('/_next/data')
  ) {
    event.respondWith(fetch(request).catch(() => caches.match('/offline')));
    return;
  }

  // Storefront API: network-only (stale API cache caused empty/janky shop after deploys)
  if (url.pathname.startsWith('/api/storefront') || url.pathname.startsWith('/api/orders')) {
    event.respondWith(
      fetch(request).catch(
        () =>
          new Response(JSON.stringify({ error: 'Offline' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          })
      )
    );
    return;
  }

  // Hashed static assets: cache-first (never cache HTML as JS/CSS)
  if (
    url.pathname.startsWith('/_next/static') ||
    url.pathname.match(/\.(js|css|woff2?|ttf|eot)$/) ||
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com' ||
    url.hostname === 'cdn.jsdelivr.net'
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          const ct = cached.headers.get('Content-Type') || '';
          if (!ct.includes('text/html')) return cached;
        }
        return fetch(request).then((response) => {
          const ct = response.headers.get('Content-Type') || '';
          const isAsset =
            response.ok &&
            (ct.includes('text/css') ||
              ct.includes('javascript') ||
              ct.includes('font') ||
              ct.includes('woff') ||
              url.pathname.startsWith('/_next/static'));
          if (isAsset) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Public static images (icons, heroes in /public): cache-first, no SVG poison
  if (
    request.destination === 'image' ||
    url.pathname.match(/\.(png|jpg|jpeg|gif|webp|svg|ico)$/)
  ) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          if (cached) return cached;
          return fetch(request).then((response) => {
            if (response.ok) {
              cache.put(request, response.clone());
              trimCache(IMAGE_CACHE, IMAGE_CACHE_LIMIT);
            }
            return response;
          });
        })
      )
    );
    return;
  }

  // Default: network only
  event.respondWith(fetch(request));
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const options = {
    body: data.body || "New update from Freby's Fashion GH",
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/',
      dateOfArrival: Date.now(),
    },
    actions: [
      { action: 'open', title: 'Open' },
      { action: 'close', title: 'Dismiss' },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(data.title || "Freby's Fashion GH", options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'close') return;

  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
