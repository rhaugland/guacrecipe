"use client";
import type { ActivityItem } from "../../../lib/types";
import { CollapsibleCard } from "./CollapsibleCard";

const STATUS_COLORS: Record<string, string> = {
  delivered: "bg-green-secondary",
  queued: "bg-yellow-400",
  pending: "bg-gray-300",
  failed: "bg-red-400",
};

type Props = { activity: ActivityItem[] };

export function RecentActivity({ activity }: Props) {
  return (
    <CollapsibleCard title="Recent Activity">
      {activity.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">No activity yet</p>
      ) : (
        <div className="space-y-3">
          {activity.map((item) => (
            <div key={item.conversationId} className="flex items-start gap-3 py-2">
              <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${STATUS_COLORS[item.deliveryStatus] ?? "bg-gray-300"}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium text-gray-900">{item.sender}</span>
                  <span className="text-gray-400">&rarr;</span>
                  <span className="text-gray-600">{item.recipient}</span>
                  <span className="text-xs text-gray-400 ml-auto">{item.workspace}</span>
                </div>
                <p className="text-sm text-gray-500 truncate">{item.lastMessage}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </CollapsibleCard>
  );
}
