import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isPlainPostgres } from '@/lib/db/mode';

export function getAdminAccessToken(request: Request): string | null {
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

export async function requireAdminSession(request: Request): Promise<NextResponse | null> {
  if (!isPlainPostgres() && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 503 });
  }
  const token = getAdminAccessToken(request);
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  const role = profile?.role != null ? String(profile.role) : '';
  if (role !== 'admin' && role !== 'staff') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

export async function getAdminUserIdFromRequest(request: Request): Promise<string | null> {
  const token = getAdminAccessToken(request);
  if (!token) return null;
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  return user?.id ?? null;
}

export type AdminActor = {
  userId: string;
  role: string;
  permissions: Record<string, boolean>;
  /** False when an administrator has switched this person's role off on the Roles screen. */
  roleEnabled: boolean;
};

/** Signed-in admin or staff, with their role permissions plus any per-person extras. */
export async function getAdminActor(request: Request): Promise<AdminActor | null> {
  const token = getAdminAccessToken(request);
  if (!token) return null;
  const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !user) return null;

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  const role = profile?.role != null ? String(profile.role) : '';
  if (role !== 'admin' && role !== 'staff') return null;

  const { data: roleConfig } = await supabaseAdmin
    .from('roles')
    .select('permissions, enabled')
    .eq('id', role)
    .single();
  const rolePermissions =
    roleConfig?.permissions && typeof roleConfig.permissions === 'object' ? roleConfig.permissions : {};

  const { permissionsForUser } = await import('@/lib/admin-permissions');
  return {
    userId: user.id,
    role,
    permissions: permissionsForUser(user.id, rolePermissions),
    roleEnabled: roleConfig?.enabled !== false,
  };
}

/** What each permission is called on the Roles screen, for the "not allowed" message. */
const PERMISSION_NAMES: Record<string, string> = {
  dashboard: 'Dashboard',
  end_of_day: 'End of Day',
  orders: 'Orders',
  pos: 'POS',
  preorders: 'Preorders',
  products: 'Products',
  categories: 'Categories',
  customers: 'Customers',
  reviews: 'Reviews',
  inventory: 'Inventory',
  analytics: 'Analytics',
  finance: 'Finance',
  coupons: 'Coupons',
  support: 'Support',
  customer_insights: 'Customer Insights',
  notifications: 'Notifications',
  sms_debugger: 'SMS Debugger',
  sms_credit: 'Buy SMS',
  blog: 'Blog',
  delivery: 'Delivery',
  modules: 'Modules',
  delete_staff: 'removing staff',
};

/**
 * True when this person may use something that any of `keys` opens. The rule is the menu's rule:
 * an administrator may do everything; a staff member needs the switch to be on (an empty set of
 * switches opens nothing); Preorders is also opened by Orders, as it used to live there.
 */
export function holdsAnyPermission(actor: AdminActor, keys: readonly string[]): boolean {
  if (actor.role === 'admin') return true;
  if (!actor.roleEnabled) return false;
  return keys.some(
    (key) => actor.permissions[key] === true || (key === 'preorders' && actor.permissions.orders === true)
  );
}

/**
 * The check every admin action starts with: the signed-in person must hold at least one of the
 * permissions that open a screen needing this action. Returns the person, or the refusal to send.
 */
export async function requireAnyPermission(
  request: Request,
  keys: readonly string[]
): Promise<NextResponse | AdminActor> {
  if (!isPlainPostgres() && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 503 });
  }
  const actor = await getAdminActor(request);
  if (!actor) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (actor.role !== 'admin' && !actor.roleEnabled) {
    return NextResponse.json(
      { error: 'Your role is switched off. Ask an administrator to switch it back on under Roles.' },
      { status: 403 }
    );
  }
  if (!holdsAnyPermission(actor, keys)) {
    const names = keys.map((key) => PERMISSION_NAMES[key] || key);
    const what = names.length === 1 ? names[0] : `any of: ${names.join(', ')}`;
    return NextResponse.json(
      { error: `Your role does not include ${what}. Ask an administrator to switch it on under Roles.` },
      { status: 403 }
    );
  }
  return actor;
}

/** Same check, for handlers that only need a yes or no: null means carry on. */
export async function denyUnlessPermission(
  request: Request,
  keys: readonly string[]
): Promise<NextResponse | null> {
  const result = await requireAnyPermission(request, keys);
  return result instanceof NextResponse ? result : null;
}

/** For actions only an administrator may take, whatever switches a staff role has. */
export async function requireAdministrator(request: Request): Promise<NextResponse | AdminActor> {
  const actor = await getAdminActor(request);
  if (!actor) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (actor.role !== 'admin') {
    return NextResponse.json({ error: 'Only an administrator can do this.' }, { status: 403 });
  }
  return actor;
}

export async function requirePermission(
  request: Request,
  permission: string
): Promise<NextResponse | AdminActor> {
  return requireAnyPermission(request, [permission]);
}
