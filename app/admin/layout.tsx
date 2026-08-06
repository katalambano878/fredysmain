'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { fetchWithTimeout, withTimeout } from '@/lib/fetch-timeout';
import { canAccessPath, firstAllowedAdminPath } from '@/lib/admin-permissions';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const authChecked = useRef(false);

  // Module Filtering State
  const [enabledModules, setEnabledModules] = useState<string[]>([]);
  const [rolePermissions, setRolePermissions] = useState<Record<string, boolean>>({});

  // Keep auth cookie in sync (stable subscription — not tied to pathname)
  useEffect(() => {
    const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED' && session) {
        document.cookie = `sb-access-token=${session.access_token}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax${secure}`;
      }
      if (event === 'SIGNED_OUT') {
        document.cookie = `sb-access-token=; path=/; max-age=0; SameSite=Lax${secure}`;
        document.cookie = `sb-refresh-token=; path=/; max-age=0; SameSite=Lax${secure}`;
        authChecked.current = false;
        setIsAuthenticated(false);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Auth when entering admin (skip /admin/login). Re-run only until first success —
  // re-authing on every nav caused endless "Loading Admin...".
  useEffect(() => {
    if (pathname === '/admin/login') {
      setIsLoading(false);
      setAuthError(null);
      return;
    }

    if (authChecked.current) return;

    let cancelled = false;
    setIsLoading(true);

    async function checkAuth() {
      setAuthError(null);
      try {
        const sessionResult = await withTimeout(
          supabase.auth.getSession(),
          8_000,
          'getSession'
        );
        const session = sessionResult.data?.session;

        if (!session) {
          if (!cancelled) router.replace('/admin/login');
          return;
        }

        const accessToken = session.access_token;
        if (!accessToken || typeof accessToken !== 'string') {
          if (!cancelled) router.replace('/admin/login');
          return;
        }

        const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
        try {
          document.cookie = `sb-access-token=${accessToken}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax${secure}`;
        } catch {
          /* cookie write optional */
        }

        const meRes = await fetchWithTimeout('/api/admin/me', {
          credentials: 'include',
          headers: { Authorization: `Bearer ${accessToken}` },
          timeoutMs: 12_000,
        });

        if (!meRes.ok) {
          let errBody: { error?: string } = {};
          try {
            const text = await meRes.text();
            if (text) errBody = JSON.parse(text);
          } catch {
            /* ignore parse */
          }
          if (cancelled) return;
          if (meRes.status === 503) router.replace('/admin/login?error=config');
          else if (meRes.status === 404) router.replace('/admin/login?error=no_profile');
          else if (meRes.status === 403 && errBody?.error === 'Role disabled') {
            router.replace('/admin/login?error=role_disabled');
          } else router.replace('/admin/login');
          return;
        }

        let profileData: { role?: string } | null = null;
        let permissions: Record<string, boolean> = {};
        try {
          const json = await meRes.json();
          profileData = json?.profile ?? null;
          permissions = (json?.permissions && typeof json.permissions === 'object') ? json.permissions : {};
        } catch {
          if (!cancelled) router.replace('/admin/login');
          return;
        }

        const role = profileData?.role != null ? String(profileData.role) : '';
        if (role !== 'admin' && role !== 'staff') {
          document.cookie = `sb-access-token=; path=/; max-age=0; SameSite=Lax${secure}`;
          try {
            await withTimeout(supabase.auth.signOut(), 5_000, 'signOut');
          } catch {
            /* ignore hang */
          }
          if (!cancelled) router.replace('/admin/login?error=unauthorized');
          return;
        }

        if (cancelled) return;
        setUser(session.user);
        setUserRole(role);
        if (Object.keys(permissions).length > 0) setRolePermissions(permissions);
        setIsAuthenticated(true);
        authChecked.current = true;
      } catch (err: any) {
        console.error('[AdminLayout] Auth failed:', err?.message || err);
        if (!cancelled) {
          setAuthError(err?.name === 'FetchTimeoutError'
            ? 'Admin authentication timed out. Check your connection and try again.'
            : 'Could not verify admin session.');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    checkAuth();
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (showUserMenu && !target.closest('.user-menu-container')) {
        setShowUserMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showUserMenu]);

  // Fetch Modules Effect
  useEffect(() => {
    async function fetchModules() {
      try {
        const { data, error } = await supabase.from('store_modules').select('id, enabled');
        if (error) {
          console.warn('Error fetching modules:', error);
          return;
        }
        if (data) {
          setEnabledModules(data.filter((m: any) => m.enabled).map((m: any) => m.id));
        }
      } catch (err) {
        console.warn('Fetch modules failed:', err);
      }
    }
    fetchModules();
  }, []);

  // Screen size check for initial state
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        // Only set to false if it's currently true? 
        // Actually, let's just default to open on desktop, closed on mobile on mount only
      }
    };

    // Set initial state based on width
    if (window.innerWidth < 1024) {
      setIsSidebarOpen(false);
    }

    // Optional: Auto-close on resize to mobile? For now, leave as is.
  }, []);

  // Staff/limited roles: block routes they don't have permission for
  useEffect(() => {
    if (!isAuthenticated || isLoading || userRole === 'admin') return;
    if (pathname === '/admin/login') return;
    if (!canAccessPath(userRole, rolePermissions, pathname)) {
      router.replace(firstAllowedAdminPath(rolePermissions));
    }
  }, [isAuthenticated, isLoading, userRole, rolePermissions, pathname, router]);

  const [cacheCleared, setCacheCleared] = useState(false);

  const handleClearCache = async () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      setCacheCleared(true);
      setTimeout(() => {
        setCacheCleared(false);
        window.location.reload();
      }, 1200);
    } catch (err) {
      console.error('Cache clear failed:', err);
    }
  };

  const handleLogout = async () => {
    const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `sb-access-token=; path=/; max-age=0; SameSite=Lax${secure}`;
    document.cookie = `sb-refresh-token=; path=/; max-age=0; SameSite=Lax${secure}`;
    await supabase.auth.signOut();
    router.push('/admin/login');
  };

  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500">Loading Admin...</div>;
  }

  if (authError || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white border border-gray-200 rounded-xl p-6 text-center space-y-4">
          <p className="text-gray-800 font-semibold">Admin session unavailable</p>
          <p className="text-sm text-gray-500">{authError || 'Please sign in again.'}</p>
          <div className="flex gap-3 justify-center">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium"
            >
              Retry
            </button>
            <Link href="/admin/login" className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700">
              Go to login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const menuItems = [
    {
      title: 'Dashboard',
      icon: 'ri-dashboard-line',
      path: '/admin',
      exact: true,
      permissionKey: 'dashboard'
    },
    {
      title: 'End of Day',
      icon: 'ri-calendar-check-line',
      path: '/admin/end-of-day',
      permissionKey: 'end_of_day'
    },
    {
      title: 'Orders',
      icon: 'ri-shopping-bag-line',
      path: '/admin/orders',
      badge: '',
      permissionKey: 'orders'
    },
    {
      title: 'Sales',
      icon: 'ri-store-3-line',
      path: '/admin/sales',
      permissionKey: 'pos'
    },
    {
      title: 'Preorders',
      icon: 'ri-time-line',
      path: '/admin/preorders',
      permissionKey: 'orders'
    },
    {
      title: 'Gallery Preorders',
      icon: 'ri-image-line',
      path: '/admin/gallery-preorders',
      permissionKey: 'orders'
    },
    {
      title: 'POS System',
      icon: 'ri-store-3-line',
      path: '/admin/pos',
      permissionKey: 'pos'
    },
    {
      title: 'Products',
      icon: 'ri-box-3-line',
      path: '/admin/products',
      permissionKey: 'products'
    },
    {
      title: 'Discounts',
      icon: 'ri-price-tag-3-line',
      path: '/admin/discounts',
      permissionKey: 'products'
    },
    {
      title: 'Categories',
      icon: 'ri-folder-line',
      path: '/admin/categories',
      permissionKey: 'categories'
    },
    {
      title: 'Gallery',
      icon: 'ri-gallery-line',
      path: '/admin/homepage-gallery',
      permissionKey: 'products'
    },
    {
      title: 'Customers',
      icon: 'ri-group-line',
      path: '/admin/customers',
      permissionKey: 'customers'
    },
    {
      title: 'Reviews',
      icon: 'ri-chat-smile-2-line',
      path: '/admin/reviews',
      permissionKey: 'reviews'
    },
    {
      title: 'Inventory',
      icon: 'ri-stack-line',
      path: '/admin/inventory',
      permissionKey: 'inventory'
    },
    {
      title: 'Analytics',
      icon: 'ri-bar-chart-line',
      path: '/admin/analytics',
      permissionKey: 'analytics'
    },
    {
      title: 'Finance',
      icon: 'ri-funds-line',
      path: '/admin/finance',
      permissionKey: 'finance'
    },
    {
      title: 'Coupons',
      icon: 'ri-coupon-2-line',
      path: '/admin/coupons',
      permissionKey: 'coupons'
    },
    {
      title: 'Support Hub',
      icon: 'ri-customer-service-2-line',
      path: '/admin/support',
      permissionKey: 'support'
    },
    {
      title: 'Customer Insights',
      icon: 'ri-user-search-line',
      path: '/admin/customer-insights',
      moduleId: 'customer-insights',
      permissionKey: 'customer_insights'
    },
    {
      title: 'Notifications',
      icon: 'ri-notification-3-line',
      path: '/admin/notifications',
      moduleId: 'notifications',
      permissionKey: 'notifications'
    },
    {
      title: 'SMS Debugger',
      icon: 'ri-message-2-line',
      path: '/admin/test-sms',
      permissionKey: 'sms_debugger'
    },
    {
      title: 'Blog',
      icon: 'ri-article-line',
      path: '/admin/blog',
      moduleId: 'blog',
      permissionKey: 'blog'
    },
    {
      title: 'Delivery Hub',
      icon: 'ri-truck-line',
      path: '/admin/delivery',
      permissionKey: 'delivery'
    },
    {
      title: 'Modules',
      icon: 'ri-puzzle-line',
      path: '/admin/modules',
      permissionKey: 'modules'
    },
    {
      title: 'Staff',
      icon: 'ri-team-line',
      path: '/admin/staff',
      permissionKey: 'staff'
    },
    {
      title: 'Roles',
      icon: 'ri-shield-user-line',
      path: '/admin/roles',
      permissionKey: 'roles'
    },
  ];

  const visibleMenuItems = menuItems.filter(item => {
    if (item.moduleId && !enabledModules.includes(item.moduleId)) return false;
    if (userRole === 'admin') return true;
    // Staff: fail closed — only show explicitly granted permissions
    if (item.permissionKey) {
      return rolePermissions[item.permissionKey] === true;
    }
    return false;
  });

  // POS gets a full-screen layout with no sidebar or header
  const isPOS = pathname === '/admin/pos';
  const isPrint = pathname.includes('/print');
  if ((isPOS || isPrint) && isAuthenticated) {
    return (
      <div className={isPOS ? "h-screen w-screen overflow-hidden bg-gray-100" : "bg-white min-h-screen"}>
        {children}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden glass-overlay"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar - Mobile: Transform / Desktop: Width transition */}
      <aside
        className={`fixed top-0 left-0 z-40 h-screen bg-white border-r border-gray-200 transition-all duration-300
          w-64
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} 
          ${isSidebarOpen ? 'lg:w-64' : 'lg:w-0 lg:overflow-hidden'}
          lg:translate-x-0
        `}
      >
        <div className="h-full px-4 py-6 overflow-y-auto">
          <Link href="/admin" className="flex items-center mb-8 px-2 cursor-pointer">
            <img src="/frebys-logo.png" alt="Freby’s Fashion GH" className="h-10 w-auto object-contain" />
            <span className="ml-3 text-sm font-semibold text-gray-500">ADMIN</span>
          </Link>

          <nav className="space-y-1">
            {visibleMenuItems.map((item) => {
              const isActive = item.exact ? pathname === item.path : pathname.startsWith(item.path);
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  onClick={() => window.innerWidth < 1024 && setIsSidebarOpen(false)}
                  className={`flex items-center justify-between px-4 py-3 rounded-lg transition-colors cursor-pointer ${isActive
                    ? 'bg-gray-50 text-gray-900 font-semibold'
                    : 'text-gray-700 hover:bg-gray-50'
                    }`}
                >
                  <div className="flex items-center space-x-3">
                    <i className={`${item.icon} text-xl w-5 h-5 flex items-center justify-center`}></i>
                    <span>{item.title}</span>
                  </div>
                  {item.badge && (
                    <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-1 rounded-full">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="mt-8 pt-8 border-t border-gray-200 space-y-1">
            <Link
              href="/"
              target="_blank"
              onClick={() => window.innerWidth < 1024 && setIsSidebarOpen(false)}
              className="flex items-center space-x-3 px-4 py-3 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors cursor-pointer"
            >
              <i className="ri-external-link-line text-xl w-5 h-5 flex items-center justify-center"></i>
              <span>View Store</span>
            </Link>
            <button
              onClick={handleClearCache}
              disabled={cacheCleared}
              className="w-full flex items-center space-x-3 px-4 py-3 text-gray-700 hover:bg-orange-50 hover:text-orange-600 rounded-lg transition-colors cursor-pointer disabled:opacity-70"
            >
              <i className={`${cacheCleared ? 'ri-check-line text-green-500' : 'ri-delete-bin-2-line'} text-xl w-5 h-5 flex items-center justify-center`}></i>
              <span className={cacheCleared ? 'text-green-600 font-medium' : ''}>{cacheCleared ? 'Cache Cleared!' : 'Clear Cache'}</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className={`transition-all duration-300 ml-0 ${isSidebarOpen ? 'lg:ml-64' : 'lg:ml-0'}`}>
        <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
          <div className="px-4 py-4 lg:px-6 flex items-center justify-between">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="w-10 h-10 flex items-center justify-center text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
            >
              <i className={`${isSidebarOpen ? 'ri-menu-fold-line' : 'ri-menu-unfold-line'} text-xl`}></i>
            </button>

            <div className="flex items-center space-x-2 lg:space-x-4">
              <button className="relative w-10 h-10 flex items-center justify-center text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer">
                <i className="ri-notification-3-line text-xl"></i>
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
              </button>

              <div className="relative user-menu-container">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center space-x-2 lg:space-x-3 px-2 lg:px-3 py-2 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                >
                  <div className="w-8 h-8 lg:w-9 lg:h-9 flex items-center justify-center bg-gray-100 text-gray-900 rounded-full font-semibold">
                    {user?.email?.charAt(0).toUpperCase() || 'A'}
                  </div>
                  <div className="text-left hidden md:block">
                    <p className="text-sm font-semibold text-gray-900 capitalize">{userRole || 'Admin'}</p>
                    <p className="text-xs text-gray-500 max-w-[100px] truncate">{user?.email}</p>
                  </div>
                  <i className="ri-arrow-down-s-line text-gray-600"></i>
                </button>

                {showUserMenu && (
                  <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-20">
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-gray-50 transition-colors border-t border-gray-200 text-left cursor-pointer"
                    >
                      <i className="ri-logout-box-line text-red-600 w-5 h-5 flex items-center justify-center"></i>
                      <span className="text-red-600">Logout</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        <main className="p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
