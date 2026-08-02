/**
 * Payment attempt + callback event persistence for Frebys plain Postgres.
 * Failures are non-fatal for checkout initiation (logged only).
 */
import { createHash } from 'crypto';
import { query } from '@/lib/db/pool';

export type PaymentGateway = 'hubtel' | 'moolre' | 'paystack' | 'cash' | 'pos' | 'other';

function safeJson(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {};
  try {
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Strip obvious secrets from gateway payloads before storage */
function sanitizePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...payload };
  for (const key of Object.keys(out)) {
    const lower = key.toLowerCase();
    if (
      lower.includes('secret') ||
      lower.includes('password') ||
      lower.includes('apikey') ||
      lower.includes('api_key') ||
      lower.includes('authorization') ||
      lower.includes('token')
    ) {
      out[key] = '[redacted]';
    }
  }
  return out;
}

export function hashPayload(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload ?? {})).digest('hex');
}

export async function recordPaymentAttempt(input: {
  orderId: string;
  orderNumber: string;
  gateway: PaymentGateway;
  internalReference: string;
  gatewayReference?: string | null;
  expectedAmount: number;
  currency?: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  initiationPayload?: Record<string, unknown>;
  gatewayResponse?: Record<string, unknown>;
  status?: string;
}): Promise<{ id: string | null; error?: string }> {
  try {
    const { rows } = await query<{ id: string }>(
      `INSERT INTO payment_attempts (
         order_id, order_number, gateway, internal_reference, gateway_reference,
         expected_amount, currency, status, customer_email, customer_phone,
         initiation_payload, gateway_response
       ) VALUES (
         $1::uuid, $2, $3, $4, $5,
         $6, $7, $8, $9, $10,
         $11::jsonb, $12::jsonb
       )
       ON CONFLICT (internal_reference) DO UPDATE SET
         gateway_reference = COALESCE(EXCLUDED.gateway_reference, payment_attempts.gateway_reference),
         gateway_response = payment_attempts.gateway_response || EXCLUDED.gateway_response,
         updated_at = now()
       RETURNING id`,
      [
        input.orderId,
        input.orderNumber,
        input.gateway,
        input.internalReference,
        input.gatewayReference || null,
        input.expectedAmount,
        input.currency || 'GHS',
        input.status || 'pending',
        input.customerEmail || null,
        input.customerPhone || null,
        JSON.stringify(sanitizePayload(safeJson(input.initiationPayload))),
        JSON.stringify(sanitizePayload(safeJson(input.gatewayResponse))),
      ]
    );
    return { id: rows[0]?.id || null };
  } catch (e: any) {
    console.error('[payment-records] recordPaymentAttempt:', e?.message || e);
    return { id: null, error: e?.message || String(e) };
  }
}

/**
 * Record a callback event. Returns whether this payload is new (should process).
 */
export async function recordCallbackEvent(input: {
  gateway: PaymentGateway;
  eventType?: string;
  externalEventId?: string | null;
  internalReference?: string | null;
  gatewayReference?: string | null;
  orderNumber?: string | null;
  payload: unknown;
  signatureStatus?: 'unchecked' | 'valid' | 'invalid' | 'missing';
}): Promise<{ isNew: boolean; eventId: string | null; alreadyProcessed: boolean }> {
  const payloadHash = hashPayload(input.payload);
  const sanitized = sanitizePayload(safeJson(input.payload as any));
  try {
    const { rows } = await query<{
      id: string;
      processing_status: string;
      is_insert: boolean;
    }>(
      `INSERT INTO payment_callback_events (
         gateway, event_type, external_event_id, internal_reference,
         gateway_reference, order_number, payload_hash, signature_status,
         processing_status, payload
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, 'received', $9::jsonb
       )
       ON CONFLICT (gateway, payload_hash) DO UPDATE SET
         attempt_count = payment_callback_events.attempt_count + 1,
         received_at = payment_callback_events.received_at
       RETURNING id, processing_status,
         (xmax = 0) AS is_insert`,
      [
        input.gateway,
        input.eventType || null,
        input.externalEventId || null,
        input.internalReference || null,
        input.gatewayReference || null,
        input.orderNumber || null,
        payloadHash,
        input.signatureStatus || 'unchecked',
        JSON.stringify(sanitized),
      ]
    );
    const row = rows[0];
    if (!row) return { isNew: true, eventId: null, alreadyProcessed: false };
    const alreadyProcessed = row.processing_status === 'processed';
    return {
      isNew: !!row.is_insert,
      eventId: row.id,
      alreadyProcessed,
    };
  } catch (e: any) {
    console.error('[payment-records] recordCallbackEvent:', e?.message || e);
    // Fail open for processing if table missing mid-deploy — caller still verifies
    return { isNew: true, eventId: null, alreadyProcessed: false };
  }
}

export async function markCallbackProcessed(
  eventId: string | null,
  status: 'processed' | 'ignored' | 'failed',
  errorMessage?: string
) {
  if (!eventId) return;
  try {
    await query(
      `UPDATE payment_callback_events
       SET processing_status = $2,
           error_message = $3,
           processed_at = now()
       WHERE id = $1::uuid`,
      [eventId, status, errorMessage || null]
    );
  } catch (e: any) {
    console.error('[payment-records] markCallbackProcessed:', e?.message || e);
  }
}

export async function recordSmsAttempt(input: {
  recipientMasked: string;
  messageType: string;
  templateName?: string;
  relatedOrderId?: string | null;
  idempotencyKey?: string | null;
  status?: string;
  failureReason?: string | null;
  providerMessageId?: string | null;
}): Promise<{ skipped: boolean }> {
  try {
    if (input.idempotencyKey) {
      const existing = await query<{ id: string; status: string }>(
        `SELECT id, status FROM sms_message_logs WHERE idempotency_key = $1 LIMIT 1`,
        [input.idempotencyKey]
      );
      if (existing.rows[0] && ['sent', 'delivered', 'pending'].includes(existing.rows[0].status)) {
        return { skipped: true };
      }
    }
    await query(
      `INSERT INTO sms_message_logs (
         recipient_masked, message_type, template_name, related_order_id,
         idempotency_key, status, failure_reason, provider_message_id,
         attempt_count, sent_at
       ) VALUES ($1,$2,$3,$4::uuid,$5,$6,$7,$8,1, CASE WHEN $6 = 'sent' THEN now() ELSE NULL END)
       ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING`,
      [
        input.recipientMasked,
        input.messageType,
        input.templateName || null,
        input.relatedOrderId || null,
        input.idempotencyKey || null,
        input.status || 'pending',
        input.failureReason || null,
        input.providerMessageId || null,
      ]
    );
    return { skipped: false };
  } catch (e: any) {
    console.error('[payment-records] recordSmsAttempt:', e?.message || e);
    return { skipped: false };
  }
}

export function maskPhone(phone: string | null | undefined): string {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.length < 4) return '****';
  return `${'*'.repeat(Math.max(0, d.length - 4))}${d.slice(-4)}`;
}
