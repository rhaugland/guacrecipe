"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "../../../hooks/useAuth";
import { useWorkspaces } from "../../../hooks/useWorkspaces";
import { api } from "../../../lib/api-client";
import type { WorkspaceMember, ChatMessage, ChannelIntelligence, SearchResult } from "../../../lib/types";

type Contact = WorkspaceMember & { workspaceId: string; workspaceName: string };

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

export default function ChatPage() {
  const { user } = useAuth();
  const { workspaces, getMembers } = useWorkspaces();

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
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // On mobile: "list" shows sidebar, "chat" shows conversation
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadContacts = useCallback(async () => {
    if (!user || workspaces.length === 0) return;
    const allContacts: Contact[] = [];
    for (const ws of workspaces) {
      const members = await getMembers(ws.id);
      for (const m of members) {
        if (m.id !== user.id) {
          allContacts.push({ ...m, workspaceId: ws.id, workspaceName: ws.name });
        }
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
  }, [user, workspaces, getMembers, selected]);

  const loadUnread = useCallback(async () => {
    try {
      const { unread } = await api.messages.unread();
      const counts: Record<string, number> = {};
      for (const u of unread) counts[`${u.workspaceId}:${u.contactId}`] = u.count;
      setUnreadCounts(counts);
    } catch {}
  }, []);

  useEffect(() => {
    loadContacts();
    loadUnread();
  }, [user, workspaces]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const interval = setInterval(() => { loadContacts(); loadUnread(); }, 30000);
    return () => clearInterval(interval);
  }, [loadContacts, loadUnread]);

  const loadConversation = useCallback(async (contact: Contact) => {
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
    const interval = setInterval(() => loadConversation(selected), 5000);
    return () => clearInterval(interval);
  }, [selected, loadConversation]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || !selected || sending) return;
    setSending(true);
    try {
      await api.messages.send({
        workspaceId: selected.workspaceId,
        recipientId: selected.id,
        body: draft.trim(),
      });
      setDraft("");
      await loadConversation(selected);
    } finally {
      setSending(false);
    }
  };

  const handleSelectContact = (contact: Contact) => {
    setSelected(contact);
    setShowNewChat(false);
    setShowBroadcast(false);
    setMobileView("chat");
    setIntelligence(null);
    setShowIntelligence(false);
    // Mark as read and clear badge
    const key = `${contact.workspaceId}:${contact.id}`;
    setUnreadCounts((prev) => { const next = { ...prev }; delete next[key]; return next; });
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
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-green-primary/30 focus:bg-white border border-transparent focus:border-gray-200"
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
              const unread = unreadCounts[`${wsId}:${c.id}`] ?? 0;
              return (
                <button
                  key={`${wsId}-${c.id}`}
                  onClick={() => handleSelectContact(c)}
                  className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors ${
                    selected?.id === c.id && selected?.workspaceId === c.workspaceId ? "bg-green-light" : ""
                  }`}
                >
                  <div className="relative flex-shrink-0">
                    <div className="w-10 h-10 md:w-8 md:h-8 rounded-full bg-green-primary/10 flex items-center justify-center text-green-primary text-sm font-medium">
                      {(c.name ?? "?")[0].toUpperCase()}
                    </div>
                    {unread > 0 && (
                      <span className="absolute -top-1 -right-1 w-5 h-5 bg-green-primary text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                        {unread > 9 ? "9+" : unread}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className={`text-sm truncate ${unread > 0 ? "font-bold text-gray-900" : "font-medium text-gray-900"}`}>{c.name ?? "Pending"}</p>
                    <div className="mt-0.5">
                      <ChannelTags channels={getChannels(c)} />
                    </div>
                  </div>
                  {unread > 0 ? (
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-green-primary" />
                  ) : (
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${c.notificationsEnabled ? "bg-green-secondary" : "bg-gray-300"}`} />
                  )}
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
      <div className="px-4 md:px-6 py-3 border-b border-gray-100 flex items-center gap-3 relative">
        <button onClick={handleBack} className="md:hidden text-gray-400 hover:text-gray-600 p-1 -ml-1">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          onClick={() => setShowIntelligence(!showIntelligence)}
          className="w-10 h-10 rounded-full bg-green-primary/10 flex items-center justify-center text-green-primary font-medium flex-shrink-0 hover:bg-green-primary/20 transition-colors"
        >
          {(selected.name ?? "?")[0].toUpperCase()}
        </button>
        <button onClick={() => setShowIntelligence(!showIntelligence)} className="flex-1 min-w-0 text-left hover:opacity-80 transition-opacity">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-gray-900">{selected.name ?? "Pending"}</p>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-light text-green-primary font-medium">
              {selected.workspaceName}
            </span>
          </div>
          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
            <span className="text-[10px] text-gray-400 mr-0.5">Delivers via</span>
            <ChannelTags channels={getChannels(selected)} />
            {!selected.notificationsEnabled && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-red-100 text-red-600">Paused</span>
            )}
            {intelligence?.fastest && (
              <>
                <span className="text-[10px] text-gray-300 mx-0.5">|</span>
                <span className="text-[10px] text-green-primary font-medium">
                  Fastest: {CHANNEL_LABELS[intelligence.fastest.channel]?.label} ~{intelligence.fastest.label}
                </span>
              </>
            )}
          </div>
        </button>

        {/* Intelligence popup */}
        {showIntelligence && intelligence && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowIntelligence(false)} />
            <div className="absolute top-full left-4 right-4 md:left-16 md:right-auto md:w-80 mt-1 bg-white rounded-xl shadow-lg border border-gray-100 z-50 p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-gray-800">Channel Intelligence</h4>
                <button onClick={() => setShowIntelligence(false)} className="text-gray-400 hover:text-gray-600">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
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
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">
            No messages yet. Send one to {selected.name ?? "this person"} — it'll be delivered via their preferred channel.
          </p>
        )}
        {messages.map((msg) => {
          const isMine = msg.senderId === user.id;
          return (
            <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] md:max-w-[70%] rounded-2xl px-4 py-2.5 ${
                isMine
                  ? "bg-green-primary text-white rounded-br-md"
                  : "bg-gray-100 text-gray-900 rounded-bl-md"
              }`}>
                <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
                <div className={`flex items-center gap-1.5 mt-1 ${isMine ? "justify-end" : ""}`}>
                  <span className={`text-[10px] ${isMine ? "text-white/60" : "text-gray-400"}`}>
                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  </span>
                  {isMine && (
                    <span className={`text-[10px] ${
                      msg.deliveryStatus === "delivered" ? "text-white/80" :
                      msg.deliveryStatus === "queued" ? "text-yellow-200" :
                      msg.deliveryStatus === "failed" ? "text-red-200" : "text-white/40"
                    }`}>
                      {msg.deliveryStatus === "delivered" ? "✓" : msg.deliveryStatus === "queued" ? "⏳" : msg.deliveryStatus === "failed" ? "✗" : "…"}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="px-4 md:px-6 py-3 border-t border-gray-100 flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Message ${selected.name ?? ""}...`}
          className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-primary/30"
          autoFocus
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="px-4 md:px-5 py-2.5 bg-green-primary text-white rounded-xl text-sm font-medium hover:bg-green-primary/90 transition-colors disabled:opacity-50"
        >
          {sending ? "..." : "Send"}
        </button>
      </form>
    </div>
  ) : null;

  const broadcastPanel = (
    <div className="flex-1 flex flex-col">
      <div className="px-4 md:px-6 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={handleBack} className="md:hidden text-gray-400 hover:text-gray-600 p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h3 className="text-sm font-semibold text-gray-700">Broadcast Message</h3>
        </div>
        <button onClick={() => { setShowBroadcast(false); setMobileView("list"); }} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4">
        <p className="text-sm text-gray-500 mb-4">
          Send one message to every member in a workspace. Each person receives it on their preferred channel.
        </p>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Workspace</label>
            <select
              value={broadcastWorkspace ?? ""}
              onChange={(e) => { setBroadcastWorkspace(e.target.value || null); setBroadcastResult(null); }}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-primary/30 bg-white"
            >
              <option value="">Select workspace...</option>
              {workspaces.map((ws) => (
                <option key={ws.id} value={ws.id}>{ws.name}</option>
              ))}
            </select>
          </div>
          {broadcastWorkspace && (
            <div className="bg-green-light rounded-xl p-3">
              <p className="text-xs text-green-primary">
                This will deliver to {contacts.filter((c) => c.workspaceId === broadcastWorkspace).length} member(s), each on their preferred channel.
              </p>
            </div>
          )}
        </div>
        {broadcastResult && (
          <div className="mt-4 bg-green-light rounded-xl p-4 text-center">
            <span className="text-2xl">🥑</span>
            <p className="text-sm font-medium text-green-primary mt-1">
              Broadcast sent to {broadcastResult.sent}/{broadcastResult.total} members
            </p>
          </div>
        )}
      </div>
      <form onSubmit={handleBroadcast} className="px-4 md:px-6 py-3 border-t border-gray-100 flex gap-2">
        <input
          type="text"
          value={broadcastDraft}
          onChange={(e) => setBroadcastDraft(e.target.value)}
          placeholder="Type your broadcast message..."
          className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-primary/30"
          autoFocus
        />
        <button
          type="submit"
          disabled={broadcastSending || !broadcastDraft.trim() || !broadcastWorkspace}
          className="px-4 md:px-5 py-2.5 bg-green-primary text-white rounded-xl text-sm font-medium hover:bg-green-primary/90 transition-colors disabled:opacity-50"
        >
          {broadcastSending ? "..." : "Send All"}
        </button>
      </form>
    </div>
  );

  const emptyState = (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center px-4">
        <span className="text-4xl">🥑</span>
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

  return (
    <>
      {/* Desktop: side-by-side */}
      <div className="hidden md:flex bg-white rounded-2xl shadow-sm overflow-hidden" style={{ height: "calc(100vh - 180px)" }}>
        {/* Sidebar */}
        <div className="w-72 border-r border-gray-100 flex flex-col">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Chats</h2>
            <div className="flex items-center gap-2">
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
          {showBroadcast ? broadcastPanel : showNewChat ? newChatPicker : chatArea ?? emptyState}
        </div>
      </div>

      {/* Mobile: full-screen panels */}
      <div className="md:hidden bg-white rounded-2xl shadow-sm overflow-hidden flex flex-col" style={{ height: "calc(100vh - 160px)" }}>
        {mobileView === "list" && !showNewChat && !showBroadcast ? (
          <>
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Chats</h2>
              <div className="flex items-center gap-2">
                <button onClick={() => { setShowBroadcast(true); setMobileView("chat"); }} className="text-sm text-gray-400 font-medium hover:text-green-primary">
                  Broadcast
                </button>
                <button onClick={() => { setShowNewChat(true); setMobileView("chat"); }} className="text-sm text-green-primary font-medium">
                  + New
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">{contactList}</div>
          </>
        ) : showBroadcast ? (
          broadcastPanel
        ) : showNewChat ? (
          newChatPicker
        ) : chatArea ? (
          chatArea
        ) : (
          emptyState
        )}
      </div>
    </>
  );
}
