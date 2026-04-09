"use client";
import { useState } from "react";

type Props = {
  title: string;
  defaultOpen?: boolean;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
};

export function CollapsibleCard({ title, defaultOpen = true, headerRight, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="bg-white rounded-2xl shadow-sm">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-6 py-4 flex items-center justify-between"
      >
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">{title}</h2>
        <div className="flex items-center gap-2">
          {headerRight && <div onClick={(e) => e.stopPropagation()}>{headerRight}</div>}
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {open && <div className="px-6 pb-6">{children}</div>}
    </div>
  );
}
