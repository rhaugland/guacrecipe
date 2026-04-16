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

type Mode = "daily" | "weekly";

const WEATHER_SCALE = [
  { range: "0–1", emoji: "☀️", label: "Sunny" },
  { range: "2–3", emoji: "⛅", label: "Partly cloudy" },
  { range: "4–5", emoji: "☁️", label: "Cloudy" },
  { range: "6–7", emoji: "🌧️", label: "Rainy" },
  { range: "8+", emoji: "⛈️", label: "Storm" },
];

const DAY_LABELS = ["M", "T", "W", "T", "F"];

function forecastBlurb(code: string, count: number): string {
  if (count === 0) return "Nothing on your calendar today.";
  if (code === "sunny") return "A light day. Plenty of breathing room.";
  if (code === "partly_cloudy") return "Manageable day with room to think.";
  if (code === "cloudy") return "Steady stream of meetings.";
  if (code === "rainy") return "Heavy day. Block recovery time.";
  return "Storm warning. Reschedule what you can.";
}

function shortBlurb(code: string, count: number): string {
  if (count === 0) return "Open day";
  if (code === "sunny") return "Light day";
  if (code === "partly_cloudy") return "Steady";
  if (code === "cloudy") return "Busy";
  if (code === "rainy") return "Heavy";
  return "Slammed";
}

function displayName(t: { name: string | null; email: string | null }): string {
  return t.name ?? t.email ?? "Teammate";
}

function initialOf(t: { name: string | null; email: string | null }): string {
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
  const [myWeek, setMyWeek] = useState<WeekDay[] | null>(null);
  const [team, setTeam] = useState<Teammate[] | null>(null);
  const [mode, setMode] = useState<Mode>("daily");
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
        setMyWeek(wk.week);
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
      setMyWeek(wk.week);
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

      {/* Segmented toggle — Apple-style pill */}
      <div className="flex justify-center pt-1">
        <div className="bg-white shadow-sm rounded-full p-1 inline-flex">
          {(["daily", "weekly"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-5 py-1.5 rounded-full text-sm font-medium transition-all ${
                mode === m
                  ? "bg-green-primary text-white shadow-sm"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              {m === "daily" ? "Daily" : "Weekly"}
            </button>
          ))}
        </div>
      </div>

      {/* Hero — your forecast */}
      <div className="bg-white rounded-3xl shadow-sm overflow-hidden">
        <div className="p-5 sm:p-8 text-center">
          <div className="text-7xl sm:text-8xl mb-3 leading-none">{data.weather.emoji}</div>
          <h2 className="text-2xl sm:text-3xl font-bold text-green-primary mb-1">{data.weather.label}</h2>
          <p className="text-gray-500 text-sm sm:text-base mb-5 px-2">{forecastBlurb(data.weather.code, data.count)}</p>

          {editing ? (
            <div className="bg-sky-light/40 rounded-2xl p-4 border border-sky-primary/20 max-w-sm mx-auto">
              <p className="text-sm text-gray-600 mb-3">How many meetings today?</p>
              <div className="flex items-center justify-center gap-3 mb-4">
                <button
                  onClick={() => setDraftCount(Math.max(0, draftCount - 1))}
                  className="w-12 h-12 rounded-full bg-white text-green-primary text-xl font-medium border border-gray-200 hover:bg-gray-50 active:scale-95 transition"
                  disabled={saving}
                >−</button>
                <div className="w-16 text-3xl font-semibold text-gray-800 tabular-nums">{draftCount}</div>
                <button
                  onClick={() => setDraftCount(Math.min(99, draftCount + 1))}
                  className="w-12 h-12 rounded-full bg-white text-green-primary text-xl font-medium border border-gray-200 hover:bg-gray-50 active:scale-95 transition"
                  disabled={saving}
                >+</button>
              </div>
              <div className="flex gap-2 justify-center">
                <button
                  onClick={() => setEditing(false)}
                  className="px-4 py-2 rounded-full text-sm text-gray-500 hover:bg-gray-100 transition"
                  disabled={saving}
                >Cancel</button>
                <button
                  onClick={() => saveCount(draftCount)}
                  className="px-5 py-2 rounded-full bg-green-primary text-white text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
                  disabled={saving}
                >{saving ? "Saving..." : "Save"}</button>
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

        {/* Your Mon–Fri strip — only in weekly mode */}
        {mode === "weekly" && myWeek && (
          <div className="border-t border-gray-100 px-4 sm:px-6 py-4 bg-gradient-to-b from-sky-light/20 to-transparent">
            <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
              {myWeek.map((day, i) => (
                <div
                  key={day.date}
                  className={`text-center rounded-xl py-2 sm:py-2.5 ${day.isToday ? "bg-white shadow-sm ring-1 ring-sky-primary/30" : ""}`}
                >
                  <div className={`text-[10px] sm:text-xs font-medium mb-0.5 ${day.isToday ? "text-green-primary" : "text-gray-400"}`}>
                    {DAY_LABELS[i]}
                  </div>
                  <div className="text-2xl sm:text-3xl mb-0.5 leading-none">{day.hasData ? day.weather.emoji : "·"}</div>
                  <div className={`text-[10px] sm:text-xs tabular-nums ${day.hasData ? "text-gray-600" : "text-gray-300"}`}>
                    {day.hasData ? day.count : "—"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Team */}
      {team && (
        <div className="bg-white rounded-3xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 sm:px-6 sm:py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Team {mode === "weekly" ? "— this week" : "— today"}</h3>
            <span className="text-xs text-gray-400">{team.length} {team.length === 1 ? "person" : "people"}</span>
          </div>

          {team.length === 0 ? (
            <p className="text-xs text-gray-400 py-8 text-center">No teammates yet. Invite people from your workspace settings.</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {team.map((t) => (
                <TeammateRow key={t.userId} teammate={t} mode={mode} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Forecast key */}
      <div className="bg-white rounded-3xl shadow-sm p-4 sm:p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Forecast key</h3>
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
      <div className="bg-white rounded-3xl shadow-sm p-4 sm:p-6">
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

function TeammateRow({ teammate, mode }: { teammate: Teammate; mode: Mode }) {
  const t = teammate;
  const todayWeather = t.today?.weather ?? null;
  const todayCount = t.today?.count ?? null;

  // Daily mode: compact row
  if (mode === "daily") {
    const subtitle = !t.connected && todayCount === null
      ? "Not connected"
      : todayCount === null
      ? "Open day"
      : `${todayCount} meeting${todayCount === 1 ? "" : "s"} • ${shortBlurb(todayWeather!.code, todayCount)}`;

    return (
      <div className="flex items-center gap-3 px-5 sm:px-6 py-3.5">
        <div className="w-10 h-10 rounded-full bg-sky-light flex items-center justify-center text-green-primary text-sm font-semibold shrink-0">
          {initialOf(t)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-medium text-gray-900 truncate">{displayName(t)}</div>
          <div className={`text-xs truncate ${!t.connected && todayCount === null ? "text-gray-300" : "text-gray-500"}`}>{subtitle}</div>
        </div>
        <div className="text-3xl shrink-0 leading-none" aria-label={todayWeather?.label ?? "no data"}>
          {todayWeather ? todayWeather.emoji : t.connected ? "·" : "—"}
        </div>
      </div>
    );
  }

  // Weekly mode: name + Mon-Fri strip
  const hasAnyData = t.week.some((d) => d.hasData);
  return (
    <div className="px-5 sm:px-6 py-3">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-9 h-9 rounded-full bg-sky-light flex items-center justify-center text-green-primary text-sm font-semibold shrink-0">
          {initialOf(t)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-medium text-gray-900 truncate">{displayName(t)}</div>
          {!t.connected && !hasAnyData && (
            <div className="text-xs text-gray-300">Not connected</div>
          )}
        </div>
      </div>
      <div className="grid grid-cols-5 gap-1.5 pl-12 pr-1">
        {t.week.map((day, i) => (
          <div
            key={day.date}
            className={`text-center rounded-lg py-1.5 ${day.isToday ? "bg-sky-light/50" : "bg-gray-50"}`}
          >
            <div className={`text-[10px] font-medium mb-0.5 ${day.isToday ? "text-green-primary" : "text-gray-400"}`}>
              {DAY_LABELS[i]}
            </div>
            <div className="text-xl mb-0.5 leading-none">{day.hasData ? day.weather.emoji : "·"}</div>
            <div className={`text-[10px] tabular-nums ${day.hasData ? "text-gray-600" : "text-gray-300"}`}>
              {day.hasData ? day.count : "—"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
