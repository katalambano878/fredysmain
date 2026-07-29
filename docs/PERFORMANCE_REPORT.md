# PERFORMANCE REPORT — Frebys

## Baseline (pre Jul 2026 hardening)

| Area | Finding |
|------|---------|
| Product images | Storage ~1.1 GB; many 4MB+ photos |
| Shop grid | 1-col mobile cards; remount/freeze when `categories` in fetch deps |
| Homepage | `AnimatedGrid` staggered setState jank |
| SW | Precached HTML routes → white screens after deploy |
| Next Image | `unoptimized: true` (Coolify sharp/cache) |

## Fixes applied

| Fix | Result |
|-----|--------|
| ImageMagick batch compress | Storage **~1.1 GB → ~159 MB** |
| `lib/image-compress.ts` on upload | New uploads shrunk before disk write |
| Compact `ProductCard` + `grid-cols-2` mobile | Smaller viewport cost; 2×2 mobile |
| Shop fetch: categories via ref; skeleton only when empty | Reduced freeze/remount |
| Plain product grid (no AnimatedGrid) | Less main-thread churn |
| SW `sw-v2.5` network-only HTML + `/storage` | Fewer stale-shell white screens |
| Infinite scroll `rootMargin` 240px | Less aggressive prefetch |

## Remaining recommendations

1. Re-enable Next image optimization once Coolify Dockerfile + sharp cache ownership is proven.
2. Route chat checkout through server-priced `/api/orders/create`.
3. Add DB indexes if slow: `orders(order_number)`, `orders(email)`, `orders(payment_status, created_at)`, `product_images(product_id)`.
4. Consider CDN in front of `/storage/v1/object/public`.
