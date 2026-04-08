"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../hooks/useAuth";
import { usePreferences } from "../../hooks/usePreferences";
import { useWorkspaces } from "../../hooks/useWorkspaces";
import { useActivity } from "../../hooks/useActivity";
import { Header } from "./components/Header";
import { QuickToggles } from "./components/QuickToggles";
import { WorkspaceList } from "./components/WorkspaceList";
import { NotificationPrefs } from "./components/NotificationPrefs";
import { WorkingHoursEditor } from "./components/WorkingHoursEditor";
import { RecentActivity } from "./components/RecentActivity";

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();
  const { prefs, loading: prefsLoading, update: updatePrefs } = usePreferences();
  const { workspaces, create, getMembers, addMember, removeMember } = useWorkspaces();
  const { activity } = useActivity();

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
    if (!authLoading && user && !user.onboarded) router.push("/onboarding");
  }, [authLoading, user, router]);

  if (authLoading || prefsLoading || !user || !prefs) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="text-green-primary text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream">
      <div className="max-w-2xl mx-auto py-6 px-4 space-y-4">
        <Header userName={user.name ?? "User"} onLogout={logout} />
        <QuickToggles prefs={prefs} onUpdate={updatePrefs} />
        <WorkspaceList workspaces={workspaces} onCreate={create} getMembers={getMembers} addMember={addMember} removeMember={removeMember} />
        <NotificationPrefs prefs={prefs} onUpdate={updatePrefs} />
        <WorkingHoursEditor prefs={prefs} onUpdate={updatePrefs} />
        <RecentActivity activity={activity} />
      </div>
    </div>
  );
}
