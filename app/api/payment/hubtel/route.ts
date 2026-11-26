import { amountDue } from '@/lib/order-amounts';
import { findOutOfStock } from '@/lib/order-stock';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from '@/lib/rate-limit';
import {
    initiateHubtelCheckout,
    makeHubtelClientReference,
    normalizeGhPhone,
} from '@/lib/hubtel';
import { recordPaymentAttempt } from '@/lib/db/payment-records';

/**
 * Starts a Hubtel Online Checkout session for an order and returns the
 * URL we should redirect the customer to.
 */
export async function POST(req: Request) {
    try {
        const clientId = getClientIdentifier(req);
        const rateLimitResult = checkRateLimit(`hubtel:${clientId}`, RATE_LIMITS.payment);
        if (!rateLimitResult.success) {
            return NextResponse.json(
                { success: false, message: 'Too many requests. Please try again later.' },
                {
                    status: 429,
                    headers: {
                        'X-RateLimit-Remaining': '0',
                        'X-RateLimit-Reset': rateLimitResult.resetIn.toString(),
                    },
                },
            );
        }

        const body = await req.json();
        const { orderId, customerEmail } = body;

        if (!orderId || typeof orderId !== 'string') {
            return NextResponse.json(
                { success: false, message: 'Missing or invalid orderId' },
                { status: 400 },
            );
        }

        if (
            !process.env.HUBTEL_API_ID ||
            !process.env.HUBTEL_API_KEY ||
            !process.env.HUBTEL_MERCHANT_ACCOUNT_NUMBER
        ) {
            console.error('[Hubtel] Missing credentials');
            return NextResponse.json(
                { success: false, message: 'Payment gateway configuration error' },
                { status: 500 },
            );
        }

        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId);
        const orderSelect =
            'id, order_number, total, email, phone, payment_status, shipping_address, metadata, order_items(quantity, product_id, product_name, variant_name, variant_id, is_preorder, metadata)';
        const query = supabaseAdmin.from('orders').select(orderSelect);

        const { data: order, error: orderError } = isUUID
            ? await query.eq('id', orderId).single()
            : await query.eq('order_number', orderId).single();

        if (orderError || !order) {
            console.error('[Hubtel] Order not found:', orderId);
            return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
        }

        if (order.payment_status === 'paid') {
            return NextResponse.json(
                { success: false, message: 'Order is already paid' },
                { status: 400 },
            );
        }

        const orderItems = (order as any).order_items as any[] | null;

        if (orderItems && orderItems.length > 0) {
            // Counted on the size that was ordered, not on the product row.
            const outOfStock = await findOutOfStock(orderItems);
            if (outOfStock.length > 0) {
                return NextResponse.json(
                    {
                        success: false,
                        message: `Some items are out of stock: ${outOfStock.join('; ')}`,
                        outOfStock,
                    },
                    { status: 409 },
                );
            }
        }

        // What is still owed: the total, or only the balance when a deposit was already taken.
        const orderTotal = amountDue(order);
        if (!orderTotal || orderTotal <= 0) {
            return NextResponse.json({ success: false, message: 'Invalid order amount' }, { status: 400 });
        }

        const roundedAmount = Math.round(orderTotal * 100) / 100;
        const orderRef = order.order_number || orderId;
        const clientReference = makeHubtelClientReference(orderRef);

        const persistedMetadata = {
            ...(order.metadata || {}),
            payment_gateway: 'hubtel',
            payment_method: 'hubtel',
            hubtel_client_reference: clientReference,
            hubtel_initiated_at: new Date().toISOString(),
        };

        // Saved before the shopper is sent to Hubtel, so a callback can never arrive first and be overwritten.
        const { error: metadataError } = await supabaseAdmin
            .from('orders')
            .update({ metadata: persistedMetadata })
            .eq('id', order.id);
        if (metadataError) console.warn('[Hubtel] Metadata update failed:', metadataError.message);

        const requestUrl = new URL(req.url);
        const publicBaseUrl = (process.env.NEXT_PUBLIC_APP_URL || requestUrl.origin).replace(/\/+$/, '');

        const successEmail = encodeURIComponent(
            String(customerEmail || order.email || '').trim().toLowerCase()
        );
        const defaultRedirectUrl = `${publicBaseUrl}/order-success?order=${encodeURIComponent(orderRef)}&payment_success=true${successEmail ? `&email=${successEmail}` : ''}`;
        // The return address is always this shop. A caller-supplied address could send shoppers anywhere.
        const safeRedirectUrl = defaultRedirectUrl;

        // By order id: the pay page can open that without asking for an email, so "cancel" lands on a page that works.
        const cancellationUrl = `${publicBaseUrl}/pay/${order.id}?cancelled=true`;
        const shipping = (order.shipping_address as any) || {};
        const customerName =
            [shipping.firstName, shipping.lastName].filter(Boolean).join(' ').trim() ||
            customerEmail ||
            order.email ||
            'Customer';
        const customerPhone = normalizeGhPhone(order.phone || shipping.phone || '');
        const customerMail = customerEmail || order.email || undefined;

        const payload = {
            totalAmount: roundedAmount,
            description: `Order ${orderRef}`,
            callbackUrl: `${publicBaseUrl}/api/payment/hubtel/callback`,
            returnUrl: safeRedirectUrl,
            cancellationUrl,
            merchantAccountNumber: process.env.HUBTEL_MERCHANT_ACCOUNT_NUMBER,
            clientReference,
            ...(customerName ? { payeeName: customerName } : {}),
            ...(customerPhone ? { payeeMobileNumber: customerPhone } : {}),
            ...(customerMail ? { payeeEmail: customerMail } : {}),
        };

        console.log('[Hubtel] Initiating | order:', orderRef, '| amount:', roundedAmount);

        const result = await initiateHubtelCheckout(payload as any);
        const checkoutUrl = result?.data?.checkoutUrl || result?.data?.checkoutDirectUrl;
        const checkoutId = result?.data?.checkoutId;

        if (!checkoutUrl) {
            console.error('[Hubtel] No checkout URL in response:', JSON.stringify(result));
            const upstreamMessage =
                result?.message ||
                (result as any)?.data?.message ||
                'Failed to generate payment link';
            await recordPaymentAttempt({
                orderId: order.id,
                orderNumber: orderRef,
                gateway: 'hubtel',
                internalReference: clientReference,
                expectedAmount: roundedAmount,
                customerEmail: customerMail || null,
                customerPhone: customerPhone || null,
                initiationPayload: { description: payload.description },
                gatewayResponse: { message: upstreamMessage },
                status: 'failed',
            });
            return NextResponse.json(
                { success: false, message: `Hubtel: ${upstreamMessage}` },
                { status: 502 },
            );
        }

        await recordPaymentAttempt({
            orderId: order.id,
            orderNumber: orderRef,
            gateway: 'hubtel',
            internalReference: clientReference,
            gatewayReference: checkoutId || null,
            expectedAmount: roundedAmount,
            customerEmail: customerMail || null,
            customerPhone: customerPhone || null,
            initiationPayload: {
                description: payload.description,
                callbackUrl: payload.callbackUrl,
            },
            gatewayResponse: {
                checkoutId,
                hasCheckoutUrl: true,
            },
            status: 'processing',
        });

        return NextResponse.json({
            success: true,
            url: checkoutUrl,
            checkoutDirectUrl: result?.data?.checkoutDirectUrl || null,
            checkoutId,
            externalRef: clientReference,
            reference: checkoutId || clientReference,
            amount: roundedAmount,
        });
    } catch (error: any) {
        console.error('[Hubtel] Init error:', error?.message || error);
        return NextResponse.json(
            { success: false, message: 'Internal Server Error' },
            { status: 500 },
        );
    }
}
