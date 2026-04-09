const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

export function getSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("guac_session");
}

export function setSessionToken(token: string) {
  localStorage.setItem("guac_session", token);
}

export function clearSessionToken() {
  localStorage.removeItem("guac_session");
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getSessionToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
    setContact: (workspaceId: string, data: { email?: string; phone?: string }) =>
      request(`/api/workspaces/${workspaceId}/contact`, { method: "PUT", body: JSON.stringify(data) }),
  },
  activity: {
    recent: () => request<{ activity: import("./types").ActivityItem[] }>("/api/messages/recent"),
  },
  push: {
    subscribe: (subscription: PushSubscriptionJSON) =>
      request("/api/push/subscribe", { method: "POST", body: JSON.stringify(subscription) }),
    unsubscribe: (endpoint: string) =>
      request("/api/push/unsubscribe", { method: "POST", body: JSON.stringify({ endpoint }) }),
    status: () => request<{ subscribed: boolean }>("/api/push/status"),
  },
  messages: {
    send: (data: { workspaceId: string; recipientId: string; body: string }) =>
      request("/api/messages/send", { method: "POST", body: JSON.stringify(data) }),
    conversation: (workspaceId: string, recipientId: string) =>
      request<{ messages: import("./types").ChatMessage[] }>(`/api/messages/conversation/${workspaceId}/${recipientId}`),
  },
};
