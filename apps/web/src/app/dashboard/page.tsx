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

        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Send a message through Guac</h2>
          <p className="text-sm text-gray-500 mb-3">Text or email Guac to route a message to your workspace members.</p>
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-400 uppercase">Text</span>
              <a href="sms:+16513720165" className="text-sm font-medium text-green-primary hover:underline">(651) 372-0165</a>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-400 uppercase">Email</span>
              <a href="mailto:avo@guacwithme.com" className="text-sm font-medium text-green-primary hover:underline">avo@guacwithme.com</a>
            </div>
          </div>
        </div>

        <QuickToggles prefs={prefs} onUpdate={updatePrefs} />
        <WorkspaceList workspaces={workspaces} onCreate={create} getMembers={getMembers} addMember={addMember} removeMember={removeMember} />
        <NotificationPrefs prefs={prefs} onUpdate={updatePrefs} />
        <WorkingHoursEditor prefs={prefs} onUpdate={updatePrefs} />
        <RecentActivity activity={activity} />
      </div>
    </div>
  );
}
