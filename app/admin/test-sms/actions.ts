'use server';

import { NextResponse } from 'next/server';
import { requireAnyPermission } from '@/lib/admin-route-auth';
import { sendSMS } from '@/lib/notifications';

export async function testSmsAction(phone: string, message: string, authToken: string) {
    // Only someone whose role includes the SMS Debugger may send a test text (it spends SMS credit).
    const checked = await requireAnyPermission(
        new Request('http://internal/test-sms', { headers: { authorization: `Bearer ${authToken || ''}` } }),
        ['sms_debugger']
    );
    if (checked instanceof NextResponse) {
        const reason = await checked.json().catch(() => null);
        return { success: false, error: reason?.error || 'You are not allowed to send test texts.' };
    }

    try {
        console.log('Testing SMS | by user:', checked.userId);

        // Validate phone input
        if (!phone || typeof phone !== 'string') {
            return { success: false, error: 'Invalid phone number' };
        }

        // Validate message input
        if (!message || typeof message !== 'string' || message.length > 1000) {
            return { success: false, error: 'Invalid or too long message' };
        }

        // Sent the same way as the shop's real texts (the main SMS service first, then the backup),
        // so a test here shows what customers would actually get. It used to test the backup only.
        const result: any = await sendSMS({ to: phone, message });

        if (!result) {
            return {
                success: false,
                error: 'The text was not sent. No SMS service accepted it: check the SMS balance and settings.',
            };
        }

        return {
            success: result?.status === 1,
            result,
            provider: result?.provider || 'backup SMS service',
        };
    } catch (error: any) {
        // SECURITY: Don't expose stack traces
        console.error('[Test SMS] Error:', error.message, error.stack);
        return {
            success: false,
            error: error.message || 'SMS sending failed'
        };
    }
}
