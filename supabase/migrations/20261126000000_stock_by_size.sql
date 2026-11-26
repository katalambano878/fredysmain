-- Stock is taken off the exact size that was bought, and duplicate sizes are merged.
--
-- Why:
--  1. Saving a product that had past orders used to leave a second copy of each sold size
--     behind (the delete was refused, the re-add went through). The product save no longer
--     does this, but the copies already made are still there. Part 1 merges them.
--  2. mark_order_paid took stock off sizes by NAME, so every copy of "Age 4" lost stock on one
--     sale, sizes named "Colour / Size" never lost any, and an order with two sizes of one
--     product only reduced the product total once. Parts 2 and 3 replace that with the size id.
--
-- Safe to run more than once. Run inside one transaction (as below).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Merge duplicate sizes: same product, same name, same second option.
--    Keep the copy that carries a sale, else the newest (the last save is the current one).
--    Past order lines and carts are pointed at the copy that is kept.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _size_merge ON COMMIT DROP AS
WITH ranked AS (
  SELECT
    pv.id,
    first_value(pv.id) OVER (
      PARTITION BY pv.product_id, lower(btrim(coalesce(pv.name, ''))), lower(btrim(coalesce(pv.option2, '')))
      ORDER BY
        (coalesce(pv.compare_at_price, 0) > pv.price OR (pv.metadata ? 'sale_price')) DESC,
        pv.created_at DESC NULLS LAST,
        pv.id DESC
    ) AS keep_id
  FROM product_variants pv
)
SELECT id AS drop_id, keep_id FROM ranked WHERE id <> keep_id;

UPDATE order_items oi
SET variant_id = m.keep_id
FROM _size_merge m
WHERE oi.variant_id = m.drop_id;

UPDATE order_items oi
SET metadata = jsonb_set(oi.metadata, '{variant_id}', to_jsonb(m.keep_id::text))
FROM _size_merge m
WHERE oi.metadata ->> 'variant_id' = m.drop_id::text;

-- A cart may hold both copies of one size: remove the copy that would collide, then repoint.
DELETE FROM cart_items c
USING _size_merge m
WHERE c.variant_id = m.drop_id
  AND EXISTS (
    SELECT 1 FROM cart_items k
    WHERE k.variant_id = m.keep_id
      AND k.product_id = c.product_id
      AND k.user_id IS NOT DISTINCT FROM c.user_id
  );

UPDATE cart_items c
SET variant_id = m.keep_id
FROM _size_merge m
WHERE c.variant_id = m.drop_id;

DELETE FROM product_variants pv
USING _size_merge m
WHERE pv.id = m.drop_id;

-- ---------------------------------------------------------------------------
-- 2) One place that takes an order's stock off, by size id.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reduce_order_stock(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Product total: once per product, for everything ordered of it.
  UPDATE products p
  SET quantity = GREATEST(0, p.quantity - s.qty)
  FROM (
    SELECT oi.product_id, SUM(oi.quantity)::int AS qty
    FROM order_items oi
    WHERE oi.order_id = p_order_id
      AND oi.product_id IS NOT NULL
      AND COALESCE(oi.is_preorder, false) = false
    GROUP BY oi.product_id
  ) s
  WHERE s.product_id = p.id;

  -- Size: the id stored on the line (column first, then the line's metadata). Where a line has
  -- no usable id (older orders), fall back to the size name, and then to ONE size only.
  UPDATE product_variants pv
  SET quantity = GREATEST(0, pv.quantity - s.qty)
  FROM (
    SELECT resolved.variant_id, SUM(resolved.quantity)::int AS qty
    FROM (
      SELECT
        oi.quantity,
        COALESCE(
          (SELECT v.id FROM product_variants v WHERE v.id = oi.variant_id),
          (SELECT v.id FROM product_variants v
            WHERE v.product_id = oi.product_id
              AND v.id::text = oi.metadata ->> 'variant_id'),
          (SELECT v.id FROM product_variants v
            WHERE v.product_id = oi.product_id
              AND oi.variant_name IS NOT NULL
              AND (
                lower(btrim(v.name)) = lower(btrim(oi.variant_name))
                OR lower(btrim(coalesce(v.option1, ''))) = lower(btrim(oi.variant_name))
                OR lower(btrim(concat_ws(' / ', v.option1, v.option2))) = lower(btrim(oi.variant_name))
                OR lower(btrim(concat_ws(' / ', v.option2, v.option1))) = lower(btrim(oi.variant_name))
              )
            ORDER BY v.quantity DESC, v.created_at DESC NULLS LAST, v.id
            LIMIT 1)
        ) AS variant_id
      FROM order_items oi
      WHERE oi.order_id = p_order_id
        AND COALESCE(oi.is_preorder, false) = false
    ) resolved
    WHERE resolved.variant_id IS NOT NULL
    GROUP BY resolved.variant_id
  ) s
  WHERE s.variant_id = pv.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.reduce_order_stock(uuid) FROM PUBLIC;

-- The reverse, for a cancelled order whose stock had been taken off: puts it back on the same
-- sizes and clears the flag, so the order can never be given back twice.
CREATE OR REPLACE FUNCTION public.restore_order_stock(p_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  ord orders;
BEGIN
  SELECT * INTO ord FROM orders WHERE id = p_order_id FOR UPDATE;
  IF ord.id IS NULL OR (ord.metadata->>'stock_reduced') IS DISTINCT FROM 'true' THEN
    RETURN false;
  END IF;

  UPDATE products p
  SET quantity = p.quantity + s.qty
  FROM (
    SELECT oi.product_id, SUM(oi.quantity)::int AS qty
    FROM order_items oi
    WHERE oi.order_id = p_order_id
      AND oi.product_id IS NOT NULL
      AND COALESCE(oi.is_preorder, false) = false
    GROUP BY oi.product_id
  ) s
  WHERE s.product_id = p.id;

  UPDATE product_variants pv
  SET quantity = pv.quantity + s.qty
  FROM (
    SELECT resolved.variant_id, SUM(resolved.quantity)::int AS qty
    FROM (
      SELECT
        oi.quantity,
        COALESCE(
          (SELECT v.id FROM product_variants v WHERE v.id = oi.variant_id),
          (SELECT v.id FROM product_variants v
            WHERE v.product_id = oi.product_id
              AND v.id::text = oi.metadata ->> 'variant_id'),
          (SELECT v.id FROM product_variants v
            WHERE v.product_id = oi.product_id
              AND oi.variant_name IS NOT NULL
              AND (
                lower(btrim(v.name)) = lower(btrim(oi.variant_name))
                OR lower(btrim(coalesce(v.option1, ''))) = lower(btrim(oi.variant_name))
              )
            ORDER BY v.created_at DESC NULLS LAST, v.id
            LIMIT 1)
        ) AS variant_id
      FROM order_items oi
      WHERE oi.order_id = p_order_id
        AND COALESCE(oi.is_preorder, false) = false
    ) resolved
    WHERE resolved.variant_id IS NOT NULL
    GROUP BY resolved.variant_id
  ) s
  WHERE s.variant_id = pv.id;

  UPDATE orders
  SET metadata = (COALESCE(metadata, '{}'::jsonb) - 'stock_reduced')
        || jsonb_build_object('stock_restored_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
  WHERE id = p_order_id;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.restore_order_stock(uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 3) mark_order_paid (both forms) uses it. Everything else is unchanged.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_order_paid(
  order_ref text,
  moolre_ref text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  updated_order orders;
  was_paid boolean := false;
BEGIN
  SELECT * INTO updated_order FROM orders WHERE order_number = order_ref FOR UPDATE;
  IF updated_order.id IS NULL THEN
    RETURN NULL;
  END IF;

  was_paid := (updated_order.payment_status::text = 'paid');

  IF NOT was_paid THEN
    UPDATE orders SET
      payment_status = 'paid',
      status = CASE
        WHEN status IN ('pending', 'awaiting_payment') THEN 'processing'::order_status
        ELSE status
      END,
      payment_transaction_id = COALESCE(NULLIF(moolre_ref, ''), payment_transaction_id),
      payment_provider = COALESCE(
        payment_provider,
        NULLIF(metadata->>'payment_gateway', ''),
        NULLIF(metadata->>'payment_method', ''),
        payment_method
      ),
      metadata = COALESCE(metadata, '{}'::jsonb) ||
        jsonb_build_object(
          'moolre_reference', moolre_ref,
          'payment_verified_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        ),
      updated_at = now()
    WHERE id = updated_order.id
    RETURNING * INTO updated_order;

    INSERT INTO order_status_history (order_id, status, notes)
    VALUES (updated_order.id, 'processing'::order_status, 'Payment confirmed');
  END IF;

  -- Stock reduction once
  IF (updated_order.metadata->>'stock_reduced') IS NULL THEN
    PERFORM public.reduce_order_stock(updated_order.id);

    UPDATE orders
    SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"stock_reduced": true}'::jsonb
    WHERE id = updated_order.id
    RETURNING * INTO updated_order;
  END IF;

  -- Mirror into payment_attempts when present
  UPDATE payment_attempts
  SET status = 'successful',
      amount_paid = updated_order.total,
      gateway_reference = COALESCE(NULLIF(moolre_ref, ''), gateway_reference),
      verified_at = COALESCE(verified_at, now()),
      updated_at = now()
  WHERE order_id = updated_order.id
    AND status IN ('pending', 'processing');

  RETURN to_jsonb(updated_order);
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_order_paid(
  p_order_id uuid,
  p_transaction_id text DEFAULT NULL,
  p_payment_method text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  ord orders;
BEGIN
  SELECT * INTO ord FROM orders WHERE id = p_order_id FOR UPDATE;
  IF ord.id IS NULL THEN
    RETURN;
  END IF;

  IF ord.payment_status::text <> 'paid' THEN
    UPDATE orders SET
      payment_status = 'paid'::payment_status,
      status = CASE
        WHEN status IN ('pending', 'awaiting_payment') THEN 'processing'::order_status
        ELSE status
      END,
      payment_transaction_id = COALESCE(p_transaction_id, payment_transaction_id),
      payment_method = COALESCE(p_payment_method, payment_method),
      payment_provider = COALESCE(payment_provider, p_payment_method, payment_method),
      updated_at = now()
    WHERE id = p_order_id
    RETURNING * INTO ord;

    INSERT INTO order_status_history (order_id, status, notes)
    VALUES (p_order_id, 'processing'::order_status, 'Payment confirmed');
  END IF;

  IF (ord.metadata->>'stock_reduced') IS NULL THEN
    PERFORM public.reduce_order_stock(p_order_id);

    UPDATE orders
    SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"stock_reduced": true}'::jsonb
    WHERE id = p_order_id;
  END IF;
END;
$function$;

COMMIT;
