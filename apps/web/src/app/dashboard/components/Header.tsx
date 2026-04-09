"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Props = { userName: string; onLogout: () => void };

export function Header({ userName, onLogout }: Props) {
  const pathname = usePathname();

  const tabs = [
    { label: "Home", href: "/dashboard" },
    { label: "Chat", href: "/dashboard/chat" },
  ];

  return (
    <header className="bg-white rounded-2xl shadow-sm">
      <div className="flex items-center justify-between py-3 md:py-4 px-4 md:px-6">
        <div className="flex items-center gap-2 md:gap-3">
          <span className="text-2xl md:text-3xl">🥑</span>
          <h1 className="text-lg md:text-xl font-bold text-green-primary">Guac</h1>
        </div>
        <div className="flex items-center gap-3 md:gap-4">
          <span className="text-gray-600 text-sm hidden sm:inline">{userName}</span>
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
