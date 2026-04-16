"use client";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import { api } from "../../lib/api-client";

type WeatherState = {
  date: string;
  count: number;
  source: string;
  weather: { code: string; emoji: string; label: string };
  calendarConnected: boolean;
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

function shortBlurb(code: string | null, count: number): string {
  if (count === 0) return "Open day";
  if (code === "sunny") return "Light day";
  if (code === "partly_cloudy") return "Steady";
  if (code === "cloudy") return "Busy";
  if (code === "rainy") return "Heavy";
  if (code === "thunderstorm") return "Slammed";
  return "—";
}

function displayName(t: { name: string | null; email: string | null }): string {
  return t.name ?? t.email ?? "Teammate";
}

function initialOf(t: { name: string | null; email: string | null }): string {
  const source = t.name ?? t.email ?? "?";
  return source.trim().charAt(0).toUpperCase() || "?";
}

export default function WeatherPage() {
  const { user } = useAuth();
  const [data, setData] = useState<WeatherState | null>(null);
  const [myWeek, setMyWeek] = useState<WeekDay[] | null>(null);
  const [team, setTeam] = useState<Teammate[] | null>(null);
  const [mode, setMode] = useState<Mode>("daily");
  const [loading, setLoading] = useState(true);
  const [keyOpen, setKeyOpen] = useState(false);
  const keyRef = useRef<HTMLDivElement>(null);

  // Inline edit for own meeting count
  const [editing, setEditing] = useState(false);
  const [draftCount, setDraftCount] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      api.weather.get(),
      api.weather.week(),
      api.weather.team(),
    ])
      .then(([w, wk, tm]) => {
        setData(w);
        setMyWeek(wk.week);
        setTeam(tm.teammates);
      })
      .catch((err) => console.error("[weather] load failed", err))
      .finally(() => setLoading(false));
  }, [user]);

  // Click-outside to close forecast key popover
  useEffect(() => {
    if (!keyOpen) return;
    const handler = (e: MouseEvent) => {
      if (keyRef.current && !keyRef.current.contains(e.target as Node)) {
        setKeyOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [keyOpen]);

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

  const saveCount = async (count: number) => {
    setSaving(true);
    try {
      const updated = await api.weather.setCount(count);
      setData({ ...data, ...updated });
      setEditing(false);
      // Refresh week so today's cell updates
      const wk = await api.weather.week();
      setMyWeek(wk.week);
    } catch (err) {
      console.error("[weather] save failed", err);
    } finally {
      setSaving(false);
    }
  };

  const myMate = {
    name: user.name ?? null,
    email: user.email ?? null,
  };

  return (
    <div className="max-w-2xl mx-auto space-y-3 px-3 sm:px-0 pb-20">
      {/* Header bar: toggle in center, key in right corner */}
      <div className="relative flex items-center justify-center pt-1">
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
        <div ref={keyRef} className="absolute right-0 top-1/2 -translate-y-1/2">
          <button
            onClick={() => setKeyOpen((v) => !v)}
            className="text-xs text-gray-400 hover:text-green-primary transition px-2 py-1"
          >
            Key
          </button>
          {keyOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 bg-white rounded-2xl shadow-lg border border-gray-100 p-4 w-64">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Forecast key</h4>
                <span className="text-[10px] text-gray-400">By meetings/day</span>
              </div>
              <div className="space-y-2">
                {WEATHER_SCALE.map((w) => (
                  <div key={w.range} className="flex items-center gap-3">
                    <div className="text-xl w-7 text-center">{w.emoji}</div>
                    <div className="flex-1">
                      <div className="text-xs font-medium text-gray-700">{w.label}</div>
                      <div className="text-[10px] text-gray-400">{w.range} meetings</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* People list — you on top, teammates below */}
      <div className="bg-white rounded-3xl shadow-sm overflow-hidden divide-y divide-gray-50">
        {/* Your row */}
        <PersonRow
          person={myMate}
          isMe={true}
          mode={mode}
          today={{ count: data.count, weather: data.weather }}
          week={myWeek ?? []}
          connected={data.calendarConnected}
          onEditCount={startEdit}
          editingCount={editing}
          draftCount={draftCount}
          onDraftChange={setDraftCount}
          onCancelEdit={() => setEditing(false)}
          onSaveCount={() => saveCount(draftCount)}
          saving={saving}
        />

        {/* Teammates */}
        {team && team.length > 0 ? (
          team.map((t) => (
            <PersonRow
              key={t.userId}
              person={{ name: t.name, email: t.email }}
              isMe={false}
              mode={mode}
              today={t.today}
              week={t.week}
              connected={t.connected}
            />
          ))
        ) : team && team.length === 0 ? (
          <p className="text-xs text-gray-400 py-6 text-center">No teammates yet. Invite people from Settings.</p>
        ) : null}
      </div>
    </div>
  );
}

type PersonRowProps = {
  person: { name: string | null; email: string | null };
  isMe: boolean;
  mode: Mode;
  today: { count: number; weather: { code: string; emoji: string; label: string } } | null;
  week: WeekDay[];
  connected: boolean;
  // Edit-count props (only used for self)
  onEditCount?: () => void;
  editingCount?: boolean;
  draftCount?: number;
  onDraftChange?: (n: number) => void;
  onCancelEdit?: () => void;
  onSaveCount?: () => void;
  saving?: boolean;
};

function PersonRow(props: PersonRowProps) {
  const { person, isMe, mode, today, week, connected } = props;
  const hasAnyWeek = week.some((d) => d.hasData);

  // Daily mode
  if (mode === "daily") {
    const subtitle = !connected && today === null
      ? "Not connected"
      : today === null
      ? "Open day"
      : `${today.count} meeting${today.count === 1 ? "" : "s"} • ${shortBlurb(today.weather.code, today.count)}`;

    return (
      <div>
        <div
          className={`flex items-center gap-3 px-5 sm:px-6 py-3.5 ${isMe ? "cursor-pointer hover:bg-gray-50 active:bg-gray-100 transition" : ""}`}
          onClick={isMe && !props.editingCount ? props.onEditCount : undefined}
        >
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${isMe ? "bg-green-primary text-white" : "bg-sky-light text-green-primary"}`}>
            {initialOf(person)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <div className="text-[15px] font-medium text-gray-900 truncate">{displayName(person)}</div>
              {isMe && <span className="text-[10px] uppercase tracking-wider text-gray-400">You</span>}
            </div>
            <div className={`text-xs truncate ${!connected && today === null ? "text-gray-300" : "text-gray-500"}`}>
              {subtitle}{isMe && !props.editingCount ? " • tap to edit" : ""}
            </div>
          </div>
          <div className="text-3xl shrink-0 leading-none" aria-label={today?.weather.label ?? "no data"}>
            {today ? today.weather.emoji : connected ? "·" : "—"}
          </div>
        </div>

        {/* Inline edit — only for self */}
        {isMe && props.editingCount && (
          <div className="px-5 sm:px-6 pb-4 -mt-1">
            <div className="bg-sky-light/40 rounded-2xl p-4 border border-sky-primary/20">
              <p className="text-xs text-gray-600 mb-3 text-center">How many meetings today?</p>
              <div className="flex items-center justify-center gap-3 mb-3">
                <button
                  onClick={(e) => { e.stopPropagation(); props.onDraftChange?.(Math.max(0, (props.draftCount ?? 0) - 1)); }}
                  className="w-10 h-10 rounded-full bg-white text-green-primary text-xl font-medium border border-gray-200 hover:bg-gray-50 active:scale-95 transition"
                  disabled={props.saving}
                >−</button>
                <div className="w-12 text-2xl font-semibold text-gray-800 tabular-nums text-center">{props.draftCount}</div>
                <button
                  onClick={(e) => { e.stopPropagation(); props.onDraftChange?.(Math.min(99, (props.draftCount ?? 0) + 1)); }}
                  className="w-10 h-10 rounded-full bg-white text-green-primary text-xl font-medium border border-gray-200 hover:bg-gray-50 active:scale-95 transition"
                  disabled={props.saving}
                >+</button>
              </div>
              <div className="flex gap-2 justify-center">
                <button
                  onClick={(e) => { e.stopPropagation(); props.onCancelEdit?.(); }}
                  className="px-4 py-1.5 rounded-full text-xs text-gray-500 hover:bg-gray-100 transition"
                  disabled={props.saving}
                >Cancel</button>
                <button
                  onClick={(e) => { e.stopPropagation(); props.onSaveCount?.(); }}
                  className="px-5 py-1.5 rounded-full bg-green-primary text-white text-xs font-medium hover:opacity-90 transition disabled:opacity-50"
                  disabled={props.saving}
                >{props.saving ? "Saving…" : "Save"}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Weekly mode
  return (
    <div className="px-5 sm:px-6 py-3">
      <div className="flex items-center gap-3 mb-2">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${isMe ? "bg-green-primary text-white" : "bg-sky-light text-green-primary"}`}>
          {initialOf(person)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <div className="text-[15px] font-medium text-gray-900 truncate">{displayName(person)}</div>
            {isMe && <span className="text-[10px] uppercase tracking-wider text-gray-400">You</span>}
          </div>
          {!connected && !hasAnyWeek && (
            <div className="text-xs text-gray-300">Not connected</div>
          )}
        </div>
      </div>
      <div className="grid grid-cols-5 gap-1.5 pl-12 pr-1">
        {week.map((day, i) => (
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
