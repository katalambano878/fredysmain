'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useRecaptcha } from '@/hooks/useRecaptcha';

export default function AdminLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const { getToken, verifying } = useRecaptcha();

  const looksLikeEmail = identifier.includes('@');

  useEffect(() => {
    const errorParam = searchParams.get('error');
    if (errorParam === 'role_disabled') {
      setError('Your role has been disabled by the administrator. Contact your Super Admin for access.');
    } else if (errorParam === 'unauthorized') {
      setError('You do not have permission to access the admin panel.');
    } else if (errorParam === 'session_expired') {
      setError('You were signed out because your session ended. Sign in again to carry on.');
    } else if (errorParam === 'no_profile') {
      setError('This login has no admin profile. Ask the shop administrator to add you as staff.');
    } else if (errorParam === 'config' || errorParam === 'misconfigured') {
      setError('The admin area is not available right now because of a setup problem on the server. Contact your website developer.');
    }
  }, [searchParams]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    // reCAPTCHA verification
    const isHuman = await getToken('admin_login');
    if (!isHuman) {
      setError('Security verification failed. Please try again.');
      setIsLoading(false);
      return;
    }

    try {
      // Resolve the identifier (email or phone) to an email address before
      // calling Supabase Auth. The server-side route looks up the admin/staff
      // profile by phone when needed and never leaks account existence for
      // non-admin users.
      const typed = identifier.trim();
      let data: { session: { access_token: string; refresh_token: string } | null };

      if (!typed.includes('@')) {
        // A phone number: the server checks it together with the password and returns the session.
        const resolveRes = await fetch('/api/admin/resolve-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier: typed, password })
        });
        const resolveJson = await resolveRes.json().catch(() => ({}));
        if (!resolveRes.ok || !resolveJson.session) {
          throw new Error(resolveJson.error || 'That phone number or password is not right.');
        }
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: resolveJson.session.access_token,
          refresh_token: resolveJson.session.refresh_token,
        });
        if (sessionError) throw sessionError;
        data = { session: resolveJson.session };
      } else {
        const result = await supabase.auth.signInWithPassword({ email: typed, password });
        if (result.error) throw result.error;
        data = { session: result.data.session };
      }

      if (data.session) {
        // Set auth cookie so middleware can verify the session server-side.
        // Omit Secure on HTTP (e.g. localhost) so the cookie is sent and middleware can validate.
        const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
        document.cookie = `sb-access-token=${data.session.access_token}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax${secure}`;
        document.cookie = `sb-refresh-token=${data.session.refresh_token}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax${secure}`;

        // Full-page redirect so the first request to /admin includes the cookie (avoids RSC fetch race).
        // Go back to the page that asked for the sign-in, when it is one of the admin pages.
        const wanted = searchParams.get('redirect') || '';
        const safe = wanted.startsWith('/admin') && !wanted.startsWith('/admin/login') && !wanted.includes('//');
        window.location.href = safe ? wanted : '/admin';
      }
    } catch (err: any) {
      const msg = err?.message || 'Login failed';
      if (msg.toLowerCase().includes('invalid login credentials') || msg.toLowerCase().includes('invalid_credentials')) {
        setError('That email or password is not right. Check both and try again.');
      } else {
        setError(msg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-100 via-white to-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <img
              src="/frebys-logo.png"
              alt="Freby’s Fashion GH"
              className="h-16 sm:h-20 w-auto object-contain mx-auto"
            />
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mt-6 mb-2">Admin Login</h1>
          <p className="text-gray-600">Sign in to access the admin dashboard</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-3">
              <i className="ri-error-warning-line text-red-600 text-xl mt-0.5"></i>
              <div>
                <p className="text-red-800 font-semibold">Login Failed</p>
                <p className="text-red-700 text-sm mt-1">{error}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Email or Phone
              </label>
              <div className="relative">
                <i
                  className={`${looksLikeEmail ? 'ri-mail-line' : 'ri-smartphone-line'} absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg`}
                ></i>
                <input
                  type="text"
                  inputMode={looksLikeEmail ? 'email' : 'text'}
                  autoComplete="username"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-gray-900"
                  placeholder="admin@frebysfashion.com or 0244720197"
                  required
                />
              </div>
              <p className="mt-1.5 text-xs text-gray-500">
                Use your admin email or the phone number on your admin profile.
              </p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Password
              </label>
              <div className="relative">
                <i className="ri-lock-line absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg"></i>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-12 pr-12 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-gray-900"
                  placeholder="Enter your password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-900 w-5 h-5 flex items-center justify-center"
                >
                  <i className={`${showPassword ? 'ri-eye-off-line' : 'ri-eye-line'} text-lg`} aria-hidden></i>
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || verifying}
              className="w-full bg-gray-900 hover:bg-gray-800 text-white py-3 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {isLoading || verifying ? (
                <span className="flex items-center justify-center space-x-2">
                  <i className="ri-loader-4-line animate-spin"></i>
                  <span>{verifying ? 'Verifying...' : 'Signing in...'}</span>
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>
          <p className="mt-4 text-center text-sm">
            <Link href="/auth/forgot-password" className="font-semibold text-gray-900 underline">
              Forgot your password?
            </Link>
          </p>

          {/* Admin access is restricted to users with admin/staff role */}
        </div>

        <div className="mt-6 text-center">
          <Link href="/" className="text-sm text-gray-600 hover:text-gray-900 transition-colors whitespace-nowrap">
            <i className="ri-arrow-left-line mr-2"></i>
            Back to Store
          </Link>
        </div>
      </div>
    </div>
  );
}
