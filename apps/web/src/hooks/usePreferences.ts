"use client";
import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api-client";
import type { Preferences } from "../lib/types";

export function usePreferences() {
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.preferences.get().then(setPrefs).finally(() => setLoading(false));
  }, []);

  const update = useCallback(async (data: Partial<Preferences>) => {
    await api.preferences.update(data);
    setPrefs((prev) => prev ? { ...prev, ...data } : null);
  }, []);

  return { prefs, loading, update };
}
