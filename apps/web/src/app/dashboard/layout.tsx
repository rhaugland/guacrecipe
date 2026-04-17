"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "../../hooks/useAuth";
import { useWorkspaces } from "../../hooks/useWorkspaces";
import { api } from "../../lib/api-client";
import { Header } from "./components/Header";
import { OnboardingTour } from "./components/OnboardingTour";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading: authLoading, logout } = useAuth();
  const { workspaces } = useWorkspaces();
  const [showTour, setShowTour] = useState(false);
  const [taskCount, setTaskCount] = useState(0);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
    if (!authLoading && user && !user.onboarded) router.push("/onboarding");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!user || !user.onboarded) return;
    if (localStorage.getItem("nsTourCompleted") !== "1") setShowTour(true);
  }, [user]);

  useEffect(() => {
    if (!user || workspaces.length === 0) return;
    let cancelled = false;
    (async () => {
      let total = 0;
      for (const ws of workspaces) {
        try {
          const tasks = await api.tasks.list(ws.id, "assignee", "open") as unknown[];
          total += Array.isArray(tasks) ? tasks.length : 0;
        } catch {}
      }
      if (!cancelled) setTaskCount(total);
    })();
    return () => { cancelled = true; };
  }, [user, workspaces, pathname]);

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="text-green-primary text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream">
      <div className="max-w-4xl mx-auto py-4 md:py-6 px-3 md:px-4 space-y-4">
        <Header userName={user.name ?? "User"} onLogout={logout} taskCount={taskCount} />
        {children}
      </div>
      <OnboardingTour open={showTour} onClose={() => setShowTour(false)} />
    </div>
  );
}
