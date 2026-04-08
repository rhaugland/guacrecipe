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
          onClick={() => onUpdate({ preferredChannel: prefs.preferredChannel === "sms" ? "email" : "sms" })}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-green-light text-green-primary"
        >
          Via: {prefs.preferredChannel === "sms" ? "Text" : "Email"}
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
