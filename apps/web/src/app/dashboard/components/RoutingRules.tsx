"use client";
import type { Workspace } from "../../../lib/types";
import { CollapsibleCard } from "./CollapsibleCard";

type Props = {
  workspaces: Workspace[];
};

export function RoutingRules({ workspaces }: Props) {
  const hasMultiWord = workspaces.some((ws) => ws.name.includes(" "));

  return (
    <CollapsibleCard title="Routing Rules" defaultOpen={false}>
      <p className="text-sm text-gray-600 mb-4">
        Use <span className="font-mono text-green-primary">@mentions</span> in your message to skip the routing prompt and send directly.
      </p>

      {/* Examples per workspace */}
      {workspaces.map((ws) => (
        <div key={ws.id} className="mb-3">
          <h3 className="text-xs font-semibold text-gray-600 mb-1.5">{ws.name}</h3>
          <div className="space-y-1.5">
            <div className="text-xs text-gray-600 bg-gray-50 rounded-lg p-2.5">
              <span className="font-mono text-green-primary">
                {ws.name.includes(" ") ? `@"${ws.name.toLowerCase()}"` : `@${ws.name.toLowerCase()}`}
              </span>
              <span className="text-gray-400 ml-1.5">— routes to this workspace</span>
            </div>
            <div className="text-xs text-gray-600 bg-gray-50 rounded-lg p-2.5">
              <span className="font-mono text-green-primary">@name {ws.name.includes(" ") ? `@"${ws.name.toLowerCase()}"` : `@${ws.name.toLowerCase()}`}</span>
              <span className="text-gray-400 ml-1.5">— sends directly to that person in {ws.name}</span>
            </div>
          </div>
        </div>
      ))}

      {workspaces.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-2">No workspaces yet</p>
      )}

      {/* How routing works */}
      <div className="mt-4 pt-4 border-t border-gray-100">
        <h3 className="text-xs font-semibold text-gray-600 uppercase mb-2">How routing works</h3>
        <ul className="text-xs text-gray-500 space-y-1.5">
          <li className="flex items-start gap-2">
            <span className="text-green-primary font-medium mt-px">1.</span>
            <span>If you <span className="font-medium text-gray-600">@mention</span> a person (and optionally a workspace), message routes directly — no prompts.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-primary font-medium mt-px">2.</span>
            <span>If you're in <span className="font-medium text-gray-600">one workspace</span> with <span className="font-medium text-gray-600">one other person</span>, it auto-routes.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-primary font-medium mt-px">3.</span>
            <span>If you messaged someone in the <span className="font-medium text-gray-600">last 24 hours</span>, it defaults to them.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-primary font-medium mt-px">4.</span>
            <span>Otherwise, New Sky asks which workspace and/or person.</span>
          </li>
        </ul>
        {hasMultiWord && (
          <p className="text-xs text-gray-400 mt-2">
            Tip: Use quotes for multi-word names, e.g. <span className="font-mono text-green-primary">@&quot;my workspace&quot;</span>
          </p>
        )}
      </div>
    </CollapsibleCard>
  );
}
