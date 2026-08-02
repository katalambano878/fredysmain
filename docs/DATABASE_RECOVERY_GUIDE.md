# DATABASE RECOVERY GUIDE — Frebys

**Database:** `frebys` on Docker service `fleet-postgres`  
**Do not confuse with** Mamator / other `store_*` databases.

## Backup (schema + data)

```bash
# On VPS (as root / fleet-capable user)
sudo docker exec fleet-postgres pg_dump -U postgres -d frebys -Fc -f /tmp/frebys-$(date +%Y%m%d).dump
sudo docker cp fleet-postgres:/tmp/frebys-YYYYMMDD.dump ./frebys-YYYYMMDD.dump
```

Schema-only:

```bash
sudo docker exec fleet-postgres pg_dump -U postgres -d frebys --schema-only -f /tmp/frebys-schema.sql
```

## Restore

```bash
sudo docker exec -i fleet-postgres pg_restore -U postgres -d frebys --clean --if-exists < frebys-YYYYMMDD.dump
# or for SQL:
sudo docker exec -i fleet-postgres psql -U postgres -d frebys < frebys-schema.sql
```

## Rollback payment integrity migration (20260802)

```sql
BEGIN;
DROP TABLE IF EXISTS public.sms_message_logs;
DROP TABLE IF EXISTS public.payment_callback_events;
DROP TABLE IF EXISTS public.payment_attempts;
-- Optionally restore prior mark_order_paid bodies from pre-migration dump
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_total_nonneg;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_subtotal_nonneg;
COMMIT;
```

## Apply migrations safely

1. Confirm DB name: `\conninfo` → must be `frebys`
2. Review SQL for DROP/DELETE
3. Apply as `postgres` (app role may lack ownership)
4. Grant DML to `frebys` (`scripts/vps-grant-frebys.sh`)
5. Deploy application code that depends on new objects

## Verification after restore / migrate

```sql
SELECT COUNT(*) FROM orders;
SELECT to_regclass('public.payment_attempts');
SELECT proname FROM pg_proc WHERE proname = 'mark_order_paid';
```

Smoke: home/shop 200, create test order in sandbox, Hubtel/Moolre callback path.
