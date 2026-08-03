'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Idle session warning for authenticated customers only.
 * IMPORTANT: must NOT setState on every scroll/touch — that froze the storefront.
 */
export default function SessionTimeoutWarning() {
  const [enabled, setEnabled] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const lastActivityRef = useRef(Date.now());
  const warningVisibleRef = useRef(false);

  const IDLE_TIMEOUT = 25 * 60 * 1000;
  const WARNING_TIME = 60 * 1000;

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (mounted) setEnabled(!!session?.user);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setEnabled(!!session?.user);
      if (!session?.user) {
        setShowWarning(false);
        warningVisibleRef.current = false;
      }
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const activityEvents: Array<keyof WindowEventMap> = [
      'mousedown',
      'keydown',
      'scroll',
      'touchstart',
    ];

    const onActivity = () => {
      lastActivityRef.current = Date.now();
      if (warningVisibleRef.current) {
        warningVisibleRef.current = false;
        setShowWarning(false);
        setCountdown(60);
      }
    };

    // passive scroll/touch — never setState unless warning is open
    activityEvents.forEach((event) => {
      window.addEventListener(event, onActivity, { passive: true });
    });

    const checkInterval = setInterval(() => {
      const idle = Date.now() - lastActivityRef.current;
      if (idle >= IDLE_TIMEOUT) {
        localStorage.setItem('session_expired', 'true');
        window.location.href = '/auth/login';
        return;
      }
      if (idle >= IDLE_TIMEOUT - WARNING_TIME) {
        const remaining = Math.ceil((IDLE_TIMEOUT - idle) / 1000);
        if (!warningVisibleRef.current) {
          warningVisibleRef.current = true;
          setShowWarning(true);
        }
        setCountdown(remaining);
      }
    }, 1000);

    return () => {
      activityEvents.forEach((event) => {
        window.removeEventListener(event, onActivity);
      });
      clearInterval(checkInterval);
    };
  }, [enabled, IDLE_TIMEOUT, WARNING_TIME]);

  const handleLogout = () => {
    localStorage.setItem('session_expired', 'true');
    window.location.href = '/auth/login';
  };

  const handleStayLoggedIn = () => {
    lastActivityRef.current = Date.now();
    warningVisibleRef.current = false;
    setShowWarning(false);
    setCountdown(60);
  };

  if (!enabled || !showWarning) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
            <i className="ri-time-line text-2xl text-orange-600"></i>
          </div>
          <div>
            <h3 className="font-bold text-lg">Session Timeout Warning</h3>
            <p className="text-sm text-gray-600">Your session is about to expire</p>
          </div>
        </div>

        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-gray-700 mb-2">You will be automatically logged out in:</p>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-orange-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-orange-500 transition-all duration-1000"
                style={{ width: `${(countdown / 60) * 100}%` }}
              />
            </div>
            <span className="text-2xl font-bold text-orange-600 tabular-nums">{countdown}s</span>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleLogout}
            className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium whitespace-nowrap"
          >
            Logout Now
          </button>
          <button
            type="button"
            onClick={handleStayLoggedIn}
            className="flex-1 px-4 py-2.5 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors font-medium whitespace-nowrap"
          >
            Stay Logged In
          </button>
        </div>

        <p className="text-xs text-gray-500 text-center mt-4">
          For your security, sessions expire after 25 minutes of inactivity
        </p>
      </div>
    </div>
  );
}
