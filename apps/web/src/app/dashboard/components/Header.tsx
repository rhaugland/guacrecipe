"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Props = { userName: string; onLogout: () => void };

export function Header({ userName, onLogout }: Props) {
  const pathname = usePathname();

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
              {tab.label}
            </Link>
          );
        })}
      </div>
    </header>
  );
}
