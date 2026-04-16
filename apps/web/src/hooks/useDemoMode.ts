"use client";
import { useEffect, useState } from "react";
import { subscribeDemo } from "../lib/demo-data";

const KEY = "demoMode";
const EVENT = "guac:demo-mode-changed";

export function useDemoMode() {
  const [enabled, setEnabledState] = useState<boolean>(false);

  // Initialize from sessionStorage / ?demo=1 after mount (avoid SSR hydration mismatch)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const apply = () => {
      const stored = sessionStorage.getItem(KEY);
      if (stored === "1") {
        setEnabledState(true);
        return;
      }
      if (stored === "0") {
        setEnabledState(false);
        return;
      }
      const fromUrl = new URLSearchParams(window.location.search).get("demo") === "1";
      if (fromUrl) {
        sessionStorage.setItem(KEY, "1");
        setEnabledState(true);
      } else {
        setEnabledState(false);
      }
    };
    apply();
    const handler = () => apply();
    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
  }, []);

  const setEnabled = (v: boolean) => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem(KEY, v ? "1" : "0");
      window.dispatchEvent(new Event(EVENT));
    }
    setEnabledState(v);
  };

  return { enabled, setEnabled };
}

// Re-render trigger that subscribes to demo-data mutations.
export function useDemoTick(): number {
  const [n, setN] = useState(0);
  useEffect(() => subscribeDemo(() => setN((x) => x + 1)), []);
  return n;
}
