"use client";
import { useState } from "react";
import type { Workspace, WorkspaceMember } from "../../../lib/types";
import { AddMemberModal } from "./AddMemberModal";

type Props = {
  workspace: Workspace;
  getMembers: (id: string) => Promise<WorkspaceMember[]>;
  addMember: (workspaceId: string, contact: { email?: string; phone?: string }) => Promise<void>;
  removeMember: (workspaceId: string, userId: string) => Promise<void>;
};

export function WorkspaceCard({ workspace, getMembers, addMember, removeMember }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const isAdmin = workspace.role === "admin";

  const handleExpand = async () => {
    if (!expanded) {
      const data = await getMembers(workspace.id);
      setMembers(data);
    }
    setExpanded(!expanded);
  };

  const handleAddMember = async (contact: { email?: string; phone?: string }) => {
    await addMember(workspace.id, contact);
    const data = await getMembers(workspace.id);
    setMembers(data);
    setShowAddModal(false);
  };

  const handleRemoveMember = async (userId: string) => {
    await removeMember(workspace.id, userId);
    setMembers((prev) => prev.filter((m) => m.id !== userId));
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <button onClick={handleExpand} className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
        <div className="flex items-center gap-3">
          <span className="font-medium text-gray-900">{workspace.name}</span>
          {isAdmin && <span className="text-xs bg-green-light text-green-primary px-2 py-0.5 rounded-full">Admin</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">{workspace.memberCount} member{workspace.memberCount !== 1 ? "s" : ""}</span>
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-4 border-t border-gray-50">
          <div className="mt-3 space-y-2">
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between py-2">
                <div>
                  <span className="text-sm text-gray-900">{m.name ?? "Pending"}</span>
                  <span className="text-xs text-gray-400 ml-2">{m.email ?? m.phone}</span>
                  {m.role === "admin" && <span className="text-xs text-green-primary ml-2">admin</span>}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${m.notificationsEnabled ? "bg-green-secondary" : "bg-gray-300"}`} />
                  {isAdmin && m.role !== "admin" && (
                    <button onClick={() => handleRemoveMember(m.id)} className="text-xs text-red-400 hover:text-red-600">Remove</button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {isAdmin && (
            <button onClick={() => setShowAddModal(true)}
              className="mt-3 text-sm text-green-primary hover:text-green-primary/80 font-medium">
              + Add member
            </button>
          )}
        </div>
      )}

      {showAddModal && <AddMemberModal onAdd={handleAddMember} onClose={() => setShowAddModal(false)} />}
    </div>
  );
}
