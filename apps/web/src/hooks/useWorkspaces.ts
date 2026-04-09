"use client";
import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api-client";
import type { Workspace, WorkspaceMember } from "../lib/types";

export function useWorkspaces() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const data = await api.workspaces.list();
    setWorkspaces(data.workspaces);
  }, []);

  useEffect(() => { refresh().finally(() => setLoading(false)); }, [refresh]);

  const create = async (name: string) => {
    await api.workspaces.create(name);
    await refresh();
  };

  const getMembers = async (id: string): Promise<WorkspaceMember[]> => {
    const data = await api.workspaces.members(id);
    return data.members;
  };

  const addMember = async (workspaceId: string, contact: { email?: string; phone?: string }) => {
    await api.workspaces.addMember(workspaceId, contact);
  };

  const removeMember = async (workspaceId: string, userId: string) => {
    await api.workspaces.removeMember(workspaceId, userId);
  };

  const setWorkspaceContact = async (workspaceId: string, contact: { email?: string; phone?: string }) => {
    await api.workspaces.setContact(workspaceId, contact);
  };

  return { workspaces, loading, create, getMembers, addMember, removeMember, setWorkspaceContact, refresh };
}
