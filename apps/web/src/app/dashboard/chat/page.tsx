"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "../../../hooks/useAuth";
import { useWorkspaces } from "../../../hooks/useWorkspaces";
import { api } from "../../../lib/api-client";
import type { WorkspaceMember, ChatMessage } from "../../../lib/types";

type Contact = WorkspaceMember & { workspaceId: string; workspaceName: string };

const CHANNEL_LABELS: Record<string, { label: string; color: string }> = {
  email: { label: "Email", color: "bg-blue-100 text-blue-700" },
  sms: { label: "SMS", color: "bg-purple-100 text-purple-700" },
  discord: { label: "Discord", color: "bg-indigo-100 text-indigo-700" },
  slack: { label: "Slack", color: "bg-yellow-100 text-yellow-800" },
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

  useEffect(() => {
    loadContacts();
  }, [user, workspaces]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const interval = setInterval(loadContacts, 30000);
    return () => clearInterval(interval);
  }, [loadContacts]);

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
    setMobileView("chat");
  };

  const handleBack = () => {
    setMobileView("list");
    setShowNewChat(false);
  };

  if (!user) return null;

  const grouped = contacts.reduce<Record<string, { name: string; contacts: Contact[] }>>((acc, c) => {
    if (!acc[c.workspaceId]) acc[c.workspaceId] = { name: c.workspaceName, contacts: [] };
    acc[c.workspaceId].contacts.push(c);
    return acc;
  }, {});

  // -- Shared components --

  const contactList = (
    <>
      {loadingContacts ? (
        <p className="text-sm text-gray-400 text-center py-8">Loading...</p>
      ) : Object.entries(grouped).length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No contacts yet</p>
      ) : (
        Object.entries(grouped).map(([wsId, group]) => (
          <div key={wsId}>
            <div className="px-4 py-2 bg-gray-50">
              <span className="text-xs font-semibold text-gray-400 uppercase">{group.name}</span>
            </div>
            {group.contacts.map((c) => (
              <button
                key={`${wsId}-${c.id}`}
                onClick={() => handleSelectContact(c)}
                className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors ${
                  selected?.id === c.id && selected?.workspaceId === c.workspaceId ? "bg-green-light" : ""
                }`}
              >
                <div className="w-10 h-10 md:w-8 md:h-8 rounded-full bg-green-primary/10 flex items-center justify-center text-green-primary text-sm font-medium flex-shrink-0">
                  {(c.name ?? "?")[0].toUpperCase()}
                </div>
                <div className="flex-1 text-left min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{c.name ?? "Pending"}</p>
                  <div className="mt-0.5">
                    <ChannelTags channels={getChannels(c)} />
                  </div>
                </div>
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${c.notificationsEnabled ? "bg-green-secondary" : "bg-gray-300"}`} />
              </button>
            ))}
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
      <div className="px-4 md:px-6 py-3 border-b border-gray-100 flex items-center gap-3">
        <button onClick={handleBack} className="md:hidden text-gray-400 hover:text-gray-600 p-1 -ml-1">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="w-10 h-10 rounded-full bg-green-primary/10 flex items-center justify-center text-green-primary font-medium flex-shrink-0">
          {(selected.name ?? "?")[0].toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
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
          </div>
        </div>
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
            <button onClick={() => setShowNewChat(true)} className="text-sm text-green-primary font-medium hover:text-green-primary/80 transition-colors">
              + New
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">{contactList}</div>
        </div>
        {/* Main */}
        <div className="flex-1 flex flex-col">
          {showNewChat ? newChatPicker : chatArea ?? emptyState}
        </div>
      </div>

      {/* Mobile: full-screen panels */}
      <div className="md:hidden bg-white rounded-2xl shadow-sm overflow-hidden flex flex-col" style={{ height: "calc(100vh - 160px)" }}>
        {mobileView === "list" && !showNewChat ? (
          <>
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Chats</h2>
              <button onClick={() => { setShowNewChat(true); setMobileView("chat"); }} className="text-sm text-green-primary font-medium">
                + New
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">{contactList}</div>
          </>
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
