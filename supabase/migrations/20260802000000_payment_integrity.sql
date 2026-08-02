-- ============================================================================
-- Frebys: payment integrity tables, indexes, and mark_order_paid hardening
-- Safe for production: additive only, no data deletes.
-- Target DB: frebys @ fleet-postgres (plain PostgreSQL)
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Payment attempts (multiple attempts per order)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  order_number text NOT NULL,
  gateway text NOT NULL CHECK (gateway IN ('hubtel', 'moolre', 'paystack', 'cash', 'pos', 'other')),
  internal_reference text NOT NULL,
  gateway_reference text,
  expected_amount numeric(12,2) NOT NULL CHECK (expected_amount >= 0),
  amount_paid numeric(12,2),
  currency text NOT NULL DEFAULT 'GHS',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending','processing','successful','failed','cancelled','expired','reversed','refunded','partially_refunded'
    )),
  customer_email text,
  customer_phone text,
  initiation_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  gateway_response jsonb NOT NULL DEFAULT '{}'::jsonb,
  failure_reason text,
  retry_count integer NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS payment_attempts_internal_reference_key
  ON public.payment_attempts (internal_reference);

CREATE INDEX IF NOT EXISTS idx_payment_attempts_order_id
  ON public.payment_attempts (order_id);

CREATE INDEX IF NOT EXISTS idx_payment_attempts_order_number
  ON public.payment_attempts (order_number);

CREATE INDEX IF NOT EXISTS idx_payment_attempts_gateway_status
  ON public.payment_attempts (gateway, status);

CREATE INDEX IF NOT EXISTS idx_payment_attempts_gateway_reference
  ON public.payment_attempts (gateway_reference)
  WHERE gateway_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_attempts_created
  ON public.payment_attempts (created_at DESC);

-- ---------------------------------------------------------------------------
-- 2) Callback / webhook event deduplication
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_callback_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway text NOT NULL CHECK (gateway IN ('hubtel', 'moolre', 'paystack', 'other')),
  event_type text,
  external_event_id text,
  internal_reference text,
  gateway_reference text,
  order_number text,
  payload_hash text NOT NULL,
  signature_status text NOT NULL DEFAULT 'unchecked'
    CHECK (signature_status IN ('unchecked','valid','invalid','missing')),
  processing_status text NOT NULL DEFAULT 'received'
    CHECK (processing_status IN ('received','processed','ignored','failed')),
  attempt_count integer NOT NULL DEFAULT 1 CHECK (attempt_count >= 0),
  error_message text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS payment_callback_events_dedupe_key
  ON public.payment_callback_events (gateway, payload_hash);

CREATE UNIQUE INDEX IF NOT EXISTS payment_callback_events_external_event_key
  ON public.payment_callback_events (gateway, external_event_id)
  WHERE external_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_callback_events_status
  ON public.payment_callback_events (processing_status, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_callback_events_order
  ON public.payment_callback_events (order_number)
  WHERE order_number IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3) SMS attempt / delivery log (Moolre)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sms_message_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'moolre',
  recipient_masked text NOT NULL,
  recipient_hash text,
  message_type text NOT NULL DEFAULT 'transactional',
  template_name text,
  related_user_id uuid,
  related_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  related_payment_attempt_id uuid REFERENCES public.payment_attempts(id) ON DELETE SET NULL,
  provider_message_id text,
  idempotency_key text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sent','delivered','failed','skipped')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  delivered_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS sms_message_logs_idempotency_key
  ON public.sms_message_logs (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sms_message_logs_order
  ON public.sms_message_logs (related_order_id)
  WHERE related_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sms_message_logs_created
  ON public.sms_message_logs (created_at DESC);

-- ---------------------------------------------------------------------------
-- 4) Orders: financial check + payment lookup indexes
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_total_nonneg'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_total_nonneg CHECK (total IS NULL OR total >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_subtotal_nonneg'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_subtotal_nonneg CHECK (subtotal IS NULL OR subtotal >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_payment_txn
  ON public.orders (payment_transaction_id)
  WHERE payment_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_hubtel_client_ref
  ON public.orders ((metadata->>'hubtel_client_reference'))
  WHERE metadata ? 'hubtel_client_reference';

CREATE INDEX IF NOT EXISTS idx_orders_payment_status_created
  ON public.orders (payment_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_items_variant_name
  ON public.order_items (product_id, variant_name)
  WHERE variant_name IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 5) Harden mark_order_paid(text) — primary path used by Hubtel/Moolre
--    Idempotent: already-paid orders return without re-decrementing stock.
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
    UPDATE products p
    SET quantity = GREATEST(0, p.quantity - oi.quantity)
    FROM order_items oi
    WHERE oi.order_id = updated_order.id
      AND oi.product_id = p.id
      AND COALESCE(oi.is_preorder, false) = false;

    UPDATE product_variants pv
    SET quantity = GREATEST(0, pv.quantity - oi.quantity)
    FROM order_items oi
    WHERE oi.order_id = updated_order.id
      AND oi.product_id = pv.product_id
      AND oi.variant_name IS NOT NULL
      AND (oi.variant_name = pv.name OR oi.variant_name = pv.option1)
      AND COALESCE(oi.is_preorder, false) = false;

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

-- Keep uuid overload aligned (admin mark-paid)
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
    UPDATE products p
    SET quantity = GREATEST(0, p.quantity - oi.quantity)
    FROM order_items oi
    WHERE oi.order_id = p_order_id
      AND oi.product_id = p.id
      AND COALESCE(oi.is_preorder, false) = false;

    UPDATE product_variants pv
    SET quantity = GREATEST(0, pv.quantity - oi.quantity)
    FROM order_items oi
    WHERE oi.order_id = p_order_id
      AND oi.product_id = pv.product_id
      AND oi.variant_name IS NOT NULL
      AND (oi.variant_name = pv.name OR oi.variant_name = pv.option1)
      AND COALESCE(oi.is_preorder, false) = false;

    UPDATE orders
    SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"stock_reduced": true}'::jsonb
    WHERE id = p_order_id;
  END IF;
END;
$function$;

COMMIT;
