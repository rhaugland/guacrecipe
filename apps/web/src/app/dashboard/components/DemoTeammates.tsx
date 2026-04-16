"use client";
import { CollapsibleCard } from "./CollapsibleCard";
import { useDemoMode } from "../../../hooks/useDemoMode";

export function DemoTeammates() {
  const { enabled, setEnabled } = useDemoMode();

  return (
    <CollapsibleCard title="Demo teammates">
      <p className="text-xs text-gray-500 mb-3">
        Show 3 fake teammates with sample weather and chat history. Useful for previewing the experience.
      </p>
      <div className="flex items-center gap-3">
        <button
          onClick={() => setEnabled(!enabled)}
          className={`px-4 py-2 rounded-full text-xs font-medium transition ${
            enabled
              ? "bg-green-primary text-white hover:opacity-90"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          {enabled ? "On" : "Off"}
        </button>
        <span className="text-[11px] text-gray-400">Resets on page reload.</span>
      </div>
    </CollapsibleCard>
  );
}
