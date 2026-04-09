"use client";
import { useState } from "react";
import type { Workspace, WorkspaceMember } from "../../../lib/types";
import { AddMemberModal } from "./AddMemberModal";

type Props = {
  workspace: Workspace;
  getMembers: (id: string) => Promise<WorkspaceMember[]>;
  addMember: (workspaceId: string, contact: { email?: string; phone?: string }) => Promise<void>;
  removeMember: (workspaceId: string, userId: string) => Promise<void>;
  setWorkspaceContact: (workspaceId: string, contact: { email?: string; phone?: string }) => Promise<void>;
  userId: string;
};

export function WorkspaceCard({ workspace, getMembers, addMember, removeMember, setWorkspaceContact, userId }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEmail, setEditingEmail] = useState(false);
  const [wsEmail, setWsEmail] = useState("");
  const isAdmin = workspace.role === "admin";

  const myMember = members.find((m) => m.id === userId);

  const handleExpand = async () => {
    if (!expanded) {
      const data = await getMembers(workspace.id);
      setMembers(data);
      const me = data.find((m) => m.id === userId);
      if (me?.workspaceEmail) setWsEmail(me.workspaceEmail);
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

  const handleSaveEmail = async () => {
    await setWorkspaceContact(workspace.id, { email: wsEmail || undefined });
    const data = await getMembers(workspace.id);
    setMembers(data);
    setEditingEmail(false);
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
          {/* My email for this workspace */}
          <div className="mt-3 mb-3 p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-medium text-gray-500 uppercase">My email for this workspace</span>
                <p className="text-sm text-gray-700 mt-0.5">
                  {myMember?.workspaceEmail ?? myMember?.email ?? "Not set"}
                  {myMember?.workspaceEmail && (
                    <span className="text-xs text-green-primary ml-2">custom</span>
                  )}
                </p>
              </div>
              {!editingEmail ? (
                <button onClick={() => { setEditingEmail(true); setWsEmail(myMember?.workspaceEmail ?? ""); }}
                  className="text-xs text-green-primary font-medium hover:underline">
                  {myMember?.workspaceEmail ? "Edit" : "Set"}
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="email"
                    value={wsEmail}
                    onChange={(e) => setWsEmail(e.target.value)}
                    placeholder="email@example.com"
                    className="w-48 px-2 py-1 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-primary/30"
                    autoFocus
                  />
                  <button onClick={handleSaveEmail} className="px-3 py-1 bg-green-primary text-white rounded-lg text-xs font-medium">Save</button>
                  <button onClick={() => setEditingEmail(false)} className="text-xs text-gray-400">Cancel</button>
                </div>
              )}
            </div>
            {editingEmail && (
              <p className="text-xs text-gray-400 mt-1">Messages from this workspace will be delivered to this email when your preference is set to email.</p>
            )}
          </div>

          {/* Members list */}
          <div className="space-y-2">
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between py-2">
                <div>
                  <span className="text-sm text-gray-900">{m.name ?? "Pending"}</span>
                  <span className="text-xs text-gray-400 ml-2">{m.workspaceEmail ?? m.email ?? m.phone}</span>
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
              className="mt-3 w-full py-2 rounded-lg border border-dashed border-gray-300 text-sm text-gray-500 hover:border-green-primary hover:text-green-primary transition-colors font-medium">
              + Add member
            </button>
          )}

        </div>
      )}

      {showAddModal && <AddMemberModal onAdd={handleAddMember} onClose={() => setShowAddModal(false)} />}
    </div>
  );
}
