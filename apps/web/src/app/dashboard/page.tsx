"use client";
import { useEffect, useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import { api } from "../../lib/api-client";

type WeatherState = {
  date: string;
  count: number;
  source: string;
  weather: { code: string; emoji: string; label: string };
  calendarConnected: boolean;
};

const WEATHER_SCALE = [
  { range: "0–1", emoji: "☀️", label: "Sunny" },
  { range: "2–3", emoji: "⛅", label: "Partly cloudy" },
  { range: "4–5", emoji: "☁️", label: "Cloudy" },
  { range: "6–7", emoji: "🌧️", label: "Rainy" },
  { range: "8+", emoji: "⛈️", label: "Storm" },
];

function forecastBlurb(code: string, count: number): string {
  if (count === 0) return "Nothing on your calendar today. Make the most of it.";
  if (code === "sunny") return "A light day. Plenty of breathing room.";
  if (code === "partly_cloudy") return "A manageable day with room to think.";
  if (code === "cloudy") return "Steady stream of meetings — pace yourself.";
  if (code === "rainy") return "Heavy day. Block recovery time tomorrow.";
  return "Storm warning. Reschedule what you can.";
}

export default function WeatherPage() {
  const { user } = useAuth();
  const [data, setData] = useState<WeatherState | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftCount, setDraftCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    api.weather.get()
      .then((d) => setData(d))
      .catch((err) => console.error("[weather] load failed", err))
      .finally(() => setLoading(false));
  }, [user]);

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
    } catch (err) {
      console.error("[weather] save failed", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="bg-white rounded-2xl shadow-sm p-8 md:p-12 text-center">
        <div className="text-7xl md:text-8xl mb-4">{data.weather.emoji}</div>
        <h2 className="text-2xl md:text-3xl font-bold text-green-primary mb-2">{data.weather.label}</h2>
        <p className="text-gray-500 text-sm md:text-base mb-6">{forecastBlurb(data.weather.code, data.count)}</p>

        {editing ? (
          <div className="bg-sky-light/40 rounded-xl p-4 border border-sky-primary/20 max-w-sm mx-auto">
            <p className="text-sm text-gray-600 mb-3">How many meetings today?</p>
            <div className="flex items-center justify-center gap-3 mb-4">
              <button
                onClick={() => setDraftCount(Math.max(0, draftCount - 1))}
                className="w-10 h-10 rounded-full bg-white text-green-primary text-xl font-medium border border-gray-200 hover:bg-gray-50 active:scale-95 transition"
                disabled={saving}
              >
                −
              </button>
              <div className="w-16 text-3xl font-semibold text-gray-800 tabular-nums">{draftCount}</div>
              <button
                onClick={() => setDraftCount(Math.min(99, draftCount + 1))}
                className="w-10 h-10 rounded-full bg-white text-green-primary text-xl font-medium border border-gray-200 hover:bg-gray-50 active:scale-95 transition"
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
            {data.count === 0 ? "Set today's meeting count" : `${data.count} meetings today — edit`}
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-5 md:p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">Forecast key</h3>
          <span className="text-xs text-gray-400">By meetings/day</span>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {WEATHER_SCALE.map((w) => (
            <div key={w.range} className="text-center">
              <div className="text-2xl mb-1">{w.emoji}</div>
              <div className="text-xs font-medium text-gray-700">{w.range}</div>
              <div className="text-[10px] text-gray-400">{w.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-5 md:p-6">
        <div className="flex items-start gap-3">
          <div className="text-2xl shrink-0">📆</div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-gray-700 mb-1">Connect your calendar</h3>
            <p className="text-xs text-gray-500 mb-3">
              Link Google Calendar to auto-update your forecast each morning. Coming soon.
            </p>
            <button
              disabled
              className="px-4 py-2 rounded-full bg-gray-100 text-gray-400 text-xs font-medium cursor-not-allowed"
            >
              Connect Google Calendar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
