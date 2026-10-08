import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requirePermission } from '@/lib/admin-route-auth';

/** Same sources as /api/admin/me: Bearer header, sb-access-token cookie, or sb-*-auth-token. */
function getAccessToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7).trim();

  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(/\bsb-access-token=([^;]+)/);
  if (match) return decodeURIComponent(match[1].trim());

  const authCookie = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('sb-') && (c.includes('-auth-token') || c.includes('auth')));
  if (!authCookie) return null;

  const value = authCookie.split('=').slice(1).join('=').trim();
  const decoded = decodeURIComponent(value);
  try {
    const parsed = JSON.parse(decoded);
    if (Array.isArray(parsed) && parsed[0]) return parsed[0];
    if (parsed?.access_token) return parsed.access_token;
    if (typeof parsed === 'string') return parsed;
  } catch {
    return decoded;
  }
  return null;
}

async function getAuthenticatedAdmin(request: Request) {
  const token = getAccessToken(request);
  if (!token) return null;

  const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !user) return null;

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') return null;

  return user;
}

// GET — List all staff (admin + staff role profiles)
export async function GET(request: Request) {
  const actor = await requirePermission(request, 'delete_staff');
  if (actor instanceof NextResponse) return actor;

  const { data: staff, error } = await supabaseAdmin
    .from('profiles')
    .select('id, email, full_name, phone, role, avatar_url, created_at, updated_at')
    .in('role', ['admin', 'staff'])
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ staff: staff || [] });
}

// POST — Invite a new staff member
export async function POST(request: Request) {
  const admin = await getAuthenticatedAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { email, fullName, phone, role, password } = body;

  if (!email || !fullName || !role) {
    return NextResponse.json({ error: 'Email, full name, and role are required.' }, { status: 400 });
  }

  if (!['admin', 'staff'].includes(role)) {
    return NextResponse.json({ error: 'Role must be admin or staff.' }, { status: 400 });
  }

  if (!password || password.length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 });
  }

  // Check if email already exists
  const { data: existingProfile } = await supabaseAdmin
    .from('profiles')
    .select('id, role')
    .eq('email', email.toLowerCase().trim())
    .single();

  if (existingProfile) {
    if (['admin', 'staff'].includes(existingProfile.role)) {
      return NextResponse.json({ error: 'This email is already registered as staff.' }, { status: 409 });
    }
    // Promote existing customer to staff
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({
        role,
        full_name: fullName,
        phone: phone || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingProfile.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      promoted: true,
      message: `Existing user promoted to ${role}.`,
    });
  }

  // Create new user via Supabase Auth Admin API
  const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email: email.toLowerCase().trim(),
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      phone: phone || '',
    },
  });

  if (createError) {
    if (createError.message?.includes('already been registered')) {
      return NextResponse.json({ error: 'This email is already registered.' }, { status: 409 });
    }
    return NextResponse.json({ error: createError.message }, { status: 500 });
  }

  if (!newUser?.user) {
    return NextResponse.json({ error: 'Failed to create user.' }, { status: 500 });
  }

  // The trigger handle_new_user() creates a profile with 'customer' role — update it
  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .update({
      role,
      full_name: fullName,
      phone: phone || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', newUser.user.id);

  if (profileError) {
    console.error('[Staff API] Profile update error:', profileError);
  }

  return NextResponse.json({
    success: true,
    promoted: false,
    userId: newUser.user.id,
    message: `Staff member ${fullName} created successfully.`,
  });
}

// PATCH — Update a staff member's role or details
export async function PATCH(request: Request) {
  const admin = await getAuthenticatedAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { userId, role, fullName, phone } = body;

  if (!userId) {
    return NextResponse.json({ error: 'User ID is required.' }, { status: 400 });
  }

  // Prevent demoting yourself
  if (userId === admin.id && role && role !== 'admin') {
    return NextResponse.json({ error: 'You cannot change your own role.' }, { status: 403 });
  }

  const updates: Record<string, any> = { updated_at: new Date().toISOString() };
  if (role && ['admin', 'staff', 'customer'].includes(role)) {
    updates.role = role;
  }
  if (fullName !== undefined) updates.full_name = fullName;
  if (phone !== undefined) updates.phone = phone || null;

  const { error } = await supabaseAdmin
    .from('profiles')
    .update(updates)
    .eq('id', userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: 'Staff member updated.' });
}

// DELETE — Remove staff access (demote to customer)
export async function DELETE(request: Request) {
  const actor = await requirePermission(request, 'delete_staff');
  if (actor instanceof NextResponse) return actor;

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');

  if (!userId) {
    return NextResponse.json({ error: 'User ID is required.' }, { status: 400 });
  }

  if (userId === actor.userId) {
    return NextResponse.json({ error: 'You cannot remove yourself.' }, { status: 403 });
  }

  // Check user exists and is staff/admin
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();

  if (!profile || !['admin', 'staff'].includes(profile.role)) {
    return NextResponse.json({ error: 'User is not a staff member.' }, { status: 404 });
  }

  // Delete-only access covers staff accounts, never administrators.
  if (profile.role === 'admin' && actor.role !== 'admin') {
    return NextResponse.json({ error: 'Only an administrator can remove an administrator.' }, { status: 403 });
  }

  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ role: 'customer', updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: 'Staff access removed.' });
}
