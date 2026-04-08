"use client";

type Props = { userName: string; onLogout: () => void };

export function Header({ userName, onLogout }: Props) {
  return (
    <header className="flex items-center justify-between py-4 px-6 bg-white rounded-2xl shadow-sm">
      <div className="flex items-center gap-3">
        <span className="text-3xl">🥑</span>
        <h1 className="text-xl font-bold text-green-primary">Guac</h1>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-gray-600 text-sm">{userName}</span>
        <button onClick={onLogout} className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
          Logout
        </button>
      </div>
    </header>
  );
}
