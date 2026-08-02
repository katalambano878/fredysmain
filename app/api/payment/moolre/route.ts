import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from '@/lib/rate-limit';
import { recordPaymentAttempt } from '@/lib/db/payment-records';

export async function POST(req: Request) {
    try {
        // Rate limiting
        const clientId = getClientIdentifier(req);
        const rateLimitResult = checkRateLimit(`payment:${clientId}`, RATE_LIMITS.payment);

        if (!rateLimitResult.success) {
            return NextResponse.json(
                { success: false, message: 'Too many requests. Please try again later.' },
                {
                    status: 429,
                    headers: {
                        'X-RateLimit-Remaining': '0',
                        'X-RateLimit-Reset': rateLimitResult.resetIn.toString()
                    }
                }
            );
        }

        const body = await req.json();
        const { orderId, customerEmail, redirectUrl } = body;

        if (!orderId || typeof orderId !== 'string') {
            return NextResponse.json({ success: false, message: 'Missing or invalid orderId' }, { status: 400 });
        }

        // Ensure environment variables are set
        const missingVars: string[] = [];
        if (!process.env.MOOLRE_API_USER) missingVars.push('MOOLRE_API_USER');
        if (!process.env.MOOLRE_API_PUBKEY) missingVars.push('MOOLRE_API_PUBKEY');
        if (!process.env.MOOLRE_ACCOUNT_NUMBER) missingVars.push('MOOLRE_ACCOUNT_NUMBER');
        if (missingVars.length > 0) {
            console.error('Missing Moolre credentials:', missingVars.join(', '));
            return NextResponse.json({ success: false, message: `Payment gateway configuration error. Missing: ${missingVars.join(', ')}` }, { status: 500 });
        }

        const moolreApiUser = process.env.MOOLRE_API_USER as string;
        const moolreApiPubkey = process.env.MOOLRE_API_PUBKEY as string;

        // SECURITY: Fetch the order from the database and use its total.
        // NEVER trust the amount from the client.
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId);
        const query = supabaseAdmin
            .from('orders')
            .select('id, order_number, total, email, payment_status');

        const { data: order, error: orderError } = isUUID
            ? await query.eq('id', orderId).single()
            : await query.eq('order_number', orderId).single();

        if (orderError || !order) {
            console.error('[Payment] Order not found:', orderId);
            return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
        }

        if (order.payment_status === 'paid') {
            return NextResponse.json({ success: false, message: 'Order is already paid' }, { status: 400 });
        }

        // Stock validation: block payment only if items are confirmed out of stock.
        // Preorder items are explicitly allowed to proceed even when quantity = 0.
        // Note: products.status is the canonical availability column ('active'/'draft'/'archived').
        try {
            const { data: orderItems, error: itemsError } = await supabaseAdmin
                .from('order_items')
                .select('quantity, product_id, is_preorder, metadata, products(name, quantity, status)')
                .eq('order_id', order.id);

            if (itemsError) {
                console.warn('[Payment] Stock check query failed (non-blocking):', itemsError.message);
            } else if (orderItems && orderItems.length > 0) {
                const outOfStock: string[] = [];
                for (const item of orderItems) {
                    const product = (item as any).products;
                    if (!product) continue;
                    const isPreorder = (item as any).is_preorder === true || (item as any).metadata?.is_preorder === true;
                    if (isPreorder) continue; // Preorder items bypass stock validation
                    if (product.status && product.status !== 'active') {
                        outOfStock.push(`${product.name} is no longer available`);
                    } else if (product.quantity < item.quantity) {
                        outOfStock.push(
                            product.quantity === 0
                                ? `${product.name} is out of stock`
                                : `${product.name} — only ${product.quantity} left (you ordered ${item.quantity})`
                        );
                    }
                }
                if (outOfStock.length > 0) {
                    console.log('[Payment] Blocked — out of stock items:', outOfStock);
                    return NextResponse.json({
                        success: false,
                        message: `Some items are out of stock: ${outOfStock.join('; ')}`,
                        outOfStock,
                    }, { status: 409 });
                }
            }
        } catch (stockErr: any) {
            console.warn('[Payment] Stock check exception (non-blocking):', stockErr.message);
        }

        const amount = Number(order.total);
        if (!amount || amount <= 0) {
            return NextResponse.json({ success: false, message: 'Invalid order amount' }, { status: 400 });
        }

        const orderRef = order.order_number || orderId;

        const requestUrl = new URL(req.url);
        const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || requestUrl.origin).replace(/\/+$/, '');

        const successEmail = encodeURIComponent(
            String(customerEmail || order.email || '').trim().toLowerCase()
        );
        const defaultRedirectUrl = `${baseUrl}/order-success?order=${encodeURIComponent(orderRef)}&payment_success=true${successEmail ? `&email=${successEmail}` : ''}`;
        const allowedPrefixes = ['https://'];
        const safeRedirectUrl =
            typeof redirectUrl === 'string' &&
                allowedPrefixes.some((prefix) => redirectUrl.startsWith(prefix))
                ? redirectUrl
                : defaultRedirectUrl;

        // Generate a unique external reference for Moolre
        const uniqueRef = `${orderRef}-R${Date.now()}`;

        // Moolre Payload
        const payload = {
            type: 1,
            amount: amount.toString(),
            email: process.env.MOOLRE_MERCHANT_EMAIL || 'admin@frebysfashion.com',
            externalref: uniqueRef,
            callback: `${baseUrl}/api/payment/moolre/callback`,
            redirect: safeRedirectUrl,
            reusable: "0",
            currency: "GHS",
            accountnumber: process.env.MOOLRE_ACCOUNT_NUMBER,
            metadata: {
                customer_email: customerEmail || order.email,
                original_order_number: orderRef
            }
        };

        console.log('[Payment] Initiating for order:', orderRef, '| Amount from DB:', amount, '| Callback:', payload.callback);

        const response = await fetch('https://api.moolre.com/embed/link', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-USER': moolreApiUser,
                'X-API-PUBKEY': moolreApiPubkey
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        console.log('[Payment] Response status:', result.status, '| Has URL:', !!result.data?.authorization_url);

        if (result.status === 1 && result.data?.authorization_url) {
            await recordPaymentAttempt({
                orderId: order.id,
                orderNumber: orderRef,
                gateway: 'moolre',
                internalReference: uniqueRef,
                gatewayReference: result.data.reference || null,
                expectedAmount: amount,
                customerEmail: customerEmail || order.email || null,
                initiationPayload: {
                    externalref: uniqueRef,
                    callback: payload.callback,
                },
                gatewayResponse: { reference: result.data.reference, status: result.status },
                status: 'processing',
            });
            return NextResponse.json({
                success: true,
                url: result.data.authorization_url,
                reference: result.data.reference,
                externalRef: uniqueRef
            });
        } else {
            await recordPaymentAttempt({
                orderId: order.id,
                orderNumber: orderRef,
                gateway: 'moolre',
                internalReference: uniqueRef,
                expectedAmount: amount,
                customerEmail: customerEmail || order.email || null,
                initiationPayload: { externalref: uniqueRef },
                gatewayResponse: { message: result.message, status: result.status },
                status: 'failed',
            });
            return NextResponse.json({ success: false, message: result.message || 'Failed to generate payment link' }, { status: 400 });
        }

    } catch (error: any) {
        console.error('Payment API Error:', error);
        return NextResponse.json({ success: false, message: 'Internal Server Error' }, { status: 500 });
    }
}
