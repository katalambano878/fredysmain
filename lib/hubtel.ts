/**
 * Hubtel Online Checkout client.
 *
 *  - POST https://payproxyapi.hubtel.com/items/initiate
 *      starts a hosted-checkout session.
 *  - GET  https://rmsc.hubtel.com/v1/merchantaccount/merchants/{merchantId}/transactions/status?clientReference={ref}
 *      Public RMSC status-check (no IP whitelist). Same shape as Hubtel's doc cURL:
 *      curl 'https://rmsc.hubtel.com/v1/merchantaccount/merchants/{merchantId}/transactions/status?clientReference=...'
 *        -H 'Authorization: Basic {base64(apiId:apiKey)}'
 *      Use HUBTEL_MERCHANT_ACCOUNT_NUMBER as {merchantId} (Frebys: 2039884).
 *
 * Auth on both endpoints is HTTP Basic with the Hubtel-issued API ID/Key.
 */

const INITIATE_URL = 'https://payproxyapi.hubtel.com/items/initiate';
const STATUS_BASE_URL = 'https://rmsc.hubtel.com/v1/merchantaccount/merchants';
// Direct Receive Money endpoint (admin-assisted MoMo prompt). Hubtel routes
// the customer's network from the channel param; the customer gets a USSD
// prompt on their phone to authorise the debit.
const DIRECT_RECEIVE_BASE_URL = 'https://rmp.hubtel.com/merchantaccount/merchants';

function requiredEnv(name: string): string {
    const v = process.env[name];
    if (!v || !v.trim()) {
        throw new Error(`Missing required env var: ${name}`);
    }
    return v.trim();
}

function buildAuthHeader(): string {
    const id = requiredEnv('HUBTEL_API_ID');
    const key = requiredEnv('HUBTEL_API_KEY');
    const encoded = Buffer.from(`${id}:${key}`).toString('base64');
    return `Basic ${encoded}`;
}

export interface HubtelInitiatePayload {
    /** Total amount; Hubtel accepts up to 2 decimal places. */
    totalAmount: number;
    description: string;
    callbackUrl: string;
    returnUrl: string;
    cancellationUrl: string;
    /** Hubtel Collection Account Number (the "merchantAccountNumber"). */
    merchantAccountNumber: string;
    /**
     * Unique transaction identifier. **Max 32 characters** per the docs;
     * makeHubtelClientReference() guarantees that for you.
     */
    clientReference: string;
    payeeName?: string;
    payeeMobileNumber?: string;
    payeeEmail?: string;
}

export interface HubtelInitiateResult {
    responseCode?: string;
    status?: string;
    message?: string;
    data?: {
        checkoutUrl?: string;
        checkoutId?: string;
        clientReference?: string;
        message?: string;
        checkoutDirectUrl?: string;
    };
}

export async function initiateHubtelCheckout(
    payload: HubtelInitiatePayload,
): Promise<HubtelInitiateResult> {
    if (payload.clientReference.length > 32) {
        throw new Error(
            `Hubtel clientReference must be <=32 chars (got ${payload.clientReference.length}: "${payload.clientReference}")`,
        );
    }
    const res = await fetch(INITIATE_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: buildAuthHeader(),
        },
        body: JSON.stringify(payload),
    });
    return parseJsonOrThrow(res, 'initiate');
}

export interface HubtelStatusResult {
    message?: string;
    responseCode?: string;
    data?: {
        date?: string;
        status?: string;              // "Paid" | "Unpaid" | "Refunded"
        transactionId?: string;
        externalTransactionId?: string;
        paymentMethod?: string;
        clientReference?: string;
        currencyCode?: string | null;
        amount?: number;
        charges?: number;
        amountAfterCharges?: number;
        isFulfilled?: boolean | null;
    };
}

export async function checkHubtelStatus(
    clientReference: string,
): Promise<HubtelStatusResult> {
    const merchant = requiredEnv('HUBTEL_MERCHANT_ACCOUNT_NUMBER');
    const url = `${STATUS_BASE_URL}/${merchant}/transactions/status?clientReference=${encodeURIComponent(clientReference)}`;
    const res = await fetch(url, {
        method: 'GET',
        headers: {
            Accept: 'application/json',
            Authorization: buildAuthHeader(),
        },
        cache: 'no-store',
    });
    const raw = await parseJsonOrThrow<any>(res, 'status');
    return normalizeStatusResponse(raw);
}

/**
 * The RMSC status endpoint returns PascalCase fields with names different
 * from the ones in Hubtel's public Online Checkout docs, and `Data` comes
 * back as an array. Real shape observed:
 *
 *   {
 *     ResponseCode: "0000",
 *     Data: [{
 *       StartDate, InvoiceStatus, TransactionStatus,
 *       TransactionId, NetworkTransactionId, CheckoutId,
 *       ClientReference, CurrencyCode,
 *       TransactionAmount,   // amount the CUSTOMER paid (incl. customer-side fees)
 *       Fee,                 // merchant-side fee
 *       AmountAfterFees,     // amount the MERCHANT settles with
 *       PaymentMethod, MobileNumber, ProviderResponseCode, ProviderDescription
 *     }]
 *   }
 *
 * Coerce everything into the camelCase shape the callback / verify routes
 * expect, mapping both the documented names and the RMSC names.
 */
function normalizeStatusResponse(raw: any): HubtelStatusResult {
    const root = raw || {};
    let dataRaw: any = root.data ?? root.Data ?? {};
    if (Array.isArray(dataRaw)) {
        dataRaw = dataRaw[0] || {};
    }
    const toNumber = (v: unknown): number | undefined => {
        if (v === undefined || v === null || v === '') return undefined;
        const n = parseFloat(String(v));
        return Number.isFinite(n) ? n : undefined;
    };
    return {
        message: root.message ?? root.Message,
        responseCode: root.responseCode ?? root.ResponseCode,
        data: {
            date: dataRaw.date ?? dataRaw.Date ?? dataRaw.StartDate,
            status:
                dataRaw.status ??
                dataRaw.Status ??
                dataRaw.TransactionStatus ??
                dataRaw.InvoiceStatus,
            transactionId:
                dataRaw.transactionId ?? dataRaw.TransactionId ?? dataRaw.CheckoutId,
            externalTransactionId:
                dataRaw.externalTransactionId ??
                dataRaw.ExternalTransactionId ??
                dataRaw.NetworkTransactionId,
            paymentMethod: dataRaw.paymentMethod ?? dataRaw.PaymentMethod,
            clientReference: dataRaw.clientReference ?? dataRaw.ClientReference,
            currencyCode:
                dataRaw.currencyCode ?? dataRaw.CurrencyCode ?? null,
            // Money fields: prefer the documented names, fall back to RMSC's names.
            // `amount` / TransactionAmount = what the CUSTOMER paid (match order total).
            // `amountAfterCharges` / AmountAfterFees = merchant settlement AFTER Hubtel fee
            // (typically a few cedis below the order total — do NOT treat as the charge).
            amount: toNumber(
                dataRaw.amount ?? dataRaw.Amount ?? dataRaw.TransactionAmount,
            ),
            charges: toNumber(dataRaw.charges ?? dataRaw.Charges ?? dataRaw.Fee),
            amountAfterCharges: toNumber(
                dataRaw.amountAfterCharges ??
                    dataRaw.AmountAfterCharges ??
                    dataRaw.AmountAfterFees,
            ),
            isFulfilled: dataRaw.isFulfilled ?? dataRaw.IsFulfilled ?? null,
        },
    };
}

/**
 * Match Hubtel money fields against the store order/deposit total.
 * Prefer customer TransactionAmount; allow merchant AmountAfterFees slightly
 * below expected (Hubtel fee), or a small customer-side surcharge above.
 */
export function hubtelAmountMatchesExpected(
    expected: number,
    customerPaid: number | null | undefined,
    merchantSettlement: number | null | undefined,
): boolean {
    if (!(expected > 0)) return false;
    const customer =
        customerPaid !== null && customerPaid !== undefined && Number.isFinite(Number(customerPaid))
            ? Number(customerPaid)
            : null;
    const settlement =
        merchantSettlement !== null &&
        merchantSettlement !== undefined &&
        Number.isFinite(Number(merchantSettlement))
            ? Number(merchantSettlement)
            : null;

    if (customer !== null && Math.abs(customer - expected) <= 0.01) return true;
    if (
        customer !== null &&
        customer >= expected &&
        customer - expected <= Math.max(5, expected * 0.05)
    ) {
        return true;
    }
    // Merchant settlement is order total minus Hubtel fee (~1–3%).
    if (
        settlement !== null &&
        settlement <= expected + 0.01 &&
        expected - settlement <= Math.max(15, expected * 0.05)
    ) {
        return true;
    }
    return false;
}

async function parseJsonOrThrow<T = unknown>(res: Response, label: string): Promise<T> {
    const text = await res.text();
    try {
        return JSON.parse(text) as T;
    } catch {
        throw new Error(`Hubtel ${label}: non-JSON response (${res.status}) — ${text.slice(0, 200)}`);
    }
}

/**
 * Classifies a Hubtel status string / response code as a successful payment.
 *
 * IMPORTANT: Hubtel uses ResponseCode === "0000" to mean "this API/callback
 * request was received correctly" — NOT "payment succeeded". The actual
 * payment outcome lives in Data.Status / Data.TransactionStatus (Paid /
 * Failed / Unpaid / Pending). The old version of this helper returned true
 * for any non-empty, non-"unpaid" status whenever responseCode was "0000",
 * which silently confirmed payments Hubtel had explicitly marked Failed.
 *
 * Now: we only treat the payment as paid when the status string itself is
 * in the success set. If the status is missing AND the responseCode is
 * "0000", we still refuse to treat it as paid — the caller should re-query
 * (which the reconciler does) rather than guess.
 *
 * `responseCode` is kept in the signature for backward compatibility with
 * existing call sites; it is intentionally unused.
 */
export function isHubtelPaid(
    status: string | null | undefined,
    _responseCode?: string | null,
): boolean {
    const s = (status || '').trim().toLowerCase();
    return s === 'paid' || s === 'success' || s === 'successful' || s === 'completed';
}

export function isHubtelFailure(
    status: string | null | undefined,
    responseCode?: string | null,
): boolean {
    const s = (status || '').trim().toLowerCase();
    if (s === 'failed' || s === 'failure' || s === 'declined' || s === 'cancelled' || s === 'canceled') {
        return true;
    }
    const code = String(responseCode ?? '').trim();
    return code === '2001' || code === '4000' || code === '4070';
}

/**
 * Constructs a unique clientReference that fits inside Hubtel's 32-char limit.
 *
 * Layout: `<orderRef>-<flag><base36Timestamp>` truncated to 32 chars.
 *   flag = "r" → initial / retry checkout    (default — full or 50% deposit)
 *   flag = "b" → balance top-up on a partially_paid order
 *   flag = "d" → direct-receive (admin-assisted MoMo prompt)
 *
 * The callback handler strips the "-<flag><...>" suffix to recover the order
 * ref AND inspects the flag to decide whether to mark the order paid (full),
 * partially_paid (deposit), or paid-via-balance-collected (balance).
 */
export function makeHubtelClientReference(orderRef: string): string {
    return makeHubtelReferenceWithFlag(orderRef, 'r');
}

/**
 * Balance-payment variant. Same shape as makeHubtelClientReference but with
 * a "-b<ts>" suffix so the callback can route it through `mark_balance_collected`
 * instead of `mark_order_paid`.
 */
export function makeHubtelBalanceReference(orderRef: string): string {
    return makeHubtelReferenceWithFlag(orderRef, 'b');
}

function makeHubtelReferenceWithFlag(orderRef: string, flag: 'r' | 'b' | 'd'): string {
    const MAX = 32;
    const suffix = `-${flag}${Date.now().toString(36)}`;
    if (orderRef.length + suffix.length <= MAX) {
        return `${orderRef}${suffix}`;
    }
    return orderRef.slice(0, MAX);
}

/**
 * Recover the order ref from a Hubtel clientReference of any flag flavour.
 * Strips a trailing "-r...", "-b...", or "-d..." suffix.
 */
export function stripHubtelReferenceSuffix(ref: string): string {
    return ref.replace(/-[rbd][a-z0-9]+$/i, '');
}

/**
 * Inspect a Hubtel clientReference and tell us what KIND of payment it
 * represents. Used by the callback to pick the right RPC.
 */
export function hubtelReferenceKind(
    ref: string,
): 'initial' | 'balance' | 'direct' | 'unknown' {
    if (/-r[a-z0-9]+$/i.test(ref)) return 'initial';
    if (/-b[a-z0-9]+$/i.test(ref)) return 'balance';
    if (/-d[a-z0-9]+$/i.test(ref)) return 'direct';
    return 'unknown';
}

/**
 * Normalises a Ghana phone number into 233XXXXXXXXX. Accepts inputs like
 * "+233...", "0...", "233..." or 9-digit local numbers.
 */
export function normalizeGhPhone(input: string | null | undefined): string {
    const digits = String(input || '').replace(/\D+/g, '');
    if (!digits) return '';
    if (digits.startsWith('233')) return digits;
    if (digits.startsWith('0')) return `233${digits.slice(1)}`;
    if (digits.length === 9) return `233${digits}`;
    return digits;
}

// ---------------------------------------------------------------------------
// Direct Receive Money — admin-assisted MoMo prompt
// ---------------------------------------------------------------------------

export type HubtelMomoChannel = 'mtn-gh' | 'vodafone-gh' | 'tigo-gh';

/**
 * Detect the Mobile Money network from a Ghana phone number.
 *
 * Number plan (as of 2026):
 *   024 / 054 / 055 / 059 → MTN
 *   020 / 050             → Telecel (formerly Vodafone, kept as vodafone-gh
 *                                     because that's the channel Hubtel still uses)
 *   026 / 027 / 056 / 057 → AirtelTigo
 *
 * Returns null if we can't determine the network; in that case the admin UI
 * should ask the user to pick manually.
 */
export function detectMomoChannel(input: string | null | undefined): HubtelMomoChannel | null {
    const normalised = normalizeGhPhone(input);
    if (!normalised.startsWith('233') || normalised.length !== 12) return null;
    const local = normalised.slice(3); // drop country code, e.g. "591234567"
    const prefix3 = local.slice(0, 3); // e.g. "591"
    const prefix2 = local.slice(0, 2); // e.g. "59"

    if (['24', '54', '55', '59'].includes(prefix2)) return 'mtn-gh';
    if (['20', '50'].includes(prefix2)) return 'vodafone-gh';
    if (['26', '27', '56', '57'].includes(prefix2)) return 'tigo-gh';
    // Hubtel's docs also accept 3-digit splits in some flows; keep this as
    // a fallback for prefixes that happen to differ in the future.
    if (prefix3.startsWith('24') || prefix3.startsWith('54') || prefix3.startsWith('55') || prefix3.startsWith('59'))
        return 'mtn-gh';
    if (prefix3.startsWith('20') || prefix3.startsWith('50')) return 'vodafone-gh';
    if (prefix3.startsWith('26') || prefix3.startsWith('27') || prefix3.startsWith('56') || prefix3.startsWith('57'))
        return 'tigo-gh';
    return null;
}

export interface HubtelDirectReceivePayload {
    customerName: string;
    /** E.164-without-plus (e.g. "233241234567"). */
    customerMsisdn: string;
    /** "mtn-gh" | "vodafone-gh" | "tigo-gh". */
    channel: HubtelMomoChannel;
    /** Up to 2 decimal places. */
    amount: number;
    /** Server endpoint Hubtel POSTs the final status to. */
    primaryCallbackUrl: string;
    /** Short description shown to the customer on the USSD prompt. */
    description: string;
    /** Unique ref, <=32 chars. We tag with -d<ts> to distinguish from hosted. */
    clientReference: string;
}

export interface HubtelDirectReceiveResult {
    responseCode?: string;
    status?: string;
    message?: string;
    data?: {
        date?: string;
        transactionId?: string;
        clientReference?: string;
        amount?: number;
        charges?: number;
        amountAfterCharges?: number;
        description?: string;
    };
}

/**
 * Pushes a Mobile Money debit prompt directly to the customer's phone via
 * Hubtel. Used by the admin "Assist Payment" tool — the admin is on the
 * phone with the customer, the customer enters their MoMo PIN on the USSD
 * prompt, and the existing Hubtel callback finalises the order.
 *
 * Returns immediately with the transaction id; the actual outcome (paid /
 * failed / customer-cancelled) lands on /api/payment/hubtel/callback.
 */
export async function initiateHubtelDirectReceive(
    payload: HubtelDirectReceivePayload,
): Promise<HubtelDirectReceiveResult> {
    if (payload.clientReference.length > 32) {
        throw new Error(
            `Hubtel clientReference must be <=32 chars (got ${payload.clientReference.length})`,
        );
    }
    const merchant = requiredEnv('HUBTEL_MERCHANT_ACCOUNT_NUMBER');
    const url = `${DIRECT_RECEIVE_BASE_URL}/${encodeURIComponent(merchant)}/receive/mobilemoney`;

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: buildAuthHeader(),
        },
        body: JSON.stringify({
            CustomerName: payload.customerName,
            CustomerMsisdn: payload.customerMsisdn,
            Channel: payload.channel,
            Amount: payload.amount,
            PrimaryCallbackUrl: payload.primaryCallbackUrl,
            Description: payload.description,
            ClientReference: payload.clientReference,
            FeesOnCustomer: true,
        }),
    });

    const raw = await parseJsonOrThrow<any>(res, 'directReceive');
    // Hubtel sometimes returns PascalCase, sometimes camelCase. Normalise
    // the response so callers can rely on { responseCode, status, data: {...} }.
    return {
        responseCode: raw?.ResponseCode ?? raw?.responseCode,
        status: raw?.Status ?? raw?.status,
        message: raw?.Message ?? raw?.message,
        data: {
            date: raw?.Data?.Date ?? raw?.data?.date,
            transactionId: raw?.Data?.TransactionId ?? raw?.data?.transactionId,
            clientReference: raw?.Data?.ClientReference ?? raw?.data?.clientReference,
            amount: raw?.Data?.Amount ?? raw?.data?.amount,
            charges: raw?.Data?.Charges ?? raw?.data?.charges,
            amountAfterCharges: raw?.Data?.AmountAfterCharges ?? raw?.data?.amountAfterCharges,
            description: raw?.Data?.Description ?? raw?.data?.description,
        },
    };
}

/**
 * Builds a unique <=32-char client reference for a direct-receive attempt.
 * The "-d" prefix distinguishes assisted direct debits from hosted-checkout
 * "-r..." attempts in our logs.
 */
export function makeHubtelDirectReference(orderRef: string): string {
    const MAX = 32;
    const suffix = `-d${Date.now().toString(36)}`;
    if (orderRef.length + suffix.length <= MAX) return `${orderRef}${suffix}`;
    return orderRef.slice(0, MAX);
}
