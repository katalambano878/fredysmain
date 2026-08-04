import { NextResponse } from 'next/server';
import { isPlainPostgres } from '@/lib/db/mode';

/**
 * Public health check — no secrets, no table contents.
 * GET /api/health
 */
export async function GET() {
  const started = Date.now();
  const checks: Record<string, 'ok' | 'degraded' | 'missing' | 'error'> = {
    app: 'ok',
    database: 'missing',
    pixel: process.env.NEXT_PUBLIC_META_PIXEL_ID ? 'ok' : 'missing',
    hubtel: process.env.HUBTEL_API_ID && process.env.HUBTEL_API_KEY ? 'ok' : 'missing',
    moolre: process.env.MOOLRE_API_USER && process.env.MOOLRE_API_PUBKEY ? 'ok' : 'missing',
    sms: process.env.MOOLRE_SMS_API_KEY ? 'ok' : 'missing',
  };

  let dbLatencyMs: number | null = null;

  if (isPlainPostgres()) {
    try {
      const { query } = await import('@/lib/db/pool');
      const t0 = Date.now();
      await query('SELECT 1 AS ok');
      dbLatencyMs = Date.now() - t0;
      checks.database = dbLatencyMs > 2000 ? 'degraded' : 'ok';
    } catch {
      checks.database = 'error';
    }
  } else if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    checks.database = 'ok';
  }

  const unhealthy = checks.database === 'error';
  const degraded = Object.values(checks).some((v) => v === 'degraded' || v === 'missing');

  return NextResponse.json(
    {
      status: unhealthy ? 'unhealthy' : degraded ? 'degraded' : 'healthy',
      durationMs: Date.now() - started,
      dbLatencyMs,
      mode: isPlainPostgres() ? 'plain-postgres' : 'supabase',
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: unhealthy ? 503 : 200 }
  );
}
