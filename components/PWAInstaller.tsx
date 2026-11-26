'use client';

import { useEffect, useState, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Global store for install prompt
let deferredPrompt: BeforeInstallPromptEvent | null = null;

export function usePWAInstall() {
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    setIsInstalled(
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true
    );

    if (deferredPrompt) setCanInstall(true);

    const handler = () => setCanInstall(!!deferredPrompt);
    window.addEventListener('pwa-prompt-ready', handler);
    return () => window.removeEventListener('pwa-prompt-ready', handler);
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return false;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setCanInstall(false);
      deferredPrompt = null;
    }
    return outcome === 'accepted';
  }, []);

  return { canInstall, isInstalled, install };
}

export default function PWAInstaller() {
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true) {
      setIsInstalled(true);
    }

    // Capture install prompt
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      deferredPrompt = e as BeforeInstallPromptEvent;
      window.dispatchEvent(new Event('pwa-prompt-ready'));
    };

    // Track installation
    const handleInstalled = () => {
      setIsInstalled(true);
      deferredPrompt = null;
      console.log('[PWA] App installed successfully');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleInstalled);

    // In development the script files keep the same names between edits, so a service worker
    // that caches them serves old code. Run it on the live site only, and clear one left behind.
    const isLiveSite = process.env.NODE_ENV === 'production';
    if (!isLiveSite && 'serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => registration.unregister());
      });
      if ('caches' in window) {
        caches.keys().then((keys) => keys.forEach((key) => caches.delete(key)));
      }
    }

    // Register service worker with update detection
    if (isLiveSite && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/service-worker.js', { scope: '/' })
        .then((registration) => {
          console.log('[PWA] Service Worker registered with scope:', registration.scope);

          // Check for updates every 60 minutes
          setInterval(() => {
            registration.update();
          }, 60 * 60 * 1000);

          // Listen for new service worker
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (!newWorker) return;

            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New version available
                window.dispatchEvent(new CustomEvent('sw-update-available', {
                  detail: { registration }
                }));
              }
            });
          });
        })
        .catch((error) => {
          console.error('[PWA] Service Worker registration failed:', error);
        });

      // Handle controller change (new SW activated)
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  // Add standalone mode class to body
  useEffect(() => {
    if (isInstalled) {
      document.body.classList.add('pwa-standalone');
      document.documentElement.classList.add('pwa-standalone');
    }
  }, [isInstalled]);

  return null;
}
