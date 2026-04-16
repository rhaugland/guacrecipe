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
    generateInvite: (workspaceId: string) =>
      request<{ url: string; token: string }>(`/api/workspaces/${workspaceId}/invite`, { method: "POST" }),
    joinByInvite: (token: string) =>
      request<{ success: boolean; workspace: { id: string; name: string } }>(`/api/workspaces/join/${token}`, { method: "POST" }),
    inviteInfo: (token: string) =>
      request<{ workspaceName: string; memberCount: number }>(`/api/workspaces/invite-info/${token}`),
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
  weather: {
    get: () => request<{
      date: string;
      count: number;
      source: string;
      weather: { code: string; emoji: string; label: string };
      override?: boolean;
      calendarConnected: boolean;
    }>("/api/weather"),
    setCount: (count: number) =>
      request<{
        date: string;
        count: number;
        source: string;
        weather: { code: string; emoji: string; label: string };
      }>("/api/weather/count", { method: "PUT", body: JSON.stringify({ count }) }),
    week: () =>
      request<{
        today: string;
        week: Array<{
          date: string;
          isToday: boolean;
          count: number;
          source: string;
          weather: { code: string; emoji: string; label: string };
          hasData: boolean;
          override?: boolean;
        }>;
      }>("/api/weather/week"),
    team: () =>
      request<{
        teammates: Array<{
          userId: string;
          name: string | null;
          email: string | null;
          connected: boolean;
          today: { count: number; weather: { code: string; emoji: string; label: string }; override?: boolean } | null;
          week: Array<{
            date: string;
            isToday: boolean;
            count: number;
            weather: { code: string; emoji: string; label: string };
            hasData: boolean;
            override?: boolean;
          }>;
        }>;
      }>("/api/weather/team"),
    setOverride: (code: string) =>
      request<{ weather: { code: string; emoji: string; label: string }; override: true }>(
        "/api/weather/override",
        { method: "PUT", body: JSON.stringify({ code }) }
      ),
    clearOverride: () => request<{ ok: true }>("/api/weather/override", { method: "DELETE" }),
  },
  google: {
    status: () => request<{ connected: boolean; email: string | null; configured: boolean }>("/api/google/status"),
    connectUrl: () => {
      const token = getSessionToken();
      return `${API_BASE}/api/google/connect?token=${encodeURIComponent(token ?? "")}`;
    },
    disconnect: () => request("/api/google/disconnect", { method: "POST" }),
    sync: () => request<{ count: number; date: string; source: string }>("/api/google/sync", { method: "POST" }),
  },
  messages: {
    send: (data: { workspaceId: string; recipientId: string; body: string }) =>
      request("/api/messages/send", { method: "POST", body: JSON.stringify(data) }),
    conversation: (workspaceId: string, recipientId: string) =>
      request<{ messages: import("./types").ChatMessage[] }>(`/api/messages/conversation/${workspaceId}/${recipientId}`),
    broadcast: (data: { workspaceId: string; body: string }) =>
      request<{ success: boolean; sent: number; total: number }>("/api/messages/broadcast", { method: "POST", body: JSON.stringify(data) }),
    intelligence: (workspaceId: string, recipientId: string) =>
      request<{ intelligence: import("./types").ChannelIntelligence | null }>(`/api/messages/intelligence/${workspaceId}/${recipientId}`),
    markRead: (workspaceId: string, contactId: string) =>
      request(`/api/messages/read/${workspaceId}/${contactId}`, { method: "POST" }),
    unread: () =>
      request<{ unread: { workspaceId: string; contactId: string; count: number }[] }>("/api/messages/unread"),
    search: (q: string) =>
      request<{ results: import("./types").SearchResult[] }>(`/api/messages/search?q=${encodeURIComponent(q)}`),
    schedule: (data: { workspaceId: string; recipientId: string; body: string; condition: "recipient_sunny" }) =>
      request<{ scheduled: import("./types").ScheduledMessage }>(
        "/api/messages/schedule",
        { method: "POST", body: JSON.stringify(data) }
      ),
    listScheduled: () =>
      request<{ scheduled: import("./types").ScheduledMessage[] }>("/api/messages/scheduled"),
    cancelScheduled: (id: string) =>
      request<{ ok: true }>(`/api/messages/scheduled/${id}`, { method: "DELETE" }),
  },
};
