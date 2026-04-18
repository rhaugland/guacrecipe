"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const HOW_IT_WORKS = [
  {
    title: "Weather",
    emoji: "🌤️",
    body: "Your weather reflects how available you are. Sunny means you're free — messages come through instantly. Cloudy means you're busy — only urgent messages get through. Stormy means do not disturb — everything queues until you're free. Your teammates see your weather before they message you, so they can decide to send now or wait.",
  },
  {
    title: "Chat",
    emoji: "💬",
    body: "Send messages to anyone in your workspace. Each person receives your message on their preferred channel — Email, SMS, Discord, Slack, or Telegram. If they're slammed (stormy weather), you'll be warned before sending so you can queue it for when they're free.",
  },
  {
    title: "Broadcast",
    emoji: "📢",
    body: "Send one message to your entire workspace at once. Every member gets it delivered on their preferred channel automatically. Perfect for announcements, updates, or check-ins — no need to message people one by one.",
  },
  {
    title: "Tasks",
    emoji: "✅",
    body: "Assign tasks to anyone in your workspace. They'll be notified on their preferred channel when assigned, reminded before the due date based on their timing preferences, and you'll be notified when they mark it complete. Everything respects their weather status — notifications queue when they're busy.",
  },
  {
    title: "Message Routing",
    emoji: "🔀",
    body: "You don't need to change how you communicate. Reply from Slack, Discord, Telegram, Email, or SMS — New Sky routes it back to the sender automatically. Your teammates pick their preferred channel too. Everyone talks where they're comfortable, and New Sky handles the rest.",
  },
  {
    title: "Don't want to use New Sky?",
    emoji: "👋",
    body: "Totally fine! You can keep using your favorite apps exactly as you do now. When someone in your workspace messages you through New Sky, it shows up on whatever channel you've set — Slack, Discord, Email, whatever. Just reply there like normal. No app to install, no habits to change.",
  },
];

function HowItWorksModal({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 pt-5 pb-3 flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900">How It Works</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors" aria-label="Close">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-5 pb-5 space-y-2">
          {HOW_IT_WORKS.map((item, i) => {
            const isOpen = open === i;
            return (
              <div key={item.title} className="rounded-xl border border-gray-100 overflow-hidden">
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <span className="text-lg">{item.emoji}</span>
                    <span className="text-sm font-semibold text-gray-800">{item.title}</span>
                  </span>
                  <svg
                    className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {isOpen && (
                  <div className="px-4 pb-3">
                    <p className="text-sm text-gray-600 leading-relaxed">{item.body}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

type Props = { userName: string; onLogout: () => void; taskCount?: number };

export function Header({ userName, onLogout, taskCount }: Props) {
  const pathname = usePathname();
  const [showHelp, setShowHelp] = useState(false);

  const tabs = [
    { label: "Weather", href: "/dashboard" },
    { label: "Chat", href: "/dashboard/chat" },
    { label: "Tasks", href: "/dashboard/tasks" },
  ];

  const settingsActive = pathname.startsWith("/dashboard/settings");

  return (
    <header className="bg-white rounded-2xl shadow-sm">
      <div className="flex items-center justify-between py-3 md:py-4 px-4 md:px-6">
        <div className="flex items-center gap-2 md:gap-3">
          <span className="text-2xl md:text-3xl">☁️</span>
          <h1 className="text-lg md:text-xl font-bold text-green-primary">New Sky</h1>
        </div>
        <div className="flex items-center gap-2 md:gap-3">
          <span className="text-gray-600 text-sm hidden sm:inline">{userName}</span>
          <button
            onClick={() => setShowHelp(true)}
            aria-label="How it works"
            className="w-9 h-9 rounded-full flex items-center justify-center text-gray-500 hover:text-green-primary hover:bg-gray-100 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="10" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
              <circle cx="12" cy="17" r="0.5" fill="currentColor" />
            </svg>
          </button>
          <Link
            href="/dashboard/settings"
            aria-label="Settings"
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
              settingsActive
                ? "bg-green-primary text-white"
                : "text-gray-500 hover:text-green-primary hover:bg-gray-100"
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </Link>
          <button onClick={onLogout} className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
            Logout
          </button>
        </div>
      </div>
      <div className="flex gap-1 px-4 md:px-6 pb-2">
        {tabs.map((tab) => {
          const isActive = tab.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-sm font-medium text-center transition-colors ${
                isActive
                  ? "bg-green-primary text-white"
                  : "text-gray-500 hover:bg-gray-100"
              }`}
            >
              <span className="relative inline-flex items-center gap-1">
                {tab.label}
                {tab.label === "Tasks" && taskCount != null && taskCount > 0 && (
                  <span className={`inline-flex items-center justify-center text-[10px] font-bold min-w-[18px] h-[18px] rounded-full px-1 leading-none ${
                    isActive
                      ? "bg-white text-green-primary"
                      : "bg-green-primary text-white"
                  }`}>
                    {taskCount > 99 ? "99+" : taskCount}
                  </span>
                )}
              </span>
            </Link>
          );
        })}
      </div>
      {showHelp && <HowItWorksModal onClose={() => setShowHelp(false)} />}
    </header>
  );
}
