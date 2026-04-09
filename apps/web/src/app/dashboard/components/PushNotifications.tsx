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

export function PushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    const isSupported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setSupported(isSupported);

    if (!isSupported) {
      setLoading(false);
      return;
    }

    setPermission(Notification.permission);

    // Register service worker and check subscription status
    navigator.serviceWorker.register("/sw.js").then(async () => {
      try {
        const { subscribed: s } = await api.push.status();
        setSubscribed(s);
      } catch {
        // ignore
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const enablePush = async () => {
    try {
      setLoading(true);
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        setLoading(false);
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as ArrayBuffer,
      });

      await api.push.subscribe(subscription.toJSON());
      setSubscribed(true);
    } catch (err) {
      console.error("Failed to enable push:", err);
    } finally {
      setLoading(false);
    }
  };

  const disablePush = async () => {
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
      console.error("Failed to disable push:", err);
    } finally {
      setLoading(false);
    }
  };

  if (!supported) return null;

  const statusText = subscribed
    ? "Push notifications are enabled. You'll get notified when someone sends you a message."
    : permission === "denied"
      ? "Notifications are blocked in your browser settings. Please allow notifications for this site."
      : "Enable push notifications to get alerts when someone sends you a message.";

  return (
    <CollapsibleCard title="Push Notifications">
      <div className="py-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex-1">
            <p className="text-sm text-gray-600">{statusText}</p>
          </div>
          <button
            onClick={subscribed ? disablePush : enablePush}
            disabled={loading || permission === "denied"}
            className={`ml-4 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              subscribed
                ? "bg-green-primary text-white hover:bg-green-primary/90"
                : permission === "denied"
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            } ${loading ? "opacity-50 cursor-wait" : ""}`}
          >
            {loading ? "..." : subscribed ? "Enabled" : "Enable"}
          </button>
        </div>
        {subscribed && (
          <p className="text-xs text-gray-400 mt-1">
            Notifications will say things like &quot;John sent a message to your Email&quot;
          </p>
        )}
      </div>
    </CollapsibleCard>
  );
}
