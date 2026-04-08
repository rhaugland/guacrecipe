export type Channel = "sms" | "email" | "both";

export type User = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  preferredChannel: Channel;
  notificationTimings: string[];
  workingHoursEnabled: boolean;
  workingHoursStart: string;
  workingHoursEnd: string;
  workingHoursTimezone: string;
  workingHoursDays: number[];
  notificationsEnabled: boolean;
  onboarded: boolean;
};

export type Workspace = {
  id: string;
  name: string;
  role: "admin" | "member";
  memberCount: number;
  createdAt: string;
};

export type WorkspaceMember = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: "admin" | "member";
  preferredChannel: Channel;
  workingHoursEnabled: boolean;
  notificationsEnabled: boolean;
  addedAt: string;
};

export type ActivityItem = {
  conversationId: string;
  workspace: string;
  sender: string;
  recipient: string;
  lastMessage: string;
  deliveryStatus: "delivered" | "queued" | "pending" | "failed";
  timestamp: string;
};

export type Preferences = {
  preferredChannel: Channel;
  notificationTimings: string[];
  notificationsEnabled: boolean;
  workingHoursEnabled: boolean;
  workingHoursStart: string;
  workingHoursEnd: string;
  workingHoursTimezone: string;
  workingHoursDays: number[];
};
