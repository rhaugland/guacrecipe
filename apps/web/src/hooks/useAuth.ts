"use client";
import { useState, useEffect } from "react";
import { api } from "../lib/api-client";
import { setSessionToken, clearSessionToken } from "../lib/api-client";
import type { User } from "../lib/types";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Capture token from URL (after magic link redirect)
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (token) {
      setSessionToken(token);
      // Clean the URL
      window.history.replaceState({}, "", window.location.pathname);
    }

    api.auth.session()
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const logout = async () => {
    await api.auth.logout();
    clearSessionToken();
    setUser(null);
    window.location.href = "/login";
  };

  return { user, loading, logout };
}
