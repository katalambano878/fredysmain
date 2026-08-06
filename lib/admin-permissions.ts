/** Map admin pathname → permission key used in roles.permissions */
export function permissionForPath(pathname: string): string | null {
  if (pathname === '/admin' || pathname === '/admin/') return 'dashboard';
  if (pathname.startsWith('/admin/login')) return null;
  if (pathname.startsWith('/admin/end-of-day')) return 'end_of_day';
  if (pathname.startsWith('/admin/orders')) return 'orders';
  if (pathname.startsWith('/admin/sales')) return 'pos';
  if (pathname.startsWith('/admin/preorders')) return 'orders';
  if (pathname.startsWith('/admin/gallery-preorders')) return 'orders';
  if (pathname.startsWith('/admin/pos')) return 'pos';
  if (pathname.startsWith('/admin/products')) return 'products';
  if (pathname.startsWith('/admin/discounts')) return 'products';
  if (pathname.startsWith('/admin/categories')) return 'categories';
  if (pathname.startsWith('/admin/homepage-gallery')) return 'products';
  if (pathname.startsWith('/admin/customers')) return 'customers';
  if (pathname.startsWith('/admin/reviews')) return 'reviews';
  if (pathname.startsWith('/admin/inventory')) return 'inventory';
  if (pathname.startsWith('/admin/analytics')) return 'analytics';
  if (pathname.startsWith('/admin/finance')) return 'finance';
  if (pathname.startsWith('/admin/coupons')) return 'coupons';
  if (pathname.startsWith('/admin/support')) return 'support';
  if (pathname.startsWith('/admin/customer-insights')) return 'customer_insights';
  if (pathname.startsWith('/admin/notifications')) return 'notifications';
  if (pathname.startsWith('/admin/test-sms')) return 'sms_debugger';
  if (pathname.startsWith('/admin/blog')) return 'blog';
  if (pathname.startsWith('/admin/delivery')) return 'delivery';
  if (pathname.startsWith('/admin/modules')) return 'modules';
  if (pathname.startsWith('/admin/staff')) return 'staff';
  if (pathname.startsWith('/admin/roles')) return 'roles';
  return null;
}

export function canAccessPath(
  role: string | null,
  permissions: Record<string, boolean>,
  pathname: string
): boolean {
  if (role === 'admin') return true;
  const key = permissionForPath(pathname);
  if (!key) return true;
  if (!permissions || Object.keys(permissions).length === 0) {
    // Fail closed for staff without explicit permissions
    return role !== 'staff';
  }
  return permissions[key] === true;
}

/** First allowed admin landing page for limited staff */
export function firstAllowedAdminPath(permissions: Record<string, boolean>): string {
  const order = [
    ['inventory', '/admin/inventory'],
    ['end_of_day', '/admin/end-of-day'],
    ['orders', '/admin/orders'],
    ['pos', '/admin/pos'],
    ['products', '/admin/products'],
    ['dashboard', '/admin'],
  ] as const;
  for (const [key, path] of order) {
    if (permissions[key] === true) return path;
  }
  return '/admin/login?error=unauthorized';
}
