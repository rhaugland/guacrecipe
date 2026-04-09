"use client";
import type { Preferences } from "../../../lib/types";

type Props = {
  prefs: Preferences;
  onUpdate: (data: Partial<Preferences>) => void;
};

export function QuickToggles({ prefs, onUpdate }: Props) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-6">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Quick Toggles</h2>
      <div className="flex flex-wrap gap-4">
        <button
          onClick={() => onUpdate({ notificationsEnabled: !prefs.notificationsEnabled })}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            prefs.notificationsEnabled ? "bg-green-primary text-white" : "bg-gray-100 text-gray-500"
          }`}
        >
          Notifications {prefs.notificationsEnabled ? "On" : "Off"}
        </button>
        <button
          onClick={() => {
            const order: Array<"email" | "sms" | "discord" | "slack" | "both"> = ["email", "sms", "discord", "slack", "both"];
            const idx = order.indexOf(prefs.preferredChannel as any);
            const next = order[(idx + 1) % order.length];
            onUpdate({ preferredChannel: next });
          }}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-green-light text-green-primary"
        >
          Via: {{ email: "Email", sms: "Text", discord: "Discord", slack: "Slack", both: "Both" }[prefs.preferredChannel] ?? prefs.preferredChannel}
        </button>
        <button
          onClick={() => onUpdate({ workingHoursEnabled: !prefs.workingHoursEnabled })}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            prefs.workingHoursEnabled ? "bg-green-primary text-white" : "bg-gray-100 text-gray-500"
          }`}
        >
          Working Hours {prefs.workingHoursEnabled ? "On" : "Off"}
        </button>
      </div>
    </div>
  );
}
