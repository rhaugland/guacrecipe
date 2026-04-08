"use client";
import { useState, useEffect } from "react";
import { api } from "../lib/api-client";
import type { ActivityItem } from "../lib/types";

export function useActivity() {
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.activity.recent().then((data) => setActivity(data.activity)).finally(() => setLoading(false));

    const interval = setInterval(async () => {
      try {
        const data = await api.activity.recent();
        setActivity(data.activity);
      } catch {}
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  return { activity, loading };
}
