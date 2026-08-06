import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendOrderConfirmation } from '@/lib/notifications';
import { fireMetaPurchaseForOrder } from '@/lib/meta-purchase';
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from '@/lib/rate-limit';
import {
    checkHubtelStatus,
    isHubtelPaid,
    stripHubtelReferenceSuffix,
} from '@/lib/hubtel';
import {
    markCallbackProcessed,
    recordCallbackEvent,
} from '@/lib/db/payment-records';

/**
 * Hubtel Online Checkout callback handler.
 * Re-verifies payment with Hubtel's status API before marking the order paid.
 */
export async function POST(req: Request) {
    console.log('[Hubtel Callback] POST received at', new Date().toISOString());

    try {
        const clientId = getClientIdentifier(req);
        const rateLimitResult = checkRateLimit(`hubtel-callback:${clientId}`, RATE_LIMITS.callback);
        if (!rateLimitResult.success) {
            return NextResponse.json({ success: false, message: 'Too many requests' }, { status: 429 });
        }

        let body: any = {};
        const contentType = req.headers.get('content-type') || '';
        try {
            if (contentType.includes('application/json')) {
                body = await req.json();
            } else if (contentType.includes('form')) {
                const formData = await req.formData();
                body = Object.fromEntries(formData.entries());
            } else {
                const raw = await req.text();
                try {
                    body = JSON.parse(raw);
                } catch {
                    body = Object.fromEntries(new URLSearchParams(raw).entries());
                }
            }
        } catch {
            return NextResponse.json({ success: false, message: 'Invalid request body' }, { status: 400 });
        }

        const responseCode = body.ResponseCode ?? body.responseCode ?? body.code;
        const topStatus = body.Status ?? body.status;
        const data = body.Data ?? body.data ?? {};

        const rawClientReference = (
            data.ClientReference ??
            data.clientReference ??
            body.ClientReference ??
            body.clientReference ??
            ''
        ).toString();
        const merchantOrderRef = stripHubtelReferenceSuffix(rawClientReference);

        const checkoutId = (data.CheckoutId ?? data.checkoutId ?? body.CheckoutId ?? '').toString();
        const callbackAmount =
            data.Amount !== undefined && data.Amount !== null
                ? parseFloat(String(data.Amount))
                : null;

        if (!merchantOrderRef) {
            console.error('[Hubtel Callback] Missing client reference');
            return NextResponse.json({ success: false, message: 'Missing client reference' }, { status: 400 });
        }

        const callbackEvent = await recordCallbackEvent({
            gateway: 'hubtel',
            eventType: String(topStatus || responseCode || 'callback'),
            externalEventId: checkoutId || null,
            internalReference: rawClientReference || null,
            gatewayReference: checkoutId || null,
            orderNumber: merchantOrderRef,
            payload: {
                ResponseCode: responseCode,
                Status: topStatus,
                ClientReference: rawClientReference,
                CheckoutId: checkoutId,
                Amount: callbackAmount,
            },
            signatureStatus: 'unchecked',
        });

        if (callbackEvent.alreadyProcessed) {
            return NextResponse.json({ success: true, message: 'Callback already processed' });
        }

        const innerStatus = String(data.Status ?? topStatus ?? '').toLowerCase();
        const looksSuccessful =
            isHubtelPaid(String(topStatus || ''), responseCode) || isHubtelPaid(innerStatus, responseCode);

        const { data: existingOrder, error: fetchError } = await supabaseAdmin
            .from('orders')
            .select('id, order_number, payment_status, total, email, metadata')
            .eq('order_number', merchantOrderRef)
            .single();

        if (fetchError || !existingOrder) {
            console.error('[Hubtel Callback] Order not found:', merchantOrderRef);
            await markCallbackProcessed(callbackEvent.eventId, 'failed', 'Order not found');
            return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
        }

        const expectedAmount = Number(existingOrder.total) || 0;

        if (existingOrder.payment_status === 'paid') {
            await markCallbackProcessed(callbackEvent.eventId, 'ignored', 'Order already paid');
            return NextResponse.json({ success: true, message: 'Order already processed' });
        }

        if (!looksSuccessful) {
            console.log('[Hubtel Callback] Recording failure for', merchantOrderRef);
            await supabaseAdmin
                .from('orders')
                .update({
                    payment_status: 'failed',
                    metadata: {
                        ...(existingOrder.metadata || {}),
                        hubtel_checkout_id: checkoutId || null,
                        hubtel_response_code: String(responseCode || ''),
                        failure_reason: data.Description || body.Message || 'Payment failed',
                    },
                })
                .eq('order_number', merchantOrderRef);

            await markCallbackProcessed(
                callbackEvent.eventId,
                'processed',
                'Payment not successful at gateway'
            );
            return NextResponse.json({ success: false, message: 'Payment not successful' });
        }

        let serverConfirmed = false;
        let confirmedSettlement: number | null = null;
        try {
            const status = await checkHubtelStatus(rawClientReference || merchantOrderRef);
            const sStatus = String(status?.data?.status || '').toLowerCase();
            serverConfirmed = isHubtelPaid(sStatus, status?.responseCode);
            const settlement = status?.data?.amountAfterCharges ?? status?.data?.amount;
            if (settlement !== undefined && settlement !== null) {
                const n = parseFloat(String(settlement));
                if (Number.isFinite(n)) confirmedSettlement = n;
            }
        } catch (e: any) {
            console.warn('[Hubtel Callback] Status re-verification failed:', e?.message || e);
        }

        if (!serverConfirmed) {
            // Keep order pending — reconciler / verify will retry. Do not leave callback "received" forever.
            console.error('[Hubtel Callback] Status endpoint did not confirm payment. Leaving pending for reconcile.');
            await markCallbackProcessed(
                callbackEvent.eventId,
                'failed',
                'Status API did not confirm paid — retry via reconcile'
            );
            return NextResponse.json(
                { success: false, message: 'Payment not confirmed by gateway' },
                { status: 400 },
            );
        }

        const amountToCheck = confirmedSettlement ?? callbackAmount;
        if (amountToCheck !== null && Math.abs(amountToCheck - expectedAmount) > 0.01) {
            // Allow small customer-side fee surcharge when settlement missing
            const surchargeOk =
                confirmedSettlement === null &&
                callbackAmount !== null &&
                callbackAmount >= expectedAmount &&
                callbackAmount - expectedAmount <= Math.max(5, expectedAmount * 0.05);
            if (!surchargeOk) {
                console.error(
                    '[Hubtel Callback] AMOUNT MISMATCH! Expected:',
                    expectedAmount,
                    'Got:',
                    amountToCheck,
                );
                await markCallbackProcessed(
                    callbackEvent.eventId,
                    'failed',
                    `Amount mismatch expected=${expectedAmount} got=${amountToCheck}`
                );
                return NextResponse.json(
                    { success: false, message: 'Payment amount does not match expected charge' },
                    { status: 400 },
                );
            }
        }

        const { data: orderJson, error: updateError } = await supabaseAdmin.rpc('mark_order_paid', {
            order_ref: merchantOrderRef,
            moolre_ref: checkoutId || 'hubtel-callback',
        });

        if (updateError) {
            console.error('[Hubtel Callback] RPC error:', updateError.message);
            await markCallbackProcessed(callbackEvent.eventId, 'failed', updateError.message);
            return NextResponse.json(
                { success: false, message: 'Database update failed' },
                { status: 500 },
            );
        }

        if (!orderJson) {
            await markCallbackProcessed(callbackEvent.eventId, 'failed', 'Order not found after RPC');
            return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
        }

        await markCallbackProcessed(callbackEvent.eventId, 'processed');

        try {
            if (orderJson.email) {
                await supabaseAdmin.rpc('update_customer_stats', {
                    p_customer_email: orderJson.email,
                    p_order_total: orderJson.total,
                });
            }
        } catch (e: any) {
            console.error('[Hubtel Callback] Customer stats failed:', e?.message || e);
        }

        try {
            await sendOrderConfirmation(orderJson);
        } catch (e: any) {
            console.error('[Hubtel Callback] Notification failed:', e?.message || e);
        }

        void fireMetaPurchaseForOrder(orderJson);

        return NextResponse.json({ success: true, message: 'Payment verified and order updated' });
    } catch (error: any) {
        console.error('[Hubtel Callback] Critical error:', error?.message || error);
        return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
    }
}

export async function GET() {
    return NextResponse.json({
        message: 'Hubtel callback endpoint ready',
        timestamp: new Date().toISOString(),
    });
}
