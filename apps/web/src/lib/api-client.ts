const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error ?? "Request failed");
  }
  return res.json();
}

export const api = {
  auth: {
    requestMagicLink: (data: { email?: string; phone?: string }) =>
      request("/api/auth/magic-link", { method: "POST", body: JSON.stringify(data) }),
    session: () => request<{ user: import("./types").User }>("/api/auth/session"),
    logout: () => request("/api/auth/logout", { method: "POST" }),
  },
  onboarding: {
    complete: (data: Record<string, unknown>) =>
      request("/api/onboarding", { method: "POST", body: JSON.stringify(data) }),
  },
  preferences: {
    get: () => request<import("./types").Preferences>("/api/preferences"),
    update: (data: Partial<import("./types").Preferences>) =>
      request("/api/preferences", { method: "PATCH", body: JSON.stringify(data) }),
  },
  workspaces: {
    list: () => request<{ workspaces: import("./types").Workspace[] }>("/api/workspaces"),
    create: (name: string) =>
      request("/api/workspaces", { method: "POST", body: JSON.stringify({ name }) }),
    members: (id: string) =>
      request<{ members: import("./types").WorkspaceMember[] }>(`/api/workspaces/${id}/members`),
    addMember: (id: string, data: { email?: string; phone?: string }) =>
      request(`/api/workspaces/${id}/members`, { method: "POST", body: JSON.stringify(data) }),
    removeMember: (workspaceId: string, userId: string) =>
      request(`/api/workspaces/${workspaceId}/members/${userId}`, { method: "DELETE" }),
  },
  activity: {
    recent: () => request<{ activity: import("./types").ActivityItem[] }>("/api/messages/recent"),
  },
};
