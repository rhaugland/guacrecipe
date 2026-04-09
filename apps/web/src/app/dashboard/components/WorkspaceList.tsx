"use client";
import { useState } from "react";
import type { Workspace, WorkspaceMember } from "../../../lib/types";
import { WorkspaceCard } from "./WorkspaceCard";
import { CollapsibleCard } from "./CollapsibleCard";

type Props = {
  workspaces: Workspace[];
  onCreate: (name: string) => Promise<void>;
  getMembers: (id: string) => Promise<WorkspaceMember[]>;
  addMember: (workspaceId: string, contact: { email?: string; phone?: string }) => Promise<void>;
  removeMember: (workspaceId: string, userId: string) => Promise<void>;
  setWorkspaceContact: (workspaceId: string, contact: { email?: string; phone?: string }) => Promise<void>;
  userId: string;
};

export function WorkspaceList({ workspaces, onCreate, getMembers, addMember, removeMember, setWorkspaceContact, userId }: Props) {
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    await onCreate(newName.trim());
    setNewName("");
    setCreating(false);
  };

  return (
    <CollapsibleCard
      title="Workspaces"
      headerRight={
        <button onClick={() => setCreating(!creating)} className="text-sm text-green-primary font-medium">
          {creating ? "Cancel" : "+ New"}
        </button>
      }
    >
      {creating && (
        <form onSubmit={handleCreate} className="flex gap-2 mb-4">
          <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
            placeholder="Workspace name" className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-primary/30" autoFocus />
          <button type="submit" className="px-4 py-2 bg-green-primary text-white rounded-lg text-sm font-medium">Create</button>
        </form>
      )}

      <div className="space-y-2">
        {workspaces.map((ws) => (
          <WorkspaceCard key={ws.id} workspace={ws} getMembers={getMembers} addMember={addMember} removeMember={removeMember} setWorkspaceContact={setWorkspaceContact} userId={userId} />
        ))}
        {workspaces.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No workspaces yet</p>}
      </div>
    </CollapsibleCard>
  );
}
