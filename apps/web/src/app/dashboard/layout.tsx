"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../hooks/useAuth";
import { Header } from "./components/Header";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
    if (!authLoading && user && !user.onboarded) router.push("/onboarding");
  }, [authLoading, user, router]);

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
        <Header userName={user.name ?? "User"} onLogout={logout} />
        {children}
      </div>
    </div>
  );
}
