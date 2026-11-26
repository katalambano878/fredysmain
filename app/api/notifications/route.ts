import { denyUnlessPermission } from '@/lib/admin-route-auth';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyAuth } from '@/lib/auth';
import { escapeHtml } from '@/lib/sanitize';
import { sendOrderConfirmation, sendOrderStatusUpdate, sendWelcomeMessage, sendContactMessage, sendPaymentLink, sendEmail, sendSMS, emailLayout } from '@/lib/notifications';
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from '@/lib/rate-limit';

export async function POST(request: Request) {
    try {
        // Rate limiting
        const clientId = getClientIdentifier(request);
        const rateLimitResult = checkRateLimit(`notification:${clientId}`, RATE_LIMITS.notification);

        if (!rateLimitResult.success) {
            return NextResponse.json(
                { error: 'Too many requests. Please try again later.' },
                {
                    status: 429,
                    headers: {
                        'X-RateLimit-Remaining': '0',
                        'X-RateLimit-Reset': rateLimitResult.resetIn.toString()
                    }
                }
            );
        }

        const body = await request.json();
        const { type, payload } = body;

        if (!type || !payload) {
            return NextResponse.json({ error: 'Type and payload required' }, { status: 400 });
        }

        // ============================================================
        // SECURITY: Authentication requirements
        // Admin-only types require admin auth token
        // 'order_created' requires a valid order to exist (verified below)
        // 'contact' is public but rate-limited
        // ============================================================
        const adminOnlyTypes = ['campaign', 'order_updated', 'order_status', 'payment_link', 'welcome'];
        const requiresAdminAuth = adminOnlyTypes.includes(type);

        if (requiresAdminAuth) {
            // Each kind of message needs the permission of the screen that sends it.
            const keysByType: Record<string, string[]> = {
                campaign: ['notifications'],
                order_updated: ['orders', 'pos', 'preorders'],
                order_status: ['orders', 'pos', 'preorders'],
                payment_link: ['orders', 'pos', 'preorders'],
            };
            const keys = keysByType[type];
            if (keys) {
                const denied = await denyUnlessPermission(request, keys);
                if (denied) return denied;
            } else {
                const auth = await verifyAuth(request, { requireAdmin: true });
                if (!auth.authenticated) {
                    return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 });
                }
            }
        }

        // ============================================================
        // order_created — verify the order exists in the database
        // ============================================================
        if (type === 'order_created') {
            // Confirmations go out from the payment step, once the money is confirmed, using the
            // order as stored. This public call used to text and email whatever name, number and
            // total the caller sent, for an order nobody had paid for. It now sends nothing.
            return NextResponse.json({
                success: true,
                message: 'Order confirmations are sent when payment is confirmed',
            });
        }

        if (type === 'order_updated') {
            const { order, status } = payload;
            if (!order || !status) {
                return NextResponse.json({ error: 'Missing order or status' }, { status: 400 });
            }
            await sendOrderStatusUpdate(order, status);
            return NextResponse.json({ success: true, message: 'Status update sent' });
        }

        // Handle order_status from admin panel
        if (type === 'order_status') {
            const { email, name, orderNumber, status, trackingNumber, phone } = payload;

            if (!orderNumber || !status) {
                return NextResponse.json({ error: 'Missing orderNumber or status' }, { status: 400 });
            }

            // Fetch full order data
            const { data: fullOrder } = await supabaseAdmin
                .from('orders')
                .select('id, order_number, email, phone, shipping_address, metadata')
                .eq('order_number', orderNumber)
                .single();

            const orderData = fullOrder || {
                order_number: orderNumber,
                email: email,
                phone: phone,
                shipping_address: { firstName: name, phone: phone },
                metadata: { tracking_number: trackingNumber }
            };

            if (!orderData.phone && phone) {
                orderData.phone = phone;
            }

            await sendOrderStatusUpdate(orderData, status);
            return NextResponse.json({ success: true, message: 'Status update sent' });
        }

        if (type === 'welcome') {
            if (!payload.email) {
                return NextResponse.json({ error: 'Missing email' }, { status: 400 });
            }
            await sendWelcomeMessage(payload);
            return NextResponse.json({ success: true, message: 'Welcome message sent' });
        }

        // ============================================================
        // contact — public but strictly validated and rate-limited
        // ============================================================
        if (type === 'contact') {
            const { name, email, subject, message } = payload;
            if (!name || !email || !subject || !message) {
                return NextResponse.json({ error: 'All contact fields required' }, { status: 400 });
            }
            // Basic email format check
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
            }
            // Length limits to prevent abuse
            if (name.length > 100 || subject.length > 200 || message.length > 5000) {
                return NextResponse.json({ error: 'Input too long' }, { status: 400 });
            }
            await sendContactMessage(payload);
            return NextResponse.json({ success: true, message: 'Contact message sent' });
        }

        if (type === 'payment_link') {
            if (!payload.id || !payload.order_number) {
                return NextResponse.json({ error: 'Missing order details' }, { status: 400 });
            }
            await sendPaymentLink(payload);
            return NextResponse.json({ success: true, message: 'Payment link sent' });
        }

        // ============================================================
        // campaign — admin only, with HTML sanitization
        // ============================================================
        if (type === 'campaign') {
            const { recipients, subject, message, channels } = payload;

            if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
                return NextResponse.json({ error: 'Recipients required' }, { status: 400 });
            }
            // A text has no subject line, so one is only needed when an email goes out.
            if (!message) {
                return NextResponse.json({ error: 'Write a message first' }, { status: 400 });
            }
            if (channels?.email && !subject) {
                return NextResponse.json({ error: 'An email needs a subject' }, { status: 400 });
            }

            // Deduplicate phone numbers and emails server-side
            const seenPhones = new Set<string>();
            const seenEmails = new Set<string>();
            const results = { email: 0, sms: 0, errors: 0 };

            // SECURITY: Sanitize subject and message to prevent XSS in emails
            const safeSubject = escapeHtml(subject);
            const safeMessage = escapeHtml(message);

            for (const recipient of recipients) {
                try {
                    // Send email (skip duplicates)
                    if (channels?.email && recipient.email) {
                        const emailKey = recipient.email.toLowerCase().trim();
                        if (!seenEmails.has(emailKey)) {
                            seenEmails.add(emailKey);
                            const recipientName = escapeHtml(recipient.name || 'Valued Customer');
                            const brandedHtml = emailLayout(`
<h2 style="margin:0 0 16px;color:#111827;font-size:22px;text-align:center;">${safeSubject}</h2>
<p style="color:#374151;font-size:14px;line-height:1.7;margin:16px 0;">Hi ${recipientName},</p>
<p style="color:#374151;font-size:14px;line-height:1.7;margin:0 0 16px;">${safeMessage.replace(/\n/g, '</p><p style="color:#374151;font-size:14px;line-height:1.7;margin:0 0 16px;">')}</p>
`, safeSubject);
                            // Counted only when it really went out (the sender returns nothing on failure).
                            const emailed = await sendEmail({
                                to: recipient.email,
                                subject: subject, // Keep original for email subject header
                                html: brandedHtml
                            });
                            if (emailed) results.email++;
                        }
                    }

                    // Send SMS (skip duplicates)
                    if (channels?.sms && recipient.phone) {
                        const phoneKey = recipient.phone.replace(/[\s\-\(\)\.]+/g, '');
                        if (!seenPhones.has(phoneKey)) {
                            seenPhones.add(phoneKey);
                            const texted = await sendSMS({
                                to: recipient.phone,
                                message: message // SMS is plain text, no XSS risk
                            });
                            if (texted) results.sms++;
                        }
                    }
                } catch (err: any) {
                    console.error(`[Campaign] Failed for ${recipient.email || recipient.phone}:`, err.message);
                    results.errors++;
                }
            }

            return NextResponse.json({
                success: true,
                message: `Campaign sent: ${results.email} emails, ${results.sms} SMS.${results.errors > 0 ? ` (${results.errors} failed)` : ''}`
            });
        }

        return NextResponse.json({ error: 'Invalid notification type' }, { status: 400 });

    } catch (error: any) {
        console.error('Notification API Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
