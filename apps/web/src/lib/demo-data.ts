import type { ChatMessage, ScheduledMessage, WorkspaceMember } from "./types";

export const DEMO_WORKSPACE_ID = "demo-workspace";
export const DEMO_WORKSPACE_NAME = "Demo Team";

export type DemoWeatherCode = "sunny" | "partly_cloudy" | "cloudy" | "rainy" | "thunderstorm";

export type DemoTeammate = {
  id: string;
  name: string;
  email: string;
  weatherCode: DemoWeatherCode;
  count: number;
  emoji: string;
  label: string;
  cannedReply: string;
};

export const DEMO_TEAMMATES_INITIAL: DemoTeammate[] = [
  { id: "demo-adam",   name: "Adam Roozen",  email: "adam@demo.local",   weatherCode: "sunny",        count: 1, emoji: "☀️", label: "Sunny", cannedReply: "Hey! What's up?" },
  { id: "demo-sarah",  name: "Sarah Chen",   email: "sarah@demo.local",  weatherCode: "rainy",        count: 6, emoji: "🌧️", label: "Rainy", cannedReply: "Heads down today — can it wait?" },
  { id: "demo-marcus", name: "Marcus Pike",  email: "marcus@demo.local", weatherCode: "thunderstorm", count: 9, emoji: "⛈️", label: "Storm", cannedReply: "Slammed today, will reply tomorrow." },
];

// Sentinel id used in outbound message senderId; the chat page swaps it for the real user.id at read time.
export const DEMO_OUTBOUND_SENDER = "__demo_outbound__";

// Mutable state held in module scope (resets on page reload — perfect for a demo)
const teammates = new Map<string, DemoTeammate>(DEMO_TEAMMATES_INITIAL.map((t) => [t.id, { ...t }]));
const conversations = new Map<string, ChatMessage[]>();
const scheduledById = new Map<string, ScheduledMessage>();

// Subscribers for state changes (so React re-renders pick up rotations / sends)
const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((fn) => fn());
}
export function subscribeDemo(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function isDemoId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith("demo-");
}

export function isDemoScheduledId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith("demo-sched-");
}

export function getDemoTeammates(): DemoTeammate[] {
  return Array.from(teammates.values());
}

export function getDemoTeammate(id: string): DemoTeammate | undefined {
  return teammates.get(id);
}

export function getDemoConversation(id: string): ChatMessage[] {
  return conversations.get(id) ?? [];
}

export function appendDemoMessage(recipientId: string, msg: ChatMessage) {
  const arr = conversations.get(recipientId) ?? [];
  arr.push(msg);
  conversations.set(recipientId, arr);
  emit();
}

export function getDemoScheduled(): ScheduledMessage[] {
  return Array.from(scheduledById.values());
}

export function addDemoScheduled(msg: ScheduledMessage) {
  scheduledById.set(msg.id, msg);
  emit();
}

export function cancelDemoScheduled(id: string) {
  scheduledById.delete(id);
  emit();
}

export function dispatchDemoScheduled(id: string): ScheduledMessage | undefined {
  const sm = scheduledById.get(id);
  if (!sm) return undefined;
  appendDemoMessage(sm.recipientId, makeOutboundMessage(sm.body));
  scheduledById.delete(id);
  emit();
  return sm;
}

export function makeOutboundMessage(body: string): ChatMessage {
  return {
    id: `demo-msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    senderId: DEMO_OUTBOUND_SENDER,
    body,
    direction: "outbound",
    channel: "email",
    deliveryStatus: "delivered",
    createdAt: new Date().toISOString(),
  };
}

export function makeInboundMessage(senderId: string, body: string): ChatMessage {
  return {
    id: `demo-msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    senderId,
    body,
    direction: "inbound",
    channel: "email",
    deliveryStatus: "delivered",
    createdAt: new Date().toISOString(),
  };
}

const WEATHER_PRESETS: Record<DemoWeatherCode, { count: number; emoji: string; label: string }> = {
  sunny:         { count: 1, emoji: "☀️", label: "Sunny" },
  partly_cloudy: { count: 3, emoji: "⛅", label: "Partly cloudy" },
  cloudy:        { count: 5, emoji: "☁️", label: "Cloudy" },
  rainy:         { count: 6, emoji: "🌧️", label: "Rainy" },
  thunderstorm:  { count: 9, emoji: "⛈️", label: "Storm" },
};

// When a demo teammate's weather rotates to sunny/partly_cloudy, flush queued sends to them.
export function setDemoTeammateWeather(id: string, code: DemoWeatherCode) {
  const t = teammates.get(id);
  if (!t) return;
  const next = WEATHER_PRESETS[code];
  teammates.set(id, { ...t, weatherCode: code, ...next });

  if (code === "sunny" || code === "partly_cloudy") {
    const SUNNY_FLUSH_DELAY_MS = 400;
    const queued = Array.from(scheduledById.values()).filter((s) => s.recipientId === id);
    if (queued.length > 0) {
      setTimeout(() => {
        for (const s of queued) {
          appendDemoMessage(s.recipientId, makeOutboundMessage(s.body));
          scheduledById.delete(s.id);
        }
        emit();
      }, SUNNY_FLUSH_DELAY_MS);
    }
  }
  emit();
}

// Build a synthetic WorkspaceMember-shaped object for the chat page's contact list
export function demoTeammateToContact(t: DemoTeammate): WorkspaceMember {
  return {
    id: t.id,
    name: t.name,
    email: t.email,
    phone: null,
    role: "member",
    preferredChannel: "email",
    notificationChannels: ["email"],
    workingHoursEnabled: true,
    notificationsEnabled: true,
    addedAt: new Date().toISOString(),
    workspaceEmail: t.email,
    workspacePhone: null,
  };
}
