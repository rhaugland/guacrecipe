"use client";
import type { Preferences } from "../../../lib/types";
import { CollapsibleCard } from "./CollapsibleCard";

const CHANNEL_OPTIONS = [
  { value: "email", label: "Email" },
  { value: "sms", label: "Text" },
  { value: "discord", label: "Discord" },
  { value: "slack", label: "Slack" },
  { value: "telegram", label: "Telegram" },
];

const TIMING_OPTIONS = [
  { value: "2_weeks", label: "2 weeks" },
  { value: "1_week", label: "1 week" },
  { value: "3_days", label: "3 days" },
  { value: "2_days", label: "2 days" },
  { value: "day_of", label: "Day of" },
];

const DAYS = [
  { value: 0, label: "S" }, { value: 1, label: "M" },
  { value: 2, label: "T" }, { value: 3, label: "W" },
  { value: 4, label: "T" }, { value: 5, label: "F" },
  { value: 6, label: "S" },
];

type Props = { prefs: Preferences; onUpdate: (data: Partial<Preferences>) => void };

export function CommunicationPrefs({ prefs, onUpdate }: Props) {
  const selectedChannels = prefs.notificationChannels?.length
    ? prefs.notificationChannels
    : [prefs.preferredChannel];

  const toggleChannel = (ch: string) => {
    const updated = selectedChannels.includes(ch)
      ? selectedChannels.filter((x) => x !== ch)
      : [...selectedChannels, ch];
    if (updated.length === 0) return; // must have at least one
    onUpdate({ notificationChannels: updated, preferredChannel: updated[0] as any });
  };

  const toggleTiming = (t: string) => {
    const updated = prefs.notificationTimings.includes(t)
      ? prefs.notificationTimings.filter((x) => x !== t)
      : [...prefs.notificationTimings, t];
    onUpdate({ notificationTimings: updated });
  };

  const toggleDay = (d: number) => {
    const updated = prefs.workingHoursDays.includes(d)
      ? prefs.workingHoursDays.filter((x) => x !== d)
      : [...prefs.workingHoursDays, d];
    onUpdate({ workingHoursDays: updated });
  };

  return (
    <CollapsibleCard title="Communication Preferences">

      {/* Notification Channels */}
      <div className="py-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-700">Preferred Notifications</h3>
          <button
            onClick={() => onUpdate({ notificationsEnabled: !prefs.notificationsEnabled })}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              prefs.notificationsEnabled ? "bg-green-primary text-white" : "bg-gray-100 text-gray-500"
            }`}
          >
            {prefs.notificationsEnabled ? "On" : "Off"}
          </button>
        </div>
        <div className="space-y-2">
          {CHANNEL_OPTIONS.map((ch) => (
            <label key={ch.value} className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedChannels.includes(ch.value)}
                onChange={() => toggleChannel(ch.value)}
                className="w-4 h-4 rounded border-gray-300 text-green-primary focus:ring-green-primary/30"
              />
              <span className="text-sm text-gray-700">{ch.label}</span>
            </label>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-2">
          You'll be notified on all checked channels simultaneously. At least one must be selected.
        </p>
      </div>

      {/* Task Reminders */}
      <div className="py-4 border-t border-gray-100">
        <h3 className="text-sm font-medium text-gray-700 mb-2">Task Reminders</h3>
        <div className="flex flex-wrap gap-2">
          {TIMING_OPTIONS.map((t) => (
            <button key={t.value} onClick={() => toggleTiming(t.value)}
              className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                prefs.notificationTimings.includes(t.value) ? "bg-green-primary text-white" : "bg-gray-100 text-gray-500"
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Working Hours */}
      <div className="py-4 border-t border-gray-100">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-700">Working Hours</h3>
          <button
            onClick={() => onUpdate({ workingHoursEnabled: !prefs.workingHoursEnabled })}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              prefs.workingHoursEnabled ? "bg-green-primary text-white" : "bg-gray-100 text-gray-500"
            }`}
          >
            {prefs.workingHoursEnabled ? "On" : "Off"}
          </button>
        </div>
        <p className="text-xs text-gray-400 mb-3">You won't receive notifications outside these hours</p>
        <div className="grid grid-cols-2 gap-4 mb-3">
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
    </CollapsibleCard>
  );
}
