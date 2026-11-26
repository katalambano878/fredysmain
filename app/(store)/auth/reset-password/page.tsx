'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

function ResetPasswordForm() {
  const token = useSearchParams().get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Use a password of at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || 'We could not change your password. Ask for a new link and try again.');
        return;
      }
      setDone(true);
    } catch {
      setError('We could not reach the shop. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const field =
    'w-full px-4 py-3 border-2 border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-gray-600 focus:border-gray-600';

  if (!token) {
    return (
      <>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">This link is not complete</h1>
        <p className="text-gray-700 mb-6">Open the link from your email or text again, or ask for a new one.</p>
        <Link
          href="/auth/forgot-password"
          className="block w-full text-center bg-gray-900 hover:bg-gray-800 text-white py-4 rounded-lg font-semibold transition-colors"
        >
          Get a new reset link
        </Link>
      </>
    );
  }

  if (done) {
    return (
      <>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">Your password is changed</h1>
        <p className="text-gray-700 mb-6">Sign in with your new password.</p>
        <Link
          href="/auth/login"
          className="block w-full text-center bg-gray-900 hover:bg-gray-800 text-white py-4 rounded-lg font-semibold transition-colors"
        >
          Sign in
        </Link>
        <p className="mt-4 text-center text-sm text-gray-700">
          Shop staff:{' '}
          <Link href="/admin/login" className="font-semibold text-gray-900 underline">
            sign in to the admin
          </Link>
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Choose a new password</h1>
      <p className="text-gray-700 mb-6">At least 8 characters.</p>
      <form onSubmit={submit} className="space-y-5" noValidate>
        <div>
          <label htmlFor="new-password" className="block text-sm font-medium text-gray-900 mb-2">
            New password
          </label>
          <input
            id="new-password"
            type={show ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            className={field}
          />
        </div>
        <div>
          <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-900 mb-2">
            Type it again
          </label>
          <input
            id="confirm-password"
            type={show ? 'text' : 'password'}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            className={field}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="w-4 h-4 accent-gray-900" />
          Show passwords
        </label>
        <p role="alert" className="min-h-[1.25rem] text-sm text-red-700">
          {error}
        </p>
        <button
          type="submit"
          disabled={saving}
          className="w-full bg-gray-900 hover:bg-gray-800 text-white py-4 rounded-lg font-semibold transition-colors disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Change password'}
        </button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <Suspense fallback={<p className="text-gray-700">Loading…</p>}>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
