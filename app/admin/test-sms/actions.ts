'use server';

import { verifyAdminToken } from '@/lib/auth';
import { sendSMS } from '@/lib/notifications';

export async function testSmsAction(phone: string, message: string, authToken: string) {
    // SECURITY: Verify admin authentication before allowing SMS sending
    const auth = await verifyAdminToken(authToken);
    if (!auth.authenticated) {
        return {
            success: false,
            error: 'Unauthorized: ' + (auth.error || 'Admin access required')
        };
    }

    try {
        console.log('Testing SMS to:', phone, '| by user:', auth.user?.email);

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
