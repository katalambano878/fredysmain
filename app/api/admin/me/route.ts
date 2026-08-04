import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getAdminAccessToken } from '@/lib/admin-route-auth';
import { isPlainPostgres } from '@/lib/db/mode';

/**
 * GET /api/admin/me
 * Returns current admin/staff user and profile using the caller session token.
 * Uses supabaseAdmin (plain-PG compatible) — not a separate browser-style anon client.
 */
export async function GET(request: Request) {
  if (!isPlainPostgres() && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: 'Server misconfiguration: missing Supabase env vars' },
      { status: 503 }
    );
  }

  if (isPlainPostgres() && !process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.DATABASE_URL) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 503 });
  }

  const token = getAdminAccessToken(request);
  if (!token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) {
      return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const role = profile.role != null ? String(profile.role) : '';
    if (role !== 'admin' && role !== 'staff') {
      return NextResponse.json({ error: 'Not admin or staff' }, { status: 403 });
    }

    const { data: roleConfig } = await supabaseAdmin
      .from('roles')
      .select('permissions, enabled')
      .eq('id', role)
      .single();

    if (roleConfig && !roleConfig.enabled) {
      return NextResponse.json({ error: 'Role disabled' }, { status: 403 });
    }

    return NextResponse.json({
      user: { id: user.id, email: user.email },
      profile: { role },
      permissions: roleConfig?.permissions ?? {},
    });
  } catch (e: any) {
    console.error('[admin/me]', e?.message || e);
    return NextResponse.json({ error: 'Auth check failed' }, { status: 500 });
  }
}
