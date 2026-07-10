import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * TEMPORARY diagnostic endpoint. Reports presence (not values) of key env vars.
 * DELETE THIS FILE after debugging.
 */
export async function GET() {
  const keys = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'NEXT_PUBLIC_APP_URL',
    'MOOLRE_API_USER',
    'MOOLRE_API_PUBKEY',
    'MOOLRE_ACCOUNT_NUMBER',
    'MOOLRE_MERCHANT_EMAIL',
    'MOOLRE_CALLBACK_SECRET',
    'MOOLRE_SMS_API_KEY',
    'NEXT_PUBLIC_ENABLE_HUBTEL',
    'HUBTEL_API_ID',
    'HUBTEL_API_KEY',
    'HUBTEL_MERCHANT_ACCOUNT_NUMBER',
    'RESEND_API_KEY',
    'ADMIN_EMAIL',
    'EMAIL_FROM',
  ];

  const report: Record<string, unknown> = {};
  for (const k of keys) {
    const v = process.env[k];
    if (v === undefined) {
      report[k] = { present: false };
    } else {
      report[k] = {
        present: true,
        length: v.length,
        first2: v.slice(0, 2),
        last2: v.slice(-2),
        hasLeadingSpace: /^\s/.test(v),
        hasTrailingSpace: /\s$/.test(v),
      };
    }
  }

  const moolreKeyNames = Object.keys(process.env)
    .filter((k) => k.toUpperCase().includes('MOOLRE'))
    .sort();

  return NextResponse.json({
    vercelEnv: process.env.VERCEL_ENV || null,
    vercelUrl: process.env.VERCEL_URL || null,
    nodeEnv: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
    /** Exact env keys containing "MOOLRE" (names only) — catches typos vs MOOLRE_API_USER */
    moolreKeyNames,
    report,
  });
}
