"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "../../../hooks/useAuth";
import { useWorkspaces } from "../../../hooks/useWorkspaces";
import { api } from "../../../lib/api-client";
import type { WorkspaceMember, ChatMessage, ChannelIntelligence, SearchResult, ScheduledMessage } from "../../../lib/types";
import { useDemoMode, useDemoTick } from "../../../hooks/useDemoMode";
import {
  DEMO_OUTBOUND_SENDER,
  DEMO_WORKSPACE_ID,
  DEMO_WORKSPACE_NAME,
  addDemoScheduled,
  appendDemoMessage,
  cancelDemoScheduled,
  demoTeammateToContact,
  dispatchDemoScheduled,
  getDemoConversation,
  getDemoScheduled,
  getDemoTeammate,
  getDemoTeammates,
  isDemoId,
  isDemoScheduledId,
  makeInboundMessage,
  makeOutboundMessage,
} from "../../../lib/demo-data";

type Contact = WorkspaceMember & { workspaceId: string; workspaceName: string };

type WeatherInfo = {
  count: number | null;
  code: string | null;
  emoji: string | null;
  label: string | null;
  connected: boolean;
};

// Severity gating: "none" => normal, "warn" => soft banner, "block" => stronger banner + confirm modal
function gatingFor(code: string | null): "none" | "warn" | "block" {
  if (code === "rainy") return "warn";
  if (code === "thunderstorm") return "block";
  return "none";
}

const CHANNEL_LABELS: Record<string, { label: string; color: string }> = {
  email: { label: "Email", color: "bg-blue-100 text-blue-700" },
  sms: { label: "SMS", color: "bg-purple-100 text-purple-700" },
  discord: { label: "Discord", color: "bg-indigo-100 text-indigo-700" },
  slack: { label: "Slack", color: "bg-yellow-100 text-yellow-800" },
  telegram: { label: "Telegram", color: "bg-sky-100 text-sky-700" },
};

function ChannelTags({ channels }: { channels: string[] }) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {channels.map((ch) => {
        const info = CHANNEL_LABELS[ch];
        return info ? (
          <span key={ch} className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${info.color}`}>
            {info.label}
          </span>
        ) : null;
      })}
    </div>
  );
}

function getChannels(c: Contact): string[] {
  return c.notificationChannels?.length ? c.notificationChannels : [c.preferredChannel ?? "email"];
}

function formatMs(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m`;
  return "<1m";
}

type IntelligencePopoverProps = {
  selected: Contact;
  intelligence: ChannelIntelligence;
  onClose: () => void;
  channelsNode: React.ReactNode;
  paused: boolean;
};

function IntelligencePopover({ selected, intelligence, onClose, channelsNode, paused }: IntelligencePopoverProps) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute top-full left-4 right-4 md:left-16 md:right-auto md:w-80 mt-1 bg-white rounded-xl shadow-lg border border-gray-100 z-50 p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-gray-800">Channel Intelligence</h4>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Reaches via + Paused indicator (mobile folds header badges into the popover) */}
        <div className="mb-3 flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] uppercase tracking-wide text-gray-400 mr-1">Reaches via</span>
          {channelsNode}
          {paused && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-red-100 text-red-600">Paused</span>
          )}
        </div>

        <p className="text-xs text-gray-400 mb-3">
          Avg response time for {selected.name} by channel
        </p>

        <div className="space-y-2">
          {intelligence.channels.map((ch, i) => {
            const info = CHANNEL_LABELS[ch.channel];
            const maxMs = intelligence.channels[intelligence.channels.length - 1]?.avgResponseMs ?? 1;
            const pct = Math.max(8, Math.round((ch.avgResponseMs / maxMs) * 100));
            const label = formatMs(ch.avgResponseMs);
            return (
              <div key={ch.channel}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${info?.color ?? "bg-gray-100 text-gray-600"}`}>
                      {info?.label ?? ch.channel}
                    </span>
                    {i === 0 && <span className="text-[10px] text-green-primary font-medium">Fastest</span>}
                  </div>
                  <span className="text-xs text-gray-500 font-medium">~{label}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-all ${i === 0 ? "bg-green-primary" : "bg-gray-300"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
          <div className="text-center flex-1">
            <p className="text-lg font-bold text-gray-800">{intelligence.totalMessages}</p>
            <p className="text-[10px] text-gray-400">Messages</p>
          </div>
          <div className="w-px h-8 bg-gray-100" />
          <div className="text-center flex-1">
            <p className="text-lg font-bold text-gray-800">{intelligence.deliveryRate}%</p>
            <p className="text-[10px] text-gray-400">Delivered</p>
          </div>
          <div className="w-px h-8 bg-gray-100" />
          <div className="text-center flex-1">
            <p className="text-lg font-bold text-green-primary">{intelligence.channels.length}</p>
            <p className="text-[10px] text-gray-400">Channels</p>
          </div>
        </div>
      </div>
    </>
  );
}

export default function ChatPage() {
  const { user } = useAuth();
  const { workspaces, getMembers } = useWorkspaces();
  const { enabled: demoEnabled } = useDemoMode();
  const demoTick = useDemoTick();
  const autoReplyTimers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => {
    return () => {
      autoReplyTimers.current.forEach((t) => clearTimeout(t));
      autoReplyTimers.current.clear();
    };
  }, []);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selected, setSelected] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [showNewChat, setShowNewChat] = useState(false);
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [broadcastWorkspace, setBroadcastWorkspace] = useState<string | null>(null);
  const [broadcastDraft, setBroadcastDraft] = useState("");
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState<{ sent: number; total: number } | null>(null);
  const [intelligence, setIntelligence] = useState<ChannelIntelligence | null>(null);
  const [showIntelligence, setShowIntelligence] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [weatherByUser, setWeatherByUser] = useState<Record<string, WeatherInfo>>({});
  const [stormConfirmed, setStormConfirmed] = useState<Set<string>>(new Set());
  const [showStormConfirm, setShowStormConfirm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [scheduled, setScheduled] = useState<ScheduledMessage[]>([]);
  const [showScheduledPanel, setShowScheduledPanel] = useState(false);
  // On mobile: "list" shows sidebar, "chat" shows conversation
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadContacts = useCallback(async () => {
    if (!user) return;
    const allContacts: Contact[] = [];
    for (const ws of workspaces) {
      const members = await getMembers(ws.id);
      for (const m of members) {
        if (m.id !== user.id) {
          allContacts.push({ ...m, workspaceId: ws.id, workspaceName: ws.name });
        }
      }
    }
    if (demoEnabled) {
      for (const dt of getDemoTeammates()) {
        allContacts.push({
          ...demoTeammateToContact(dt),
          workspaceId: DEMO_WORKSPACE_ID,
          workspaceName: DEMO_WORKSPACE_NAME,
        });
      }
    }
    setContacts(allContacts);
    setLoadingContacts(false);

    if (selected) {
      const updated = allContacts.find(
        (c) => c.id === selected.id && c.workspaceId === selected.workspaceId
      );
      if (updated) setSelected(updated);
    }
  }, [user, workspaces, getMembers, selected, demoEnabled]);

  const loadUnread = useCallback(async () => {
    try {
      const { unread } = await api.messages.unread();
      const counts: Record<string, number> = {};
      // Filter out any demo IDs defensively (server should never return them, but be safe)
      for (const u of unread) {
        if (isDemoId(u.contactId)) continue;
        counts[`${u.workspaceId}:${u.contactId}`] = u.count;
      }
      setUnreadCounts(counts);
    } catch {}
  }, []);

  const loadScheduled = useCallback(async () => {
    let realScheduled: ScheduledMessage[] = [];
    try {
      const { scheduled } = await api.messages.listScheduled();
      realScheduled = scheduled;
    } catch {}
    const merged = demoEnabled ? [...realScheduled, ...getDemoScheduled()] : realScheduled;
    setScheduled(merged);
  }, [demoEnabled]);

  const loadTeamWeather = useCallback(async () => {
    const map: Record<string, WeatherInfo> = {};
    try {
      const { teammates } = await api.weather.team();
      for (const t of teammates) {
        map[t.userId] = {
          count: t.today?.count ?? null,
          code: t.today?.weather.code ?? null,
          emoji: t.today?.weather.emoji ?? null,
          label: t.today?.weather.label ?? null,
          connected: t.connected,
        };
      }
    } catch {}
    if (demoEnabled) {
      for (const dt of getDemoTeammates()) {
        map[dt.id] = {
          count: dt.count,
          code: dt.weatherCode,
          emoji: dt.emoji,
          label: dt.label,
          connected: true,
        };
      }
    }
    setWeatherByUser(map);
  }, [demoEnabled]);

  useEffect(() => {
    loadContacts();
    loadUnread();
    loadTeamWeather();
    loadScheduled();
  }, [user, workspaces, demoEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-render-only effect when demo data mutates (rotations, queued flushes, etc).
  useEffect(() => {
    if (!demoEnabled) return;
    // Rebuild scheduled and weather maps from latest demo state.
    loadScheduled();
    loadTeamWeather();
    // Also re-pull conversation if currently viewing a demo contact.
    if (selected && isDemoId(selected.id)) {
      setMessages(getDemoConversation(selected.id));
    }
  }, [demoTick, demoEnabled, selected, loadScheduled, loadTeamWeather]);

  useEffect(() => {
    const interval = setInterval(() => { loadContacts(); loadUnread(); loadTeamWeather(); loadScheduled(); }, 30000);
    return () => clearInterval(interval);
  }, [loadContacts, loadUnread, loadTeamWeather, loadScheduled]);

  const loadConversation = useCallback(async (contact: Contact) => {
    if (isDemoId(contact.id)) {
      setMessages(getDemoConversation(contact.id));
      return;
    }
    const data = await api.messages.conversation(contact.workspaceId, contact.id);
    setMessages(data.messages);
  }, []);

  useEffect(() => {
    if (selected) loadConversation(selected);
  }, [selected, loadConversation]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!selected) return;
    if (isDemoId(selected.id)) return; // demo conversations are mutated locally; no polling needed
    const interval = setInterval(() => loadConversation(selected), 5000);
    return () => clearInterval(interval);
  }, [selected, loadConversation]);

  const scheduleDemoAutoReply = (recipientId: string) => {
    const dt = getDemoTeammate(recipientId);
    if (!dt) return;
    const timer = setTimeout(() => {
      autoReplyTimers.current.delete(timer);
      appendDemoMessage(recipientId, makeInboundMessage(recipientId, dt.cannedReply));
    }, 2000);
    autoReplyTimers.current.add(timer);
  };

  const sendMessage = async () => {
    if (!draft.trim() || !selected || sending) return;
    setSending(true);
    try {
      const body = draft.trim();
      if (isDemoId(selected.id)) {
        appendDemoMessage(selected.id, makeOutboundMessage(body));
        setDraft("");
        scheduleDemoAutoReply(selected.id);
        return;
      }
      await api.messages.send({
        workspaceId: selected.workspaceId,
        recipientId: selected.id,
        body,
      });
      setDraft("");
      await loadConversation(selected);
      loadScheduled();
    } finally {
      setSending(false);
    }
  };

  const scheduleForSunny = async () => {
    if (!draft.trim() || !selected) return;
    const body = draft.trim();
    try {
      if (isDemoId(selected.id)) {
        addDemoScheduled({
          id: `demo-sched-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          workspaceId: selected.workspaceId,
          recipientId: selected.id,
          recipientName: selected.name,
          recipientEmail: selected.email,
          body,
          condition: "recipient_sunny",
          createdAt: new Date().toISOString(),
        });
        setDraft("");
        setShowStormConfirm(false);
        return;
      }
      await api.messages.schedule({
        workspaceId: selected.workspaceId,
        recipientId: selected.id,
        body,
        condition: "recipient_sunny",
      });
      setDraft("");
      setShowStormConfirm(false);
      await loadScheduled();
    } catch (err) {
      console.error("[chat] schedule failed", err);
    }
  };

  const cancelScheduled = async (id: string) => {
    try {
      if (isDemoScheduledId(id)) {
        cancelDemoScheduled(id);
        return;
      }
      await api.messages.cancelScheduled(id);
      await loadScheduled();
    } catch (err) {
      console.error("[chat] cancel scheduled failed", err);
    }
  };

  const sendScheduledNow = async (sm: ScheduledMessage) => {
    try {
      if (isDemoScheduledId(sm.id) || isDemoId(sm.recipientId)) {
        const dispatched = dispatchDemoScheduled(sm.id);
        if (dispatched) scheduleDemoAutoReply(sm.recipientId);
        return;
      }
      await api.messages.send({
        workspaceId: sm.workspaceId,
        recipientId: sm.recipientId,
        body: sm.body,
      });
      await api.messages.cancelScheduled(sm.id);
      await loadScheduled();
      if (selected && sm.recipientId === selected.id && sm.workspaceId === selected.workspaceId) {
        await loadConversation(selected);
      }
    } catch (err) {
      console.error("[chat] send scheduled now failed", err);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || !selected || sending) return;
    const w = weatherByUser[selected.id];
    const gating = gatingFor(w?.code ?? null);
    // Storm: confirm modal once per session per recipient
    if (gating === "block" && !stormConfirmed.has(selected.id)) {
      setShowStormConfirm(true);
      return;
    }
    await sendMessage();
  };

  const confirmStormSend = async () => {
    if (!selected) return;
    setStormConfirmed((prev) => new Set(prev).add(selected.id));
    setShowStormConfirm(false);
    await sendMessage();
  };

  const handleSelectContact = (contact: Contact) => {
    setSelected(contact);
    setShowNewChat(false);
    setShowBroadcast(false);
    setShowScheduledPanel(false);
    setMobileView("chat");
    setIntelligence(null);
    setShowIntelligence(false);
    // Mark as read and clear badge
    const key = `${contact.workspaceId}:${contact.id}`;
    setUnreadCounts((prev) => { const next = { ...prev }; delete next[key]; return next; });
    if (isDemoId(contact.id)) return; // demo contacts: no markRead, no intelligence API call
    api.messages.markRead(contact.workspaceId, contact.id).catch(() => {});
    // Load channel intelligence
    api.messages.intelligence(contact.workspaceId, contact.id)
      .then((data) => setIntelligence(data.intelligence))
      .catch(() => {});
  };

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastDraft.trim() || !broadcastWorkspace || broadcastSending) return;
    setBroadcastSending(true);
    setBroadcastResult(null);
    try {
      const result = await api.messages.broadcast({ workspaceId: broadcastWorkspace, body: broadcastDraft.trim() });
      setBroadcastResult({ sent: result.sent, total: result.total });
      setBroadcastDraft("");
    } finally {
      setBroadcastSending(false);
    }
  };

  const handleSearch = (q: string) => {
    setSearchQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (q.trim().length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const { results } = await api.messages.search(q.trim());
        setSearchResults(results);
      } catch {}
      setSearching(false);
    }, 300);
  };

  const handleSearchResultClick = (result: SearchResult) => {
    const contact = contacts.find((c) => c.id === result.contactId && c.workspaceId === result.workspaceId);
    if (contact) {
      handleSelectContact(contact);
      setSearchQuery("");
      setSearchResults([]);
    }
  };

  const handleBack = () => {
    setMobileView("list");
    setShowNewChat(false);
    setShowBroadcast(false);
    setShowScheduledPanel(false);
  };

  if (!user) return null;

  const grouped = contacts.reduce<Record<string, { name: string; contacts: Contact[] }>>((acc, c) => {
    if (!acc[c.workspaceId]) acc[c.workspaceId] = { name: c.workspaceName, contacts: [] };
    acc[c.workspaceId].contacts.push(c);
    return acc;
  }, {});

  // -- Shared components --

  // Filter contacts by search query (for contact name search)
  const filteredGrouped = searchQuery.trim().length > 0
    ? Object.fromEntries(
        Object.entries(grouped)
          .map(([wsId, group]) => [wsId, {
            ...group,
            contacts: group.contacts.filter((c) =>
              (c.name ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
              (c.email ?? "").toLowerCase().includes(searchQuery.toLowerCase())
            ),
          }])
          .filter(([, group]) => (group as { contacts: Contact[] }).contacts.length > 0)
      ) as typeof grouped
    : grouped;

  const contactList = (
    <>
      {/* Search bar */}
      <div className="px-3 py-2 border-b border-gray-100">
        <div className="relative">
          <svg className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search contacts & messages..."
            className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-gray-100 text-[16px] md:text-sm focus:outline-none focus:ring-2 focus:ring-green-primary/30 focus:bg-white border border-transparent focus:border-gray-200"
          />
          {searchQuery && (
            <button onClick={() => { setSearchQuery(""); setSearchResults([]); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Message search results */}
      {searchQuery.trim().length >= 2 && searchResults.length > 0 && (
        <div className="border-b border-gray-100">
          <div className="px-4 py-2 bg-gray-50">
            <span className="text-xs font-semibold text-gray-400 uppercase">Messages</span>
          </div>
          {searchResults.map((r) => (
            <button
              key={r.messageId}
              onClick={() => handleSearchResultClick(r)}
              className="w-full px-4 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors text-left"
            >
              <div className="w-8 h-8 rounded-full bg-green-primary/10 flex items-center justify-center text-green-primary text-xs font-medium flex-shrink-0 mt-0.5">
                {(r.contactName ?? "?")[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-gray-800">{r.senderName}</span>
                  <span className="text-[10px] text-gray-300">in</span>
                  <span className="text-[10px] text-green-primary font-medium">{r.workspaceName}</span>
                </div>
                <p className="text-xs text-gray-500 truncate mt-0.5">{r.body}</p>
                <span className="text-[10px] text-gray-300">{new Date(r.createdAt).toLocaleDateString()}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {searching && (
        <p className="text-xs text-gray-400 text-center py-3">Searching...</p>
      )}

      {/* Contact list */}
      {loadingContacts ? (
        <p className="text-sm text-gray-400 text-center py-8">Loading...</p>
      ) : Object.entries(filteredGrouped).length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">{searchQuery ? "No matches" : "No contacts yet"}</p>
      ) : (
        Object.entries(filteredGrouped).map(([wsId, group]) => (
          <div key={wsId}>
            <div className="px-4 py-2 bg-gray-50">
              <span className="text-xs font-semibold text-gray-400 uppercase">{group.name}</span>
            </div>
            {group.contacts.map((c) => {
              const isUnread = (unreadCounts[`${wsId}:${c.id}`] ?? 0) > 0;
              return (
                <button
                  key={`${wsId}-${c.id}`}
                  onClick={() => handleSelectContact(c)}
                  className={`w-full hover:bg-gray-50 active:bg-gray-100 transition-colors ${
                    selected?.id === c.id && selected?.workspaceId === c.workspaceId ? "bg-green-light" : ""
                  }`}
                >
                  <div className="pl-4 pr-4 py-3 flex items-center gap-3">
                    {/* Unread dot: takes fixed 12px lane so names align across read/unread rows */}
                    <div className="w-3 flex-shrink-0 flex justify-center">
                      {isUnread && <span className="w-2 h-2 rounded-full bg-green-primary" />}
                    </div>
                    <div className="w-11 h-11 rounded-full bg-green-primary/10 flex items-center justify-center text-green-primary text-base font-semibold flex-shrink-0">
                      {(c.name ?? "?")[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0 text-left border-b border-gray-100 pb-3 -mb-3">
                      <div className="flex items-center gap-1.5">
                        <p className="text-[15px] truncate font-semibold text-gray-900">
                          {c.name ?? c.email ?? "Unknown"}
                        </p>
                        {weatherByUser[c.id]?.emoji && (
                          <span className="text-sm leading-none flex-shrink-0" aria-label={weatherByUser[c.id]?.label ?? ""}>
                            {weatherByUser[c.id]?.emoji}
                          </span>
                        )}
                        <span className="ml-auto text-xs text-gray-400 flex-shrink-0">{""}</span>
                      </div>
                      <p className={`mt-0.5 text-sm truncate ${isUnread ? "text-gray-800" : "text-gray-500"}`}>
                        {"—"}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ))
      )}
    </>
  );

  const newChatPicker = (
    <div className="flex-1 flex flex-col">
      <div className="px-4 md:px-6 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={handleBack} className="md:hidden text-gray-400 hover:text-gray-600 p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h3 className="text-sm font-semibold text-gray-700">New Chat</h3>
        </div>
        <button onClick={() => { setShowNewChat(false); setMobileView("list"); }} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <p className="px-4 md:px-6 py-3 text-xs text-gray-400">Select a person to start a conversation. Messages will be delivered via their preferred channel.</p>
        {Object.entries(grouped).map(([wsId, group]) => (
          <div key={wsId}>
            <div className="px-4 md:px-6 py-2 bg-gray-50">
              <span className="text-xs font-semibold text-gray-400 uppercase">{group.name}</span>
            </div>
            {group.contacts.map((c) => (
              <button
                key={`new-${wsId}-${c.id}`}
                onClick={() => handleSelectContact(c)}
                className="w-full px-4 md:px-6 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-green-primary/10 flex items-center justify-center text-green-primary font-medium flex-shrink-0">
                  {(c.name ?? "?")[0].toUpperCase()}
                </div>
                <div className="flex-1 text-left min-w-0">
                  <p className="text-sm font-medium text-gray-900">{c.name ?? "Pending"}</p>
                  <p className="text-xs text-gray-400 truncate">{c.workspaceEmail ?? c.email ?? c.phone ?? ""}</p>
                </div>
                <ChannelTags channels={getChannels(c)} />
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );

  const chatArea = selected ? (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Chat header */}
      <div className="relative">
        {/* Desktop header (unchanged layout, md+ only) */}
        <div className="hidden md:flex px-6 py-3 border-b border-gray-100 items-center gap-3 bg-white/95 backdrop-blur-sm">
          <button
            onClick={() => setShowIntelligence(!showIntelligence)}
            className="w-9 h-9 rounded-full bg-green-primary/10 flex items-center justify-center text-green-primary text-sm font-semibold flex-shrink-0 hover:bg-green-primary/20 transition-colors"
          >
            {(selected.name ?? "?")[0].toUpperCase()}
          </button>
          <button onClick={() => setShowIntelligence(!showIntelligence)} className="flex-1 min-w-0 text-left hover:opacity-80 transition-opacity">
            <div className="flex items-center gap-1.5">
              <p className="text-[15px] font-semibold text-gray-900 truncate">{selected.name ?? "Pending"}</p>
              {weatherByUser[selected.id]?.emoji && (
                <span className="text-base leading-none" aria-label={weatherByUser[selected.id]?.label ?? ""}>
                  {weatherByUser[selected.id]?.emoji}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
              <ChannelTags channels={getChannels(selected)} />
              {!selected.notificationsEnabled && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-red-100 text-red-600">Paused</span>
              )}
            </div>
          </button>
        </div>

        {/* Mobile header (centered iMessage style) */}
        <div className="md:hidden px-2 py-2 border-b border-gray-100 bg-white/95 backdrop-blur-sm flex items-center">
          {/* Left: back */}
          <button onClick={handleBack} className="text-green-primary flex items-center gap-0.5 min-w-[64px]" aria-label="Back to messages">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-[15px]">Messages</span>
          </button>
          {/* Center: avatar over name */}
          <button
            onClick={() => setShowIntelligence(!showIntelligence)}
            className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center hover:opacity-80 transition-opacity"
          >
            <div className="w-7 h-7 rounded-full bg-green-primary/10 flex items-center justify-center text-green-primary text-xs font-semibold">
              {(selected.name ?? "?")[0].toUpperCase()}
            </div>
            <div className="flex items-center gap-1 mt-0.5 max-w-[180px]">
              <p className="text-[13px] font-semibold text-gray-900 truncate">{selected.name ?? "Pending"}</p>
              {weatherByUser[selected.id]?.emoji && (
                <span className="text-xs leading-none" aria-label={weatherByUser[selected.id]?.label ?? ""}>{weatherByUser[selected.id]?.emoji}</span>
              )}
            </div>
          </button>
          {/* Right: info button (min-w matches back button for symmetric centering) */}
          <div className="min-w-[64px] flex justify-end ml-auto">
            <button
              onClick={() => setShowIntelligence(!showIntelligence)}
              className="w-9 h-9 rounded-full flex items-center justify-center text-green-primary hover:bg-green-primary/10 transition-colors"
              aria-label="Contact info"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="9" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8h.01M11 12h1v5h1" />
              </svg>
            </button>
          </div>
        </div>

        {showIntelligence && intelligence && (
          <IntelligencePopover
            selected={selected}
            intelligence={intelligence}
            onClose={() => setShowIntelligence(false)}
            channelsNode={<ChannelTags channels={getChannels(selected)} />}
            paused={!selected.notificationsEnabled}
          />
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 md:px-6 py-4 space-y-1 bg-gray-50/50">
        {messages.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">
            No messages yet. Send one to {selected.name ?? "this person"} — it'll be delivered via their preferred channel.
          </p>
        )}
        {messages.map((msg, idx) => {
          const isMine = msg.senderId === user.id || msg.senderId === DEMO_OUTBOUND_SENDER;
          const prev = messages[idx - 1];
          const sameSender = prev && prev.senderId === msg.senderId;
          const showTime = !prev || new Date(msg.createdAt).getTime() - new Date(prev.createdAt).getTime() > 300000;
          return (
            <div key={msg.id}>
              {showTime && (
                <p className="text-[10px] text-gray-400 text-center py-2">
                  {new Date(msg.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </p>
              )}
              <div className={`flex ${isMine ? "justify-end" : "justify-start"} ${sameSender && !showTime ? "mt-0.5" : "mt-2"}`}>
                <div className={`max-w-[80%] md:max-w-[65%] px-3.5 py-2 ${
                  isMine
                    ? `bg-green-primary text-white ${sameSender && !showTime ? "rounded-2xl rounded-br-md" : "rounded-2xl"}`
                    : `bg-white text-gray-900 shadow-sm ${sameSender && !showTime ? "rounded-2xl rounded-bl-md" : "rounded-2xl"}`
                }`}>
                  <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{msg.body}</p>
                  {isMine && (
                    <div className="flex justify-end mt-0.5">
                      <span className={`text-[9px] ${
                        msg.deliveryStatus === "delivered" ? "text-white/60" :
                        msg.deliveryStatus === "queued" ? "text-yellow-200/80" :
                        msg.deliveryStatus === "failed" ? "text-red-200/80" : "text-white/40"
                      }`}>
                        {msg.deliveryStatus === "delivered" ? "Delivered" : msg.deliveryStatus === "queued" ? "Queued" : msg.deliveryStatus === "failed" ? "Failed" : "Sending"}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {/* Inline ghost rows: pending scheduled sends to this recipient */}
        {scheduled
          .filter((sm) => selected && sm.recipientId === selected.id && sm.workspaceId === selected.workspaceId)
          .map((sm) => (
            <div key={`ghost-${sm.id}`} className="mt-2">
              <div className="flex justify-end">
                <div className="max-w-[80%] md:max-w-[65%] px-3.5 py-2 bg-green-primary/50 text-white rounded-2xl">
                  <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{sm.body}</p>
                </div>
              </div>
              <div className="flex justify-end mt-1">
                <p className="text-[10px] text-gray-500">
                  Queued — sends when ☀️ ·{" "}
                  <button onClick={() => cancelScheduled(sm.id)} className="text-amber-700 hover:text-amber-800 underline">
                    Cancel
                  </button>
                </p>
              </div>
            </div>
          ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Weather gating banner */}
      {(() => {
        const w = weatherByUser[selected.id];
        const gating = gatingFor(w?.code ?? null);
        if (gating === "none") return null;
        const name = selected.name ?? "they";
        const count = w?.count ?? 0;
        if (gating === "warn") {
          return (
            <div className="mx-3 md:mx-6 mb-2 mt-2 px-3 py-2 rounded-xl bg-sky-light/60 border border-sky-primary/20 flex items-center gap-2">
              <span className="text-base">🌧️</span>
              <p className="text-xs text-green-primary flex-1">
                Heavy day for {name} — {count} meeting{count === 1 ? "" : "s"}. Keep it brief.
              </p>
            </div>
          );
        }
        // block (storm)
        return (
          <div className="mx-3 md:mx-6 mb-2 mt-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 flex items-center gap-2">
            <span className="text-base">⛈️</span>
            <p className="text-xs text-amber-800 flex-1">
              {name} is slammed — {count} meeting{count === 1 ? "" : "s"} today. Only message if urgent.
            </p>
          </div>
        );
      })()}

      {/* Input */}
      <form onSubmit={handleSend} className="px-3 md:px-6 py-2 md:py-2 border-t border-gray-100 bg-white">
        <div className="flex gap-2 items-end">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Message ${selected.name ?? ""}...`}
            className="flex-1 px-4 py-2.5 rounded-full border border-gray-200 text-[16px] focus:outline-none focus:ring-2 focus:ring-green-primary/30 bg-gray-50"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            className="w-9 h-9 flex items-center justify-center bg-green-primary text-white rounded-full hover:bg-green-primary/90 transition-colors disabled:opacity-30 flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
            </svg>
          </button>
        </div>
      </form>

      {/* Storm confirm modal */}
      {showStormConfirm && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={() => setShowStormConfirm(false)}>
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-center mb-3">
              <div className="text-5xl mb-2 leading-none">⛈️</div>
              <h3 className="text-base font-semibold text-gray-900 mb-1">Send anyway?</h3>
              <p className="text-sm text-gray-500">
                {selected.name ?? "This person"} is slammed today
                {weatherByUser[selected.id]?.count != null
                  ? ` — ${weatherByUser[selected.id]?.count} meeting${weatherByUser[selected.id]?.count === 1 ? "" : "s"}`
                  : ""}.
                If it can wait until tomorrow, it&apos;ll be appreciated.
              </p>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setShowStormConfirm(false)}
                className="flex-1 py-2.5 rounded-full text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition"
              >
                Wait
              </button>
              <button
                onClick={scheduleForSunny}
                className="flex-1 py-2.5 rounded-full text-sm font-medium text-green-primary bg-sky-light hover:bg-sky-light/80 transition"
              >
                Send when ☀️
              </button>
              <button
                onClick={confirmStormSend}
                className="flex-1 py-2.5 rounded-full text-sm font-medium text-white bg-amber-500 hover:bg-amber-600 transition"
              >
                Send anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  ) : null;

  const broadcastPanel = (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="px-2 md:px-6 py-2.5 md:py-3 border-b border-gray-100 flex items-center gap-1.5 md:gap-3 bg-white/95 backdrop-blur-sm">
        <button onClick={handleBack} className="md:hidden text-green-primary p-1.5 -ml-0.5 flex items-center gap-0.5">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          <span className="text-[15px] font-normal md:hidden">Back</span>
        </button>
        <h3 className="flex-1 text-[15px] font-semibold text-gray-900">Broadcast</h3>
        <button onClick={() => { setShowBroadcast(false); setMobileView("list"); }} className="text-sm text-gray-400 hover:text-gray-600 hidden md:block">Cancel</button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-6">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-14 h-14 bg-green-primary/10 rounded-full flex items-center justify-center mb-3">
            <svg className="w-7 h-7 text-green-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 1 1 0-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 0 1-1.44-4.282m3.102.069a18.03 18.03 0 0 1-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 0 1 8.835 2.535M10.34 6.66a23.847 23.847 0 0 0 8.835-2.535m0 0A23.74 23.74 0 0 0 18.795 3m.38 1.125a23.91 23.91 0 0 1 1.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 0 0 1.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 0 1 0 3.46" />
            </svg>
          </div>
          <p className="text-[15px] text-gray-500">
            Send one message to every member in a workspace. Each person receives it on their preferred channel.
          </p>
        </div>

        {/* Workspace selector */}
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2 block">Workspace</label>
        <select
          value={broadcastWorkspace ?? ""}
          onChange={(e) => { setBroadcastWorkspace(e.target.value || null); setBroadcastResult(null); }}
          className="w-full px-4 py-3 rounded-xl border border-gray-200 text-[16px] md:text-sm focus:outline-none focus:ring-2 focus:ring-green-primary/30 bg-white appearance-none"
        >
          <option value="">Select workspace...</option>
          {workspaces.map((ws) => (
            <option key={ws.id} value={ws.id}>{ws.name}</option>
          ))}
        </select>

        {broadcastWorkspace && (
          <div className="mt-3 bg-green-primary/5 rounded-xl p-3 border border-green-primary/10">
            <p className="text-sm text-green-primary font-medium">
              Delivering to {contacts.filter((c) => c.workspaceId === broadcastWorkspace).length} member(s) via their preferred channels
            </p>
          </div>
        )}

        {broadcastResult && (
          <div className="mt-4 bg-green-light rounded-2xl p-6 text-center">
            <span className="text-3xl">☁️</span>
            <p className="text-base font-semibold text-green-primary mt-2">
              Broadcast sent!
            </p>
            <p className="text-sm text-green-primary/70 mt-1">
              {broadcastResult.sent}/{broadcastResult.total} members reached
            </p>
          </div>
        )}
      </div>

      {/* Input pinned to bottom */}
      <form onSubmit={handleBroadcast} className="px-3 md:px-6 py-2 md:py-3 border-t border-gray-100 bg-white">
        <div className="flex gap-2 items-end">
          <input
            type="text"
            value={broadcastDraft}
            onChange={(e) => setBroadcastDraft(e.target.value)}
            placeholder="Type your broadcast..."
            className="flex-1 px-4 py-2.5 rounded-full border border-gray-200 text-[16px] focus:outline-none focus:ring-2 focus:ring-green-primary/30 bg-gray-50"
          />
          <button
            type="submit"
            disabled={broadcastSending || !broadcastDraft.trim() || !broadcastWorkspace}
            className="w-9 h-9 flex items-center justify-center bg-green-primary text-white rounded-full hover:bg-green-primary/90 transition-colors disabled:opacity-30 flex-shrink-0"
          >
            {broadcastSending ? (
              <span className="text-xs font-bold">...</span>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
              </svg>
            )}
          </button>
        </div>
      </form>
    </div>
  );

  // Group scheduled by recipient for the panel
  const scheduledByRecipient = scheduled.reduce<Record<string, { name: string; items: ScheduledMessage[] }>>((acc, sm) => {
    const key = sm.recipientId;
    if (!acc[key]) acc[key] = { name: sm.recipientName ?? sm.recipientEmail ?? "Unknown", items: [] };
    acc[key].items.push(sm);
    return acc;
  }, {});

  const formatRelative = (iso: string): string => {
    const ms = Date.now() - new Date(iso).getTime();
    const m = Math.floor(ms / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
  };

  const scheduledPanel = (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="px-2 md:px-6 py-2.5 md:py-3 border-b border-gray-100 flex items-center gap-1.5 md:gap-3 bg-white/95 backdrop-blur-sm">
        <button onClick={handleBack} className="md:hidden text-green-primary p-1.5 -ml-0.5 flex items-center gap-0.5">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          <span className="text-[15px] font-normal md:hidden">Back</span>
        </button>
        <h3 className="flex-1 text-[15px] font-semibold text-gray-900">Scheduled</h3>
        <button onClick={() => { setShowScheduledPanel(false); setMobileView("list"); }} className="text-sm text-gray-400 hover:text-gray-600">Close</button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4">
        {scheduled.length === 0 ? (
          <div className="text-center py-12">
            <span className="text-3xl">☁️</span>
            <p className="text-sm text-gray-400 mt-2">No queued messages.</p>
          </div>
        ) : (
          Object.entries(scheduledByRecipient).map(([rid, group]) => (
            <div key={rid} className="mb-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-full bg-green-primary/10 flex items-center justify-center text-green-primary text-xs font-semibold">
                  {(group.name ?? "?")[0].toUpperCase()}
                </div>
                <p className="text-sm font-semibold text-gray-800">{group.name}</p>
              </div>
              <div className="space-y-2">
                {group.items.map((sm) => (
                  <div key={sm.id} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                    <p className="text-sm text-gray-800 line-clamp-2 whitespace-pre-wrap">{sm.body}</p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[11px] text-gray-400">Queued {formatRelative(sm.createdAt)} — sends when ☀️</span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => cancelScheduled(sm.id)}
                          className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded-md hover:bg-gray-100 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => sendScheduledNow(sm)}
                          className="text-xs text-green-primary font-medium hover:bg-green-primary/10 px-2 py-1 rounded-md transition-colors"
                        >
                          Send now
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  const emptyState = (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center px-4">
        <span className="text-4xl">☁️</span>
        <p className="text-sm text-gray-400 mt-2">Select a conversation or start a new chat</p>
        <p className="text-xs text-gray-300 mt-1">Messages are delivered via the recipient's preferred channel</p>
        <button
          onClick={() => { setShowNewChat(true); setMobileView("chat"); }}
          className="mt-4 px-4 py-2 bg-green-primary text-white rounded-xl text-sm font-medium hover:bg-green-primary/90 transition-colors"
        >
          + New Chat
        </button>
      </div>
    </div>
  );

  // Mobile chat/broadcast/newChat overlays go full-screen
  const mobileShowOverlay = mobileView === "chat" || showNewChat || showBroadcast || showScheduledPanel;

  return (
    <>
      {/* Desktop: side-by-side */}
      <div className="hidden md:flex bg-white rounded-2xl shadow-sm overflow-hidden" style={{ height: "calc(100vh - 180px)" }}>
        {/* Sidebar */}
        <div className="w-72 border-r border-gray-100 flex flex-col">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Chats</h2>
            <div className="flex items-center gap-2">
              {scheduled.length > 0 && (
                <button
                  onClick={() => setShowScheduledPanel(true)}
                  className="text-sm text-amber-700 font-medium hover:text-amber-800 transition-colors"
                  title="View scheduled messages"
                >
                  Scheduled ({scheduled.length})
                </button>
              )}
              <button onClick={() => setShowBroadcast(true)} className="text-sm text-gray-400 font-medium hover:text-green-primary transition-colors" title="Broadcast to workspace">
                Broadcast
              </button>
              <button onClick={() => setShowNewChat(true)} className="text-sm text-green-primary font-medium hover:text-green-primary/80 transition-colors">
                + New
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">{contactList}</div>
        </div>
        {/* Main */}
        <div className="flex-1 flex flex-col">
          {showScheduledPanel ? scheduledPanel : showBroadcast ? broadcastPanel : showNewChat ? newChatPicker : chatArea ?? emptyState}
        </div>
      </div>

      {/* Mobile: contact list (always rendered, visible when no overlay) */}
      <div className={`md:hidden bg-white rounded-2xl shadow-sm overflow-hidden flex flex-col relative ${mobileShowOverlay ? "hidden" : ""}`} style={{ height: "calc(100dvh - 140px)" }}>
        <div className="px-4 pt-4 pb-3 border-b border-gray-100 flex items-end justify-between">
          <h2 className="text-[28px] leading-none font-bold text-gray-900">Messages</h2>
          <div className="flex items-center gap-2">
            {scheduled.length > 0 && (
              <button
                onClick={() => { setShowScheduledPanel(true); setMobileView("chat"); }}
                className="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
              >
                ⏳ {scheduled.length} scheduled
              </button>
            )}
            <button
              onClick={() => { setShowNewChat(true); setMobileView("chat"); }}
              className="w-8 h-8 bg-green-primary text-white rounded-full flex items-center justify-center active:scale-95 transition-transform"
              aria-label="New chat"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">{contactList}</div>
      </div>

      {/* Mobile: full-screen overlay for conversation / new chat / broadcast / scheduled */}
      {mobileShowOverlay && (
        <div className="md:hidden fixed inset-0 z-50 bg-white flex flex-col" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
          {showScheduledPanel ? scheduledPanel : showBroadcast ? broadcastPanel : showNewChat ? newChatPicker : chatArea ?? emptyState}
        </div>
      )}

      {/* Mobile: Broadcast FAB.
          Shown when no overlay is open (contact list view) OR when the scheduled
          panel overlay is open. Hidden inside conversations, new-chat picker,
          and the broadcast composer itself. */}
      {(!mobileShowOverlay || showScheduledPanel) && (
        <button
          onClick={() => { setShowBroadcast(true); setMobileView("chat"); }}
          className="md:hidden fixed right-4 z-[60] flex items-center gap-2 px-4 h-12 rounded-full bg-green-primary text-white text-sm font-medium shadow-lg shadow-green-primary/30 active:scale-95 transition-transform"
          style={{ bottom: `calc(1rem + env(safe-area-inset-bottom))` }}
          aria-label="Broadcast"
        >
          <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 1 1 0-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 0 1-1.44-4.282m3.102.069a18.03 18.03 0 0 1-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 0 1 8.835 2.535M10.34 6.66a23.847 23.847 0 0 0 8.835-2.535m0 0A23.74 23.74 0 0 0 18.795 3m.38 1.125a23.91 23.91 0 0 1 1.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 0 0 1.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 0 1 0 3.46" />
          </svg>
          Broadcast
        </button>
      )}
    </>
  );
}
