"use client";
import { useState, useEffect } from "react";
import { api } from "../lib/api-client";
import type { User } from "../lib/types";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.auth.session()
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const logout = async () => {
    await api.auth.logout();
    setUser(null);
    window.location.href = "/login";
  };

  return { user, loading, logout };
}
