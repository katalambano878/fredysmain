# Frebys — Supabase → plain Postgres cutover

**Shape:** A — shimmed `@supabase/supabase-js` → app `/rest/v1`, `/auth/v1`, `/storage/v1` + `DATABASE_URL`  
**Repo:** `katalambano878/fredysmain`  
**Branch:** `staging/plain-postgres`  
**Coolify:** `frebys-app` (`k11c9rdumeb14n5algp2db9t`), `frebys-staging` (`qu3fka2mbcb22qrccy989aca`)  
**Production:** https://www.frebysfashion.com  

See also: [`STORE_HARDENING_PLAYBOOK.md`](./STORE_HARDENING_PLAYBOOK.md).

## Env cutover trio (set together in Coolify)

| Variable | Value |
|----------|--------|
| `DATABASE_URL` | Fleet/local Postgres URL for this store |
| `NEXT_PUBLIC_USE_PLAIN_PG` | `true` |
| `NEXT_PUBLIC_SUPABASE_URL` | **App origin** (e.g. `https://www.frebysfashion.com`), not `*.supabase.co` |

Also required:

- `AUTH_JWT_SECRET` / `JWT_SECRET` (must match tokens the auth shim issues)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (any non-empty client key the browser sends; server validates JWT)
- `NEXT_PUBLIC_APP_URL=https://www.frebysfashion.com`
- `STORAGE_ROOT` / `STORAGE_PUBLIC_URL` (disk storage for `/storage/v1/...`)
- `RESEND_API_KEY`, `ADMIN_EMAIL`, `EMAIL_FROM`
- `NEWSLETTER_PROMO_CODE` (optional; default `INSIDER10` — create matching coupon if promised)
- Payment: `MOOLRE_*`, `HUBTEL_*` as used

**Failure mode:** `DATABASE_URL` set but `NEXT_PUBLIC_USE_PLAIN_PG` unset → server on PG, middleware still hitting hosted Supabase → admin lockouts.

## Verify after deploy

```bash
BASE=https://www.frebysfashion.com
ssh big-vps "sudo docker ps --format '{{.Image}} {{.Status}}' | grep k11c9r"
git rev-parse --short HEAD

curl -s -o /dev/null -w "%{http_code}\n" "$BASE/"
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/shop"
curl -s "$BASE/service-worker.js" | head -n 3
curl -s "$BASE/rest/v1/site_settings?select=key&limit=1" \
  -H "apikey: x" -H "Authorization: Bearer x" | head -c 200
```

## Notes

- Runtime browser client still uses `@supabase/supabase-js` pointed at the app origin.
- Admin server paths use `lib/supabase-admin` → compat when `DATABASE_URL` is set.
- Coolify currently uses **nixpacks**; repo also has a `Dockerfile` (standalone + `.next/cache` ownership) if you switch build pack.
- Storage serves from disk under `STORAGE_ROOT` via `/storage/v1/object/...`.
