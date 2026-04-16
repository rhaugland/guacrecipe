"use client";
import { Suspense } from "react";
import { useAuth } from "../../../hooks/useAuth";
import { usePreferences } from "../../../hooks/usePreferences";
import { useWorkspaces } from "../../../hooks/useWorkspaces";
import { useActivity } from "../../../hooks/useActivity";
import { WorkspaceList } from "../components/WorkspaceList";
import { RecentActivity } from "../components/RecentActivity";
import { ContactInfo } from "../components/ContactInfo";
import { CommunicationPrefs } from "../components/CommunicationPrefs";
import { RoutingRules } from "../components/RoutingRules";
import { PushNotifications } from "../components/PushNotifications";
import { GoogleCalendar } from "../components/GoogleCalendar";
import { DemoTeammates } from "../components/DemoTeammates";

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="text-green-primary text-lg text-center py-8">Loading...</div>}>
      <SettingsPageInner />
    </Suspense>
  );
}

function SettingsPageInner() {
  const { user } = useAuth();
  const { prefs, loading: prefsLoading, update: updatePrefs } = usePreferences();
  const { workspaces, create, getMembers, addMember, removeMember, setWorkspaceContact } = useWorkspaces();
  const { activity } = useActivity();

  if (prefsLoading || !user || !prefs) {
    return <div className="text-green-primary text-lg text-center py-8">Loading...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <ContactInfo prefs={prefs} onUpdate={updatePrefs} />
      <CommunicationPrefs prefs={prefs} onUpdate={updatePrefs} />
      <GoogleCalendar />
      <PushNotifications />
      <RoutingRules workspaces={workspaces} />
      <DemoTeammates />
      <WorkspaceList workspaces={workspaces} onCreate={create} getMembers={getMembers} addMember={addMember} removeMember={removeMember} setWorkspaceContact={setWorkspaceContact} userId={user.id} />
      <RecentActivity activity={activity} />
    </div>
  );
}
