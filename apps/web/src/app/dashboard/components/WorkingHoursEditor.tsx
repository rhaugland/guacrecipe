"use client";
import type { Preferences } from "../../../lib/types";

const DAYS = [
  { value: 0, label: "S" }, { value: 1, label: "M" },
  { value: 2, label: "T" }, { value: 3, label: "W" },
  { value: 4, label: "T" }, { value: 5, label: "F" },
  { value: 6, label: "S" },
];

type Props = { prefs: Preferences; onUpdate: (data: Partial<Preferences>) => void };

export function WorkingHoursEditor({ prefs, onUpdate }: Props) {
  const toggleDay = (d: number) => {
    const updated = prefs.workingHoursDays.includes(d)
      ? prefs.workingHoursDays.filter((x) => x !== d)
      : [...prefs.workingHoursDays, d];
    onUpdate({ workingHoursDays: updated });
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm p-6">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Working Hours</h2>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="text-xs text-gray-500">Start</label>
          <input type="time" value={prefs.workingHoursStart}
            onChange={(e) => onUpdate({ workingHoursStart: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-primary/30" />
        </div>
        <div>
          <label className="text-xs text-gray-500">End</label>
          <input type="time" value={prefs.workingHoursEnd}
            onChange={(e) => onUpdate({ workingHoursEnd: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-primary/30" />
        </div>
      </div>
      <div className="flex gap-1">
        {DAYS.map((d) => (
          <button key={d.value} onClick={() => toggleDay(d.value)}
            className={`flex-1 py-2 rounded text-xs font-medium transition-colors ${
              prefs.workingHoursDays.includes(d.value) ? "bg-green-primary text-white" : "bg-gray-100 text-gray-500"
            }`}>
            {d.label}
          </button>
        ))}
      </div>
    </div>
  );
}
