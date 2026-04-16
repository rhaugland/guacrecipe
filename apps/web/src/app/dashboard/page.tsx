"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "../../hooks/useAuth";
import { api } from "../../lib/api-client";

type WeatherState = {
  date: string;
  count: number;
  source: string;
  weather: { code: string; emoji: string; label: string };
  calendarConnected: boolean;
};

type GoogleStatus = {
  connected: boolean;
  email: string | null;
  configured: boolean;
};

type WeekDay = {
  date: string;
  isToday: boolean;
  count: number;
  source?: string;
  weather: { code: string; emoji: string; label: string };
  hasData: boolean;
};

type Teammate = {
  userId: string;
  name: string | null;
  email: string | null;
  connected: boolean;
  today: { count: number; weather: { code: string; emoji: string; label: string } } | null;
  week: WeekDay[];
};

const WEATHER_SCALE = [
  { range: "0–1", emoji: "☀️", label: "Sunny" },
  { range: "2–3", emoji: "⛅", label: "Partly cloudy" },
  { range: "4–5", emoji: "☁️", label: "Cloudy" },
  { range: "6–7", emoji: "🌧️", label: "Rainy" },
  { range: "8+", emoji: "⛈️", label: "Storm" },
];

const DAY_LABELS = ["M", "T", "W", "T", "F"];

function forecastBlurb(code: string, count: number): string {
  if (count === 0) return "Nothing on your calendar today. Make the most of it.";
  if (code === "sunny") return "A light day. Plenty of breathing room.";
  if (code === "partly_cloudy") return "A manageable day with room to think.";
  if (code === "cloudy") return "Steady stream of meetings — pace yourself.";
  if (code === "rainy") return "Heavy day. Block recovery time tomorrow.";
  return "Storm warning. Reschedule what you can.";
}

function displayName(t: Teammate): string {
  return t.name ?? t.email ?? "Teammate";
}

function initialOf(t: Teammate): string {
  const source = t.name ?? t.email ?? "?";
  return source.trim().charAt(0).toUpperCase() || "?";
}

export default function WeatherPage() {
  return (
    <Suspense fallback={<div className="text-green-primary text-lg text-center py-8">Loading...</div>}>
      <WeatherPageInner />
    </Suspense>
  );
}

function WeatherPageInner() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<WeatherState | null>(null);
  const [google, setGoogle] = useState<GoogleStatus | null>(null);
  const [week, setWeek] = useState<WeekDay[] | null>(null);
  const [team, setTeam] = useState<Teammate[] | null>(null);
  const [expandedTeammate, setExpandedTeammate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [draftCount, setDraftCount] = useState(0);
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      api.weather.get(),
      api.google.status(),
      api.weather.week(),
      api.weather.team(),
    ])
      .then(([w, g, wk, tm]) => {
        setData(w);
        setGoogle(g);
        setWeek(wk.week);
        setTeam(tm.teammates);
      })
      .catch((err) => console.error("[weather] load failed", err))
      .finally(() => setLoading(false));
  }, [user]);

  // Handle ?google=connected or ?google=error redirect from OAuth callback
  useEffect(() => {
    const status = searchParams.get("google");
    if (!status) return;

    if (status === "connected") {
      setBanner({ kind: "ok", text: "Google Calendar connected. Your forecast will update from your meetings." });
    } else if (status === "error") {
      const reason = searchParams.get("reason") ?? "unknown";
      setBanner({ kind: "err", text: `Couldn't connect Google Calendar (${reason}). Try again.` });
    }

    router.replace("/dashboard", { scroll: false });

    const timer = setTimeout(() => setBanner(null), 6000);
    return () => clearTimeout(timer);
  }, [searchParams, router]);

  if (!user || loading) {
    return <div className="text-green-primary text-lg text-center py-8">Loading...</div>;
  }

  if (!data) {
    return <div className="text-gray-500 text-center py-8">Couldn&apos;t load your weather. Refresh and try again.</div>;
  }

  const startEdit = () => {
    setDraftCount(data.count);
    setEditing(true);
  };

  const refreshWeek = async () => {
    try {
      const wk = await api.weather.week();
      setWeek(wk.week);
    } catch (err) {
      console.error("[weather] week refresh failed", err);
    }
  };

  const saveCount = async (count: number) => {
    setSaving(true);
    try {
      const updated = await api.weather.setCount(count);
      setData({ ...data, ...updated });
      setEditing(false);
      // Keep week in sync after manual edit
      refreshWeek();
    } catch (err) {
      console.error("[weather] save failed", err);
    } finally {
      setSaving(false);
    }
  };

  const connectGoogle = () => {
    window.location.href = api.google.connectUrl();
  };

  const disconnectGoogle = async () => {
    try {
      await api.google.disconnect();
      setGoogle({ ...(google ?? { configured: true }), connected: false, email: null });
      setBanner({ kind: "ok", text: "Google Calendar disconnected." });
      setTimeout(() => setBanner(null), 4000);
    } catch (err) {
      console.error("[google] disconnect failed", err);
    }
  };

  const syncFromGoogle = async () => {
    setSyncing(true);
    try {
      const synced = await api.google.sync();
      const fresh = await api.weather.get();
      setData(fresh);
      refreshWeek();
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
    <div className="max-w-2xl mx-auto space-y-3 sm:space-y-4 px-3 sm:px-0 pb-20">
      {banner && (
        <div className={`rounded-xl px-4 py-3 text-sm ${banner.kind === "ok" ? "bg-sky-light/60 text-green-primary" : "bg-red-50 text-red-600"}`}>
          {banner.text}
        </div>
      )}

      {/* Today hero — slimmed on mobile */}
      <div className="bg-white rounded-2xl shadow-sm p-5 sm:p-8 md:p-12 text-center">
        <div className="text-6xl sm:text-7xl md:text-8xl mb-3 sm:mb-4">{data.weather.emoji}</div>
        <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-green-primary mb-1.5 sm:mb-2">{data.weather.label}</h2>
        <p className="text-gray-500 text-xs sm:text-sm md:text-base mb-4 sm:mb-6 px-2">{forecastBlurb(data.weather.code, data.count)}</p>

        {editing ? (
          <div className="bg-sky-light/40 rounded-xl p-4 border border-sky-primary/20 max-w-sm mx-auto">
            <p className="text-sm text-gray-600 mb-3">How many meetings today?</p>
            <div className="flex items-center justify-center gap-3 mb-4">
              <button
                onClick={() => setDraftCount(Math.max(0, draftCount - 1))}
                className="w-12 h-12 rounded-full bg-white text-green-primary text-xl font-medium border border-gray-200 hover:bg-gray-50 active:scale-95 transition"
                disabled={saving}
              >
                −
              </button>
              <div className="w-16 text-3xl font-semibold text-gray-800 tabular-nums">{draftCount}</div>
              <button
                onClick={() => setDraftCount(Math.min(99, draftCount + 1))}
                className="w-12 h-12 rounded-full bg-white text-green-primary text-xl font-medium border border-gray-200 hover:bg-gray-50 active:scale-95 transition"
                disabled={saving}
              >
                +
              </button>
            </div>
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => setEditing(false)}
                className="px-4 py-2 rounded-full text-sm text-gray-500 hover:bg-gray-100 transition"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                onClick={() => saveCount(draftCount)}
                className="px-5 py-2 rounded-full bg-green-primary text-white text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
                disabled={saving}
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={startEdit}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-sky-light/60 hover:bg-sky-light text-green-primary text-sm font-medium transition"
          >
            <span className="text-base">📅</span>
            {data.count === 0 ? "Set today's meeting count" : `${data.count} meeting${data.count === 1 ? "" : "s"} today — edit`}
          </button>
        )}

        {data.source === "google_calendar" && (
          <p className="text-xs text-gray-400 mt-3">Pulled from Google Calendar</p>
        )}
      </div>

      {/* Your work week */}
      {week && (
        <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">Your week</h3>
            <span className="text-xs text-gray-400">Mon – Fri</span>
          </div>
          <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
            {week.map((day, i) => (
              <div
                key={day.date}
                className={`text-center rounded-xl py-2 sm:py-3 ${day.isToday ? "bg-sky-light/60 ring-1 ring-sky-primary/30" : "bg-gray-50"}`}
              >
                <div className={`text-[10px] sm:text-xs font-medium mb-0.5 ${day.isToday ? "text-green-primary" : "text-gray-400"}`}>
                  {DAY_LABELS[i]}
                </div>
                <div className="text-2xl sm:text-3xl mb-0.5">{day.hasData ? day.weather.emoji : "·"}</div>
                <div className={`text-[10px] sm:text-xs tabular-nums ${day.hasData ? "text-gray-600" : "text-gray-300"}`}>
                  {day.hasData ? day.count : "—"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Team */}
      {team && (
        <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">Team</h3>
            <span className="text-xs text-gray-400">{team.length} {team.length === 1 ? "person" : "people"}</span>
          </div>

          {team.length === 0 ? (
            <p className="text-xs text-gray-400 py-4 text-center">No teammates yet. Invite people from your workspace settings.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {team.map((t) => {
                const expanded = expandedTeammate === t.userId;
                const todayDisplay = t.today
                  ? { emoji: t.today.weather.emoji, label: `${t.today.count} meeting${t.today.count === 1 ? "" : "s"}` }
                  : t.connected
                  ? { emoji: "·", label: "no events" }
                  : { emoji: "—", label: "not connected" };

                return (
                  <div key={t.userId} className="py-2.5 first:pt-0 last:pb-0">
                    <button
                      onClick={() => setExpandedTeammate(expanded ? null : t.userId)}
                      className="w-full flex items-center gap-3 py-1.5 px-1 rounded-lg hover:bg-gray-50 active:bg-gray-100 transition text-left"
                    >
                      <div className="w-9 h-9 rounded-full bg-sky-light flex items-center justify-center text-green-primary text-sm font-semibold shrink-0">
                        {initialOf(t)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-800 truncate">{displayName(t)}</div>
                        <div className="text-xs text-gray-400 truncate">{todayDisplay.label}</div>
                      </div>
                      <div className="text-2xl shrink-0" aria-label={t.today?.weather.label ?? "no data"}>
                        {todayDisplay.emoji}
                      </div>
                      <svg
                        className={`w-4 h-4 text-gray-300 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clipRule="evenodd" />
                      </svg>
                    </button>

                    {expanded && (
                      <div className="mt-2 pl-12 pr-1">
                        {!t.connected && t.week.every((d) => !d.hasData) ? (
                          <div className="rounded-xl bg-sky-light/30 p-3 text-xs text-gray-500">
                            Hasn&apos;t connected their calendar yet. They&apos;ll show up here once they do.
                          </div>
                        ) : (
                          <div className="grid grid-cols-5 gap-1.5">
                            {t.week.map((day, i) => (
                              <div
                                key={day.date}
                                className={`text-center rounded-lg py-1.5 ${day.isToday ? "bg-sky-light/50" : "bg-gray-50"}`}
                              >
                                <div className={`text-[10px] font-medium mb-0.5 ${day.isToday ? "text-green-primary" : "text-gray-400"}`}>
                                  {DAY_LABELS[i]}
                                </div>
                                <div className="text-xl mb-0.5">{day.hasData ? day.weather.emoji : "·"}</div>
                                <div className={`text-[10px] tabular-nums ${day.hasData ? "text-gray-600" : "text-gray-300"}`}>
                                  {day.hasData ? day.count : "—"}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Forecast key */}
      <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">Forecast key</h3>
          <span className="text-xs text-gray-400">By meetings/day</span>
        </div>
        <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
          {WEATHER_SCALE.map((w) => (
            <div key={w.range} className="text-center">
              <div className="text-xl sm:text-2xl mb-0.5 sm:mb-1">{w.emoji}</div>
              <div className="text-[10px] sm:text-xs font-medium text-gray-700">{w.range}</div>
              <div className="text-[9px] sm:text-[10px] text-gray-400 leading-tight">{w.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Google Calendar */}
      <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="text-2xl shrink-0">📆</div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-gray-700 mb-1">Google Calendar</h3>
            {google?.connected ? (
              <>
                <p className="text-xs text-gray-500 mb-3 truncate">
                  Connected as <span className="font-medium text-gray-700">{google.email ?? "your Google account"}</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={syncFromGoogle}
                    disabled={syncing}
                    className="px-4 py-2 rounded-full bg-green-primary text-white text-xs font-medium hover:opacity-90 transition disabled:opacity-50"
                  >
                    {syncing ? "Syncing..." : "Sync today"}
                  </button>
                  <button
                    onClick={disconnectGoogle}
                    className="px-4 py-2 rounded-full bg-gray-100 text-gray-600 text-xs font-medium hover:bg-gray-200 transition"
                  >
                    Disconnect
                  </button>
                </div>
              </>
            ) : google?.configured === false ? (
              <p className="text-xs text-gray-400">
                Calendar integration isn&apos;t configured on this server yet.
              </p>
            ) : (
              <>
                <p className="text-xs text-gray-500 mb-3">
                  Auto-update your forecast from your primary calendar.
                </p>
                <button
                  onClick={connectGoogle}
                  className="px-4 py-2 rounded-full bg-green-primary text-white text-xs font-medium hover:opacity-90 transition"
                >
                  Connect Google Calendar
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
