# Store Hardening Playbook (reusable)

Use this when bringing another MultiMey / Next.js store to production on **big-vps + Coolify + plain Postgres**.

Distilled from:

| Store | When | Architecture |
|-------|------|----------------|
| **Affordable Perfumes GH** (`affordableperfume`) | Jul 2026 | Supabase-js → app shims + plain PG |
| **Mamator** (`mamator` / `ecrimah/tshirts`) | Jul 2026 | Native `lib/db` + `/api/*` (no Supabase runtime) |
| **Efescloset** (`efes`) | Jul 2026 | Shape A — shimmed Supabase-js → plain PG |
| **Frebys** (`fredysmain`) | Jul 2026 | Shape A — shimmed Supabase-js → plain PG |

Projects differ in schema names, brand copy, and payment providers — follow the **intent**, then adapt the **paths**. Skip sections that do not exist on the target store.

Related docs in this repo:

| Doc | When to use |
|-----|-------------|
| [`SUPABASE_TO_POSTGRES_MIGRATION_GUIDE.md`](./SUPABASE_TO_POSTGRES_MIGRATION_GUIDE.md) | Short project-specific cutover notes + env checklist |

---

## 0. How to use this playbook

1. Clone / open the target store repo.
2. Skim each section. Mark **Apply / Skip / Adapt**.
3. Prefer copying **patterns** (helpers, scripts, aggregation logic) over blind file paste.
4. Deploy only after the verification checklist passes.
5. Never invent secrets; wait for real `.env` / Coolify env / `DATABASE_URL`.

**Staff VPS:**

```bash
ssh big-vps
sudo fleet apps
sudo fleet app <coolify-app-name>
sudo fleet deploy <coolify-app-name>
```

**Always confirm the live image matches the git SHA you expect** (Coolify can queue deploys while an older container keeps serving):

```bash
ssh big-vps "sudo docker ps --format '{{.Names}} {{.Image}} {{.Status}}' | grep <coolify-uuid-prefix>"
# Image tag looks like: <uuid>:<full-git-sha>
git rev-parse HEAD   # compare short SHA
```

Coolify stores encrypted env in its DB — editing only the on-disk container `.env` is not enough for durable changes.

---

## 1. Architecture baseline

### Two common shapes

| Shape | When | Pattern |
|-------|------|---------|
| **A. Shimmed** | App still uses `@supabase/*` clients | Keep `supabase.from` / auth / storage in app code, point at **this app** + plain PG (`lib/db/*`, `/rest/v1`, `/auth/v1`, `/storage/v1`) |
| **B. Native PG** | App already uses `pg` + Next API routes (Mamator) | Skip shims. Harden `/api/*`, `lib/db.ts`, JWT session cookies, disk uploads (`/uploads` or `STORAGE_ROOT`) |

### Shape A — must-have pieces

| Concern | Typical path | Notes |
|---------|--------------|-------|
| Mode switch | `lib/db/mode.ts` | `DATABASE_URL` → plain PG |
| Pool | `lib/db/pool.ts` | Shared `pg` pool; parse `numeric` as float |
| Query compat | `lib/db/supabase-compat.ts` | Select/embed/upsert; `.contains`; relation filters (`categories.slug`) |
| FK embeds | `lib/db/fk-map.ts` | **Per-project** |
| Auth shim | `lib/db/auth.ts` + `app/auth/v1/[...path]` | bcrypt + JWT |
| Storage shim | `lib/db/storage.ts` + `app/storage/v1/object/...` | Disk under `STORAGE_ROOT` |
| REST shim | `app/rest/v1/[table]` + `rpc/[fn]` | Browser supabase-js |

### Env cutover trio (shimmed stores — set together)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Enables in-process Postgres |
| `NEXT_PUBLIC_USE_PLAIN_PG=true` | Edge middleware JWT path (no `pg` on Edge) |
| `NEXT_PUBLIC_SUPABASE_URL` | **App origin**, not `*.supabase.co` |

Also usually required: `AUTH_JWT_SECRET` / `JWT_SECRET`, `NEXT_PUBLIC_APP_URL`, `STORAGE_ROOT` / `STORAGE_LOCAL_PATH`, `RESEND_API_KEY`, payment/SMS keys.

**Failure mode:** `DATABASE_URL` set but `NEXT_PUBLIC_USE_PLAIN_PG` unset → server on PG, middleware still hitting hosted Supabase → admin lockouts.

### Shim / API pitfalls (every project)

- Nested embeds need correct `fk-map` (and often auto-include join FK columns).
- Browser storage uploads: multipart / Content-Type handling.
- RPCs at checkout (`mark_order_paid`, `upsert_customer_from_order`, `update_customer_stats`) must exist in the live DB.
- Order lookups by `order_number` must not cast non-UUID strings to UUID.
- **Count / `Prefer: count=exact`:** return `Content-Range: */N` for head/empty responses (shop “12 of 0” bug) — shimmed stores.
- Auth routes that return **204** must not call `NextResponse.json(..., { status: 204 })`.
- Customer `GET /api/orders/[id]` must enforce ownership (staff OR matching `user_id`); do not leave guest-open reads.

---

## 2. Deploy & build hygiene (Coolify / Dockerfile)

### Workflow

1. Commit on `main` (or staging branch).
2. `git push origin HEAD`.
3. `sudo fleet deploy <app-name>`.
4. Confirm live image hash matches commit (`docker ps` image tag ≈ git SHA).
5. Smoke-test home, auth, shop, one admin write, one storefront read.
6. If the store is a PWA, **bump the service-worker cache version** whenever HTML/chunk strategy changes (see §16).

### Common build / deploy failures

| Symptom | Fix pattern |
|---------|-------------|
| `npm ci` `ECONNRESET` | Retry deploy (network); not a code bug |
| TypeScript: local `const sendEmail = Boolean(...)` shadows import | Rename local flag (`wantEmail`) |
| Invalid `eslint-disable` | Remove / fix directive so `next build` passes |
| Build OK but runtime 503 on `/auth/v1` or `/rest/v1` | Missing `DATABASE_URL` in Coolify env |
| Deploy queued but **old SHA still live** | Wait / check Coolify queue; confirm with `docker ps` image tag — do not trust “queued” alone |
| Palette / CSS “didn’t change” on production | Almost always stale container SHA, not Tailwind |

### Image optimizer on Coolify (critical)

Two failure modes:

1. `/_next/image?url=...` returns **HTTP 200 with `Content-Length: 0`** (sharp broken).
2. Logs: `EACCES: permission denied, mkdir '/app/.next/cache'` (standalone runs as non-root `nextjs`).

**Fix both:**

```ts
// next.config.ts
images: {
  unoptimized: true, // serve originals until sharp + cache are healthy
  // remotePatterns: your domain /uploads or /storage only — drop via.placeholder.com + old *.supabase.co when cut over
}
```

```dockerfile
# Dockerfile runner stage (after copying standalone + static)
RUN mkdir -p /app/.next/cache /var/www/<store>/uploads \
  && chown -R nextjs:nodejs /app/.next /var/www/<store>
USER nextjs
```

Static files under `public/` still work; Next Image just skips optimization when `unoptimized: true`.

### Uploads volume

- **Mamator:** host `/var/www/mamator/uploads` → `/uploads/...`
- **Frebys (Shape A storage shim):** host `/data/coolify/frebys/storage` → container `STORAGE_ROOT` → public `/storage/v1/object/public/...`
- After DB restore, copy restore tree then `chown` to the container UID.
- Verify: `curl -sI https://<host>/storage/v1/object/public/<bucket>/<file>` → 200 + non-zero size.

---

## 3. Performance: images

1. **Batch compress production storage** on VPS (`STORAGE_ROOT` / uploads). Frebys used ImageMagick in place (`scripts/compress-storage-imagemagick.sh`) — kept filenames so DB URLs stayed valid; wrote `.meta.json` `contentType: image/jpeg` when bytes were re-encoded. Result example: **~1.1 GB → ~159 MB**.
2. **Compress on upload** via `lib/image-compress.ts` (sharp) in `app/api/admin/upload`.
3. Prefer same-origin placeholders (`/frebys-logo.png`) over `via.placeholder.com`.
4. Product grids: use compact cards + `sizes="(max-width: 640px) 50vw, …"` so mobile does not fetch desktop-width images.

---

## 4–5. Storefront UX + shop grid (Frebys notes)

| Change | Intent |
|--------|--------|
| Product cards smaller | Less padding/type; `aspect-[3/4]`; lighter shadow/hover |
| Mobile **2×2** grids | Home + shop: `grid-cols-2 lg:grid-cols-3 xl:grid-cols-4` |
| Shop freeze | Do **not** put `categories` array identity in product-fetch `useEffect` deps — use a ref; only full skeleton when `products.length === 0`; tighter infinite-scroll `rootMargin` |
| Homepage product grid | Prefer plain CSS grid over staggered `AnimatedGrid` (many `setTimeout` + `setState` calls jank the main thread) |

Also apply per store: storefront UX (§4 general), PDP (§6), checkout addresses (§7), order actions (§8), newsletter (§9), payments (§10), admin `money()` (§10a), customers aggregation (§11), product SEO (§12), blog (§13), admin reliability (§14), brand/ops copy (§15).

---

## 16. PWA / service worker (critical)

Stale SW caches are a top cause of **white screens** after deploys (old HTML → missing `/_next/static` chunks) and **“Image unavailable”** on product photos.

### Rules

1. **Bump `CACHE_VERSION`** on every SW behavior change (`sw-v2.4`, …).
2. **Never cache HTML / navigations / `/_next/data`.** Network-only; offline fallback = `/offline` only.
3. **Do not pre-cache `/`, `/shop`, etc.** Pre-cache only offline shell + tiny static assets (icons, manifest).
4. **Same-origin `/uploads/` and `/storage/`** — **network only** (cache-first + SVG “Image unavailable” poisons product images).
5. Hashed `/_next/static` can stay cache-first (MIME-guard: never cache HTML as JS/CSS).
6. On activate, delete caches that don’t match current version names.
7. Don’t force `user-select: text` on all links (blinking caret). Use `select-none` on header/nav/footer chrome.

After deploy, ask merchants on PWA installs to **hard refresh once** or reopen the app.

---

## 17. Verification checklist (copy per project)

```bash
# Deploy image matches commit
ssh big-vps "sudo docker ps --format '{{.Image}} {{.Status}}' | grep <uuid-prefix>"
git rev-parse --short HEAD

# Storefront
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/"
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/shop"
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/blog"
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/offline"
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/admin/login"

# SW version bump visible
curl -s "$BASE/service-worker.js" | head -n 3

# Newsletter
curl -s -X POST "$BASE/api/newsletter/subscribe" \
  -H "Content-Type: application/json" \
  -d '{"email":"verify.newsletter@gmail.com"}'

# Shimmed stores only:
# curl -s "$BASE/rest/v1/site_settings?select=key&limit=1"
```

Manual:

- [ ] Live docker image SHA == `git rev-parse HEAD`
- [ ] Homepage hero + category images load
- [ ] Shop: total count correct; no white-screen; scroll stable
- [ ] PDP: image + price/stock match admin for active products
- [ ] Login has no dead Google/Facebook buttons
- [ ] Logged-in checkout autofills / selects saved address
- [ ] Order history: Track (with email) / Reorder / Invoice / Help work (no alerts)
- [ ] Admin → Products / Orders / POS load without error boundary
- [ ] Admin → Customers order counts sensible
- [ ] Admin → Blog saves (or module hidden)
- [ ] Checkout / Moolre callback still marks paid
- [ ] After deploy, PWA hard-refresh once
- [ ] CSS has brand tokens; no leftover stone charcoal CTAs if rebranded

---

## 18. Suggested apply order on a new store

1. Confirm Coolify app + DB env (+ shim trio if Shape A).
2. Verify REST/auth/storage **or** native `/api/*` + uploads mount.
3. Fix build blockers; set `images.unoptimized` + writable `.next/cache` on Dockerfile runners.
4. Fix service worker (§16) before heavy PWA testing.
5. `lib/format-money` + admin/storefront `.toFixed` audit (§10a).
6. Wire newsletter + merchant emails.
7. Admin customers live aggregation.
8. Product SEO helper + backfill.
9. Blog real editor or hide module.
10. Address book API + checkout autofill + order history actions.
11. Storefront UX / shipping / returns / footer / auth stub audit.
12. Full verification checklist → deploy → **re-check image hash** + PWA refresh.

---

## 19. What differs between projects

| Area | Usually differs |
|------|-----------------|
| Shape A vs B | Shims vs native `lib/db` |
| `fk-map.ts` | Table/column names (Shape A) |
| Payment provider | Moolre vs other |
| Storage path / volume | Coolify mount (`/uploads` vs `/storage`) |
| Enum casings | `active` vs `Active` |
| Blog / wholesale / POS modules | Enabled set |
| Brand fonts/colors | Design system |
| Shipping / returns rules | Ops reality |

If a store was **never** on Supabase, skip Shape A cutover and still apply §2–§18 for quality.

---

## 20. Reference snapshots

### Frebys (this repo)

| Item | Value |
|------|--------|
| Repo | `katalambano878/fredysmain` |
| Coolify app | `frebys-app` only (**staging deleted** Jul 2026) |
| UUID prefix | `k11c9rdumeb14n5algp2db9t` |
| Production | https://www.frebysfashion.com |
| Shape | A — shimmed Supabase-js → plain PG |
| Storage | Host `/data/coolify/frebys/storage` → `/storage/v1/...` |
| Branch | `staging/plain-postgres` (prod Coolify tracks this) |
| Payments | Moolre + Hubtel |
| Notable (Jul 2026) | SW v2.5 → money() → addresses/checkout → order actions → newsletter → blog CRUD → Content-Range `*/N` → Dockerfile standalone ready → **storage compress ~1.1GB→159MB** → compact 2-col mobile product grids → shop fetch freeze fix |

Reusable artifacts:

- `lib/format-money.ts`, `lib/address-map.ts`, `lib/product-seo.ts`, `lib/image-compress.ts`
- `lib/data/addresses.ts` + `/api/addresses`
- `app/(store)/account/invoice/[id]`
- `public/service-worker.js` (`sw-v2.5`)
- `app/error.tsx` + `app/admin/error.tsx`
- `app/api/newsletter/subscribe` + compress-on-upload in `app/api/admin/upload`
- `scripts/compress-storage-imagemagick.sh` (VPS batch) / `scripts/compress-storage-images.mjs`
- Admin customers live aggregation
- Compact `ProductCard` + `grid-cols-2` home/shop

```bash
BASE=https://www.frebysfashion.com
ssh big-vps "sudo docker ps --format '{{.Image}}' | grep k11c9r"
curl -s "$BASE/service-worker.js" | head -n 3
sudo du -sh /data/coolify/frebys/storage
```

### Affordable Perfumes GH

| Item | Value |
|------|--------|
| Repo | `katalambano878/affordableperfume` |
| Coolify app | `affordableperfume-app` |
| UUID prefix | `slrbujar86myr4hgjh4lzwb9` |
| Production | https://www.affordableperfumesgh.com |
| Shape | A |

### Mamator

| Item | Value |
|------|--------|
| Repo | `ecrimah/tshirts` |
| Coolify app | `mamator-app` |
| UUID prefix | `v4psxy3fysqewkdnj1ja1w0k` |
| Production | https://mamator.com |
| Shape | B — native Postgres |

### Efescloset

| Item | Value |
|------|--------|
| Repo | `katalambano878/efes` |
| Coolify app | `efes-app` / `efes-staging` |
| UUID prefix | `f5iff1hstno90gvlr3etzl5i` |
| Production | https://www.efescloset.com |
| Shape | A |

---

*Keep this playbook updated when a new store invents a better pattern — add a short note under the relevant section, not a second competing doc.*
