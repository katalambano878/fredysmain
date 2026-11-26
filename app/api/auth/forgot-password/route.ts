import { NextResponse } from 'next/server';
import { isPlainPostgres } from '@/lib/db/mode';
import { createPasswordReset } from '@/lib/db/auth';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { sendPasswordReset } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

const SAME_ANSWER = {
  success: true,
  message: 'If an account matches, a reset link is on its way. It works for 45 minutes.',
};

/**
 * POST /api/auth/forgot-password  { identifier }   (email address or phone number)
 * Sends a one-time reset link. The answer is the same whether or not an account exists,
 * so this cannot be used to find out who has an account.
 */
export async function POST(request: Request) {
  if (!isPlainPostgres()) {
    return NextResponse.json({ error: 'Password reset is not available on this server.' }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const identifier = String(body?.identifier || body?.email || '').trim().slice(0, 200);
  if (!identifier) {
    return NextResponse.json({ error: 'Enter your email address or phone number.' }, { status: 400 });
  }

  const byIp = checkRateLimit(`reset-ip:${getClientIdentifier(request)}`, { maxRequests: 5, windowSeconds: 900 });
  const byAccount = checkRateLimit(`reset-id:${identifier.toLowerCase()}`, { maxRequests: 3, windowSeconds: 900 });
  if (!byIp.success || !byAccount.success) {
    return NextResponse.json(
      { error: 'Too many reset requests. Wait 15 minutes and try again.' },
      { status: 429 }
    );
  }

  try {
    const target = await createPasswordReset(identifier);
    if (target) await sendPasswordReset(target);
  } catch (err) {
    console.error('[forgot-password] failed:', err instanceof Error ? err.message : err);
  }
  return NextResponse.json(SAME_ANSWER);
}
