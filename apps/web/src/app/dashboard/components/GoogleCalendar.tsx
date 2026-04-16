"use client";
import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { CollapsibleCard } from "./CollapsibleCard";
import { api } from "../../../lib/api-client";

type GoogleStatus = {
  connected: boolean;
  email: string | null;
  configured: boolean;
};

export function GoogleCalendar() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    api.google.status()
      .then(setStatus)
      .catch((err) => console.error("[google] status failed", err))
      .finally(() => setLoading(false));
  }, []);

  // Handle ?google=connected redirect from OAuth callback
  useEffect(() => {
    const s = searchParams.get("google");
    if (!s) return;

    if (s === "connected") {
      setBanner({ kind: "ok", text: "Google Calendar connected. Your forecast will update from your meetings." });
      // refresh status
      api.google.status().then(setStatus).catch(() => {});
    } else if (s === "error") {
      const reason = searchParams.get("reason") ?? "unknown";
      setBanner({ kind: "err", text: `Couldn't connect Google Calendar (${reason}). Try again.` });
    }

    router.replace("/dashboard/settings", { scroll: false });

    const timer = setTimeout(() => setBanner(null), 6000);
    return () => clearTimeout(timer);
  }, [searchParams, router]);

  const connect = () => {
    window.location.href = api.google.connectUrl();
  };

  const disconnect = async () => {
    try {
      await api.google.disconnect();
      setStatus({ ...(status ?? { configured: true }), connected: false, email: null });
      setBanner({ kind: "ok", text: "Google Calendar disconnected." });
      setTimeout(() => setBanner(null), 4000);
    } catch (err) {
      console.error("[google] disconnect failed", err);
    }
  };

  const sync = async () => {
    setSyncing(true);
    try {
      const synced = await api.google.sync();
      setBanner({ kind: "ok", text: `Synced — ${synced.count} meeting${synced.count === 1 ? "" : "s"} today.` });
      setTimeout(() => setBanner(null), 4000);
    } catch (err) {
      console.error("[google] sync failed", err);
      setBanner({ kind: "err", text: "Sync failed. Try again." });
      setTimeout(() => setBanner(null), 4000);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <CollapsibleCard title="Google Calendar">
      {loading ? (
        <p className="text-xs text-gray-400">Loading…</p>
      ) : (
        <>
          {banner && (
            <div className={`mb-3 rounded-lg px-3 py-2 text-xs ${banner.kind === "ok" ? "bg-sky-light/60 text-green-primary" : "bg-red-50 text-red-600"}`}>
              {banner.text}
            </div>
          )}

          {status?.connected ? (
            <>
              <p className="text-xs text-gray-500 mb-3 truncate">
                Connected as <span className="font-medium text-gray-700">{status.email ?? "your Google account"}</span>
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={sync}
                  disabled={syncing}
                  className="px-4 py-2 rounded-full bg-green-primary text-white text-xs font-medium hover:opacity-90 transition disabled:opacity-50"
                >
                  {syncing ? "Syncing..." : "Sync today"}
                </button>
                <button
                  onClick={disconnect}
                  className="px-4 py-2 rounded-full bg-gray-100 text-gray-600 text-xs font-medium hover:bg-gray-200 transition"
                >
                  Disconnect
                </button>
              </div>
            </>
          ) : status?.configured === false ? (
            <p className="text-xs text-gray-400">
              Calendar integration isn&apos;t configured on this server yet.
            </p>
          ) : (
            <>
              <p className="text-xs text-gray-500 mb-3">
                Auto-update your weather forecast from your primary calendar.
              </p>
              <button
                onClick={connect}
                className="px-4 py-2 rounded-full bg-green-primary text-white text-xs font-medium hover:opacity-90 transition"
              >
                Connect Google Calendar
              </button>
            </>
          )}
        </>
      )}
    </CollapsibleCard>
  );
}
