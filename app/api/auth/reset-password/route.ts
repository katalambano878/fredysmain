import { NextResponse } from 'next/server';
import { isPlainPostgres } from '@/lib/db/mode';
import { resetPasswordWithToken } from '@/lib/db/auth';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/** POST /api/auth/reset-password  { token, password }  — sets the new password from a reset link. */
export async function POST(request: Request) {
  if (!isPlainPostgres()) {
    return NextResponse.json({ error: 'Password reset is not available on this server.' }, { status: 503 });
  }
  if (!checkRateLimit(`reset-set:${getClientIdentifier(request)}`, { maxRequests: 10, windowSeconds: 900 }).success) {
    return NextResponse.json({ error: 'Too many tries. Wait 15 minutes and try again.' }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const result = await resetPasswordWithToken(String(body?.token || ''), String(body?.password || ''));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ success: true });
}
