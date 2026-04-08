"use client";
import type { Preferences } from "../../../lib/types";

const TIMING_OPTIONS = [
  { value: "2_weeks", label: "2 weeks" },
  { value: "1_week", label: "1 week" },
  { value: "3_days", label: "3 days" },
  { value: "2_days", label: "2 days" },
  { value: "day_of", label: "Day of" },
];

type Props = { prefs: Preferences; onUpdate: (data: Partial<Preferences>) => void };

export function NotificationPrefs({ prefs, onUpdate }: Props) {
  const toggle = (t: string) => {
    const updated = prefs.notificationTimings.includes(t)
      ? prefs.notificationTimings.filter((x) => x !== t)
      : [...prefs.notificationTimings, t];
    onUpdate({ notificationTimings: updated });
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm p-6">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Task Reminders</h2>
      <div className="flex flex-wrap gap-2">
        {TIMING_OPTIONS.map((t) => (
          <button key={t.value} onClick={() => toggle(t.value)}
            className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
              prefs.notificationTimings.includes(t.value) ? "bg-green-primary text-white" : "bg-gray-100 text-gray-500"
            }`}>
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
