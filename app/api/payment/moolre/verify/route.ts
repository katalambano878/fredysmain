import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendOrderConfirmation } from '@/lib/notifications';
import { fireMetaPurchaseForOrder } from '@/lib/meta-purchase';
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from '@/lib/rate-limit';

/**
 * Payment verification endpoint.
 * Called from the order-success page after the user completes payment on Moolre.
 * 
 * SECURITY: We ONLY trust Moolre's API response for payment verification.
 */
export async function POST(req: Request) {
    try {
        // Rate limiting
        const clientId = getClientIdentifier(req);
        const rateLimitResult = checkRateLimit(`verify:${clientId}`, RATE_LIMITS.payment);

        if (!rateLimitResult.success) {
            return NextResponse.json(
                { success: false, message: 'Too many requests' },
                { status: 429 }
            );
        }

        const { orderNumber, externalRef } = await req.json();

        if (!orderNumber || typeof orderNumber !== 'string') {
            return NextResponse.json({ success: false, message: 'Missing or invalid orderNumber' }, { status: 400 });
        }

        if (!/^[A-Z0-9-]{8,64}$/.test(orderNumber)) {
            return NextResponse.json({ success: false, message: 'Invalid order number format' }, { status: 400 });
        }

        const normalizedExternalRef =
            typeof externalRef === 'string' && /^[A-Z0-9-]{8,96}$/.test(externalRef)
                ? externalRef
                : null;

        if (normalizedExternalRef && !normalizedExternalRef.startsWith(orderNumber)) {
            return NextResponse.json({ success: false, message: 'Invalid external reference for order' }, { status: 400 });
        }

        console.log('[Verify] Checking payment for:', orderNumber);

        const { data: order, error: fetchError } = await supabaseAdmin
            .from('orders')
            .select('id, order_number, payment_status, status, total, email, phone, shipping_address, metadata')
            .eq('order_number', orderNumber)
            .single();

        if (fetchError || !order) {
            console.error('[Verify] Order not found:', orderNumber);
            return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
        }

        if (order.payment_status === 'paid') {
            console.log('[Verify] Order already paid:', orderNumber);
            return NextResponse.json({
                success: true,
                status: order.status,
                payment_status: order.payment_status,
                message: 'Order already paid'
            });
        }

        if (order.metadata?.payment_method && order.metadata.payment_method !== 'moolre') {
            return NextResponse.json({
                success: false,
                message: 'This order does not use Moolre payment'
            }, { status: 400 });
        }

        let moolreApiVerified = false;

        if (!process.env.MOOLRE_API_USER || !process.env.MOOLRE_API_PUBKEY) {
            console.error('[Verify] Missing Moolre API credentials');
            return NextResponse.json({
                success: false,
                status: order.status,
                payment_status: order.payment_status,
                message: 'Payment verification unavailable'
            }, { status: 503 });
        }

        try {
            const checkResponse = await fetch('https://api.moolre.com/embed/status', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-USER': process.env.MOOLRE_API_USER,
                    'X-API-PUBKEY': process.env.MOOLRE_API_PUBKEY
                },
                body: JSON.stringify({ externalref: normalizedExternalRef || orderNumber })
            });

            const checkResult = await checkResponse.json();
            console.log('[Verify] Moolre API response:', JSON.stringify(checkResult));

            const statusStr = String(checkResult.data?.status || '').toLowerCase();
            moolreApiVerified =
                (checkResult.status === 1 && checkResult.data) &&
                (statusStr === 'success' || statusStr === 'successful' || statusStr === 'completed' || statusStr === 'paid');

            if (moolreApiVerified && checkResult.data?.amount) {
                const paidAmount = parseFloat(checkResult.data.amount);
                const expectedAmount = Number(order.total);
                if (Math.abs(paidAmount - expectedAmount) > 0.01) {
                    console.error('[Verify] AMOUNT MISMATCH! Expected:', expectedAmount, 'Got:', paidAmount);
                    moolreApiVerified = false;
                }
            }

        } catch (moolreError: any) {
            console.warn('[Verify] Moolre API check failed:', moolreError.message);
        }

        if (!moolreApiVerified) {
            console.log('[Verify] Cannot verify payment for:', orderNumber);
            return NextResponse.json({
                success: false,
                status: order.status,
                payment_status: order.payment_status,
                message: 'Payment not yet confirmed by payment provider'
            });
        }

        console.log('[Verify] Marking order paid via moolre-api for:', orderNumber);

        const { data: orderJson, error: updateError } = await supabaseAdmin
            .rpc('mark_order_paid', {
                order_ref: orderNumber,
                moolre_ref: 'moolre-api-verify'
            });

        if (updateError) {
            console.error('[Verify] RPC Error:', updateError.message);
            return NextResponse.json({ success: false, message: 'Failed to update order' }, { status: 500 });
        }

        console.log('[Verify] Order marked as paid:', orderNumber);

        if (orderJson?.email) {
            try {
                await supabaseAdmin.rpc('update_customer_stats', {
                    p_customer_email: orderJson.email,
                    p_order_total: orderJson.total
                });
            } catch (statsError: any) {
                console.error('[Verify] Customer stats failed:', statsError.message);
            }
        }

        if (orderJson) {
            try {
                await sendOrderConfirmation(orderJson);
                console.log('[Verify] Notifications sent for:', orderNumber);
            } catch (notifyError: any) {
                console.error('[Verify] Notification failed:', notifyError.message);
            }
            void fireMetaPurchaseForOrder(orderJson);
        }

        return NextResponse.json({
            success: true,
            status: 'processing',
            payment_status: 'paid',
            message: 'Payment verified and order updated'
        });

    } catch (error: any) {
        console.error('[Verify] Error:', error.message);
        return NextResponse.json({ success: false, message: 'Internal error' }, { status: 500 });
    }
}
