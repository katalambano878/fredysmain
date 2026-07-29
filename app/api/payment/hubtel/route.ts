import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from '@/lib/rate-limit';
import {
    initiateHubtelCheckout,
    makeHubtelClientReference,
    normalizeGhPhone,
} from '@/lib/hubtel';

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
        const { orderId, customerEmail, redirectUrl } = body;

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
            'id, order_number, total, email, phone, payment_status, shipping_address, metadata, order_items(quantity, product_id, is_preorder, metadata, products(name, quantity, status))';
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

        const orderItems = (order as any).order_items as Array<{
            quantity: number;
            product_id: string;
            is_preorder?: boolean;
            metadata?: { is_preorder?: boolean };
            products: { name: string; quantity: number; status: string } | null;
        }> | null;

        if (orderItems && orderItems.length > 0) {
            const outOfStock: string[] = [];
            for (const item of orderItems) {
                const product = item.products;
                if (!product) continue;
                const isPreorder =
                    item.is_preorder === true || item.metadata?.is_preorder === true;
                if (isPreorder) continue;
                if (product.status && product.status !== 'active') {
                    outOfStock.push(`${product.name} is no longer available`);
                } else if (product.quantity < item.quantity) {
                    outOfStock.push(
                        product.quantity === 0
                            ? `${product.name} is out of stock`
                            : `${product.name} — only ${product.quantity} left (you ordered ${item.quantity})`,
                    );
                }
            }
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

        const orderTotal = Number(order.total);
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

        supabaseAdmin
            .from('orders')
            .update({ metadata: persistedMetadata })
            .eq('id', order.id)
            .then(({ error }) => {
                if (error) console.warn('[Hubtel] Metadata update failed:', error.message);
            });

        const requestUrl = new URL(req.url);
        const publicBaseUrl = (process.env.NEXT_PUBLIC_APP_URL || requestUrl.origin).replace(/\/+$/, '');

        const successEmail = encodeURIComponent(
            String(customerEmail || order.email || '').trim().toLowerCase()
        );
        const defaultRedirectUrl = `${publicBaseUrl}/order-success?order=${encodeURIComponent(orderRef)}&payment_success=true${successEmail ? `&email=${successEmail}` : ''}`;
        const allowedPrefixes = ['https://'];
        const safeRedirectUrl =
            typeof redirectUrl === 'string' &&
            allowedPrefixes.some((prefix) => redirectUrl.startsWith(prefix))
                ? redirectUrl
                : defaultRedirectUrl;

        const cancellationUrl = `${publicBaseUrl}/pay/${orderRef}?cancelled=true`;
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
            return NextResponse.json(
                { success: false, message: `Hubtel: ${upstreamMessage}` },
                { status: 502 },
            );
        }

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
