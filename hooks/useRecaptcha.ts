'use client';

import { useCallback, useState } from 'react';
import { executeRecaptcha } from '@/lib/recaptcha';

/**
 * React hook for reCAPTCHA v3 integration.
 * Returns a function to get a verified token, plus loading/error state.
 * 
 * Usage:
 *   const { getToken, verifying } = useRecaptcha();
 *   
 *   async function handleSubmit() {
 *     const isHuman = await getToken('signup');
 *     if (!isHuman) return; // Failed verification
 *     // Proceed with form submission...
 *   }
 */
export function useRecaptcha() {
    const [verifying, setVerifying] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const getToken = useCallback(async (action: string): Promise<boolean> => {
        setError(null);

        // If reCAPTCHA is not configured, allow through (dev mode)
        if (!process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY) {
            return true;
        }

        setVerifying(true);
        try {
            // No token means Google's script is blocked, slow or failed to load (ad blockers,
            // poor networks). That is not the shopper's fault, so they are let through.
            const token = await executeRecaptcha(action).catch(() => null);
            if (!token) return true;

            // Verify on server side
            const response = await fetch('/api/recaptcha/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, action }),
            });

            // Only a clear "no" from our server stops the shopper. A failed or unreadable check does not.
            const result = await response.json().catch(() => null);
            if (response.ok && result && result.success === false) {
                setError(result.error || 'Verification failed. Please try again.');
                return false;
            }

            return true;
        } catch (err: any) {
            console.error('[reCAPTCHA] Hook error:', err);
            return true;
        } finally {
            setVerifying(false);
        }
    }, []);

    return { getToken, verifying, error, clearError: () => setError(null) };
}
