import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendOrderConfirmation } from '@/lib/notifications';
import { fireMetaPurchaseForOrder } from '@/lib/meta-purchase';
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from '@/lib/rate-limit';
import { checkHubtelStatus, isHubtelPaid, hubtelAmountMatchesExpected } from '@/lib/hubtel';

/**
 * Server-side Hubtel verification, called from /order-success after the
 * customer returns from the hosted checkout.
 */
export async function POST(req: Request) {
    try {
        const clientId = getClientIdentifier(req);
        const rateLimitResult = checkRateLimit(`hubtel-verify:${clientId}`, RATE_LIMITS.payment);
        if (!rateLimitResult.success) {
            return NextResponse.json({ success: false, message: 'Too many requests' }, { status: 429 });
        }

        const { orderNumber, externalRef } = await req.json();

        if (!orderNumber || typeof orderNumber !== 'string') {
            return NextResponse.json(
                { success: false, message: 'Missing or invalid orderNumber' },
                { status: 400 },
            );
        }

        if (!/^[A-Z0-9-]{8,64}$/.test(orderNumber)) {
            return NextResponse.json({ success: false, message: 'Invalid order number format' }, { status: 400 });
        }

        const normalizedExternalRef =
            typeof externalRef === 'string' && /^[A-Za-z0-9-]{4,32}$/.test(externalRef)
                ? externalRef
                : null;

        if (normalizedExternalRef && !normalizedExternalRef.startsWith(orderNumber)) {
            return NextResponse.json(
                { success: false, message: 'Invalid external reference for order' },
                { status: 400 },
            );
        }

        const { data: order, error: fetchError } = await supabaseAdmin
            .from('orders')
            .select('id, order_number, payment_status, status, total, email, metadata')
            .eq('order_number', orderNumber)
            .single();

        if (fetchError || !order) {
            return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
        }

        const expectedAmount = Number(order.total) || 0;

        if (order.payment_status === 'paid') {
            return NextResponse.json({
                success: true,
                status: order.status,
                payment_status: order.payment_status,
                message: 'Order already paid',
            });
        }

        if (
            !process.env.HUBTEL_API_ID ||
            !process.env.HUBTEL_API_KEY ||
            !process.env.HUBTEL_MERCHANT_ACCOUNT_NUMBER
        ) {
            return NextResponse.json(
                {
                    success: false,
                    status: order.status,
                    payment_status: order.payment_status,
                    message: 'Payment verification unavailable',
                },
                { status: 503 },
            );
        }

        const hubtelRef =
            normalizedExternalRef ||
            (order.metadata as any)?.hubtel_client_reference ||
            orderNumber;

        let verified = false;
        let customerPaid: number | null = null;
        let settlementAmount: number | null = null;
        try {
            const status = await checkHubtelStatus(hubtelRef);
            const sStatus = String(status?.data?.status || '').toLowerCase();
            verified = isHubtelPaid(sStatus, status?.responseCode);
            if (status?.data?.amount !== undefined && status?.data?.amount !== null) {
                const n = parseFloat(String(status.data.amount));
                if (Number.isFinite(n)) customerPaid = n;
            }
            if (
                status?.data?.amountAfterCharges !== undefined &&
                status?.data?.amountAfterCharges !== null
            ) {
                const n = parseFloat(String(status.data.amountAfterCharges));
                if (Number.isFinite(n)) settlementAmount = n;
            }
        } catch (e: any) {
            console.warn('[Hubtel Verify] Status API failed:', e?.message || e);
        }

        if (
            verified &&
            !hubtelAmountMatchesExpected(expectedAmount, customerPaid, settlementAmount)
        ) {
            console.error(
                '[Hubtel Verify] AMOUNT MISMATCH. Expected:',
                expectedAmount,
                'customer:',
                customerPaid,
                'settlement:',
                settlementAmount,
            );
            verified = false;
        }

        if (!verified) {
            return NextResponse.json({
                success: false,
                status: order.status,
                payment_status: order.payment_status,
                message: 'Payment not yet confirmed by payment provider',
            });
        }

        const { data: orderJson, error: updateError } = await supabaseAdmin.rpc('mark_order_paid', {
            order_ref: orderNumber,
            moolre_ref: 'hubtel-api-verify',
        });

        if (updateError) {
            return NextResponse.json({ success: false, message: 'Failed to update order' }, { status: 500 });
        }

        if (orderJson?.email) {
            try {
                await supabaseAdmin.rpc('update_customer_stats', {
                    p_customer_email: orderJson.email,
                    p_order_total: orderJson.total,
                });
            } catch (e: any) {
                console.error('[Hubtel Verify] Stats failed:', e?.message || e);
            }
        }

        if (orderJson) {
            try {
                await sendOrderConfirmation(orderJson);
            } catch (e: any) {
                console.error('[Hubtel Verify] Notification failed:', e?.message || e);
            }
            void fireMetaPurchaseForOrder(orderJson);
        }

        return NextResponse.json({
            success: true,
            status: 'processing',
            payment_status: 'paid',
            message: 'Payment verified and order updated',
        });
    } catch (error: any) {
        console.error('[Hubtel Verify] Error:', error?.message || error);
        return NextResponse.json({ success: false, message: 'Internal error' }, { status: 500 });
    }
}
