"use client";
import { useState, useEffect } from "react";
import { CollapsibleCard } from "./CollapsibleCard";
import { api } from "../../../lib/api-client";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua);
  return isIos;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // iOS Safari
  if ("standalone" in navigator && (navigator as unknown as { standalone: boolean }).standalone) return true;
  // PWA/Android
  return window.matchMedia?.("(display-mode: standalone)").matches ?? false;
}

export function PushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [supported, setSupported] = useState(false);
  const [needsHomeScreen, setNeedsHomeScreen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hasServiceWorker = "serviceWorker" in navigator;
    const hasPushManager = "PushManager" in window;
    const hasNotification = "Notification" in window;
    const isSupported = hasServiceWorker && hasPushManager && hasNotification;

    // iOS Safari: push only works when app is added to home screen
    if (isIosSafari() && !isStandalone()) {
      setNeedsHomeScreen(true);
      setSupported(false);
      setLoading(false);
      return;
    }

    setSupported(isSupported);

    if (!isSupported) {
      setLoading(false);
      return;
    }

    setPermission(Notification.permission);

    // Register service worker and check subscription status
    navigator.serviceWorker.register("/sw.js").then(async (registration) => {
      try {
        // Make sure SW is active before checking subscription
        if (registration.installing || registration.waiting) {
          await new Promise<void>((resolve) => {
            const sw = registration.installing ?? registration.waiting;
            if (!sw) return resolve();
            sw.addEventListener("statechange", () => {
              if (sw.state === "activated") resolve();
            });
          });
        }
        const { subscribed: s } = await api.push.status();
        setSubscribed(s);
      } catch (err) {
        console.error("[push] status check failed", err);
      }
      setLoading(false);
    }).catch((err) => {
      console.error("[push] service worker registration failed", err);
      setError("Couldn't register service worker. Refresh and try again.");
      setLoading(false);
    });
  }, []);

  const enablePush = async () => {
    setError(null);

    if (!VAPID_PUBLIC_KEY) {
      setError("Push notifications aren't configured on the server yet. Contact support.");
      console.error("[push] NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set");
      return;
    }

    try {
      setLoading(true);
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        setLoading(false);
        if (perm === "denied") {
          setError("You blocked notifications. Enable them in your browser settings to turn this on.");
        }
        return;
      }

      const registration = await navigator.serviceWorker.ready;

      // Reuse existing subscription if there is one (avoids InvalidStateError)
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as ArrayBuffer,
        });
      }

      await api.push.subscribe(subscription.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } });
      setSubscribed(true);
    } catch (err) {
      console.error("[push] enable failed", err);
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(`Couldn't enable notifications: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const disablePush = async () => {
    setError(null);
    try {
      setLoading(true);
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await api.push.unsubscribe(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setSubscribed(false);
    } catch (err) {
      console.error("[push] disable failed", err);
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(`Couldn't turn off notifications: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  if (needsHomeScreen) {
    return (
      <CollapsibleCard title="Push Notifications">
        <div className="py-4">
          <p className="text-sm text-gray-600 mb-2">
            To get push notifications on iPhone, add New Sky to your home screen first.
          </p>
          <p className="text-xs text-gray-400">
            Tap the share icon <span aria-label="share">⎙</span> in Safari, then &quot;Add to Home Screen&quot;. Then open New Sky from the home screen icon and come back here.
          </p>
        </div>
      </CollapsibleCard>
    );
  }

  if (!supported) {
    return (
      <CollapsibleCard title="Push Notifications">
        <div className="py-4">
          <p className="text-sm text-gray-600">
            Your browser doesn&apos;t support push notifications. Try Chrome, Safari 16.4+, or Firefox.
          </p>
        </div>
      </CollapsibleCard>
    );
  }

  const statusText = subscribed
    ? "Push notifications are on. You'll get alerts when someone sends you a message."
    : permission === "denied"
      ? "Notifications are blocked. Allow them in your browser settings, then come back here."
      : "Get a push alert when someone sends you a message.";

  return (
    <CollapsibleCard title="Push Notifications">
      <div className="py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1">
            <p className="text-sm text-gray-600">{statusText}</p>
          </div>
          <button
            onClick={subscribed ? disablePush : enablePush}
            disabled={loading || permission === "denied"}
            className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              subscribed
                ? "bg-green-primary text-white hover:bg-green-primary/90"
                : permission === "denied"
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                  : "bg-green-primary text-white hover:bg-green-primary/90"
            } ${loading ? "opacity-50 cursor-wait" : ""}`}
          >
            {loading ? "..." : subscribed ? "On" : "Enable"}
          </button>
        </div>
        {error && (
          <p className="text-xs text-red-500 mt-3">{error}</p>
        )}
        {subscribed && !error && (
          <p className="text-xs text-gray-400 mt-2">
            Notifications will say things like &quot;John sent a message to your Email&quot;
          </p>
        )}
      </div>
    </CollapsibleCard>
  );
}
