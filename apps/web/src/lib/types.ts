export type Channel = "sms" | "email" | "both" | "discord" | "slack";

export type User = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  discordId: string | null;
  slackId: string | null;
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
  addedBy: string | null;
};

export type WorkspaceMember = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: "admin" | "member";
  preferredChannel: Channel;
  notificationChannels: string[];
  workingHoursEnabled: boolean;
  notificationsEnabled: boolean;
  addedAt: string;
  workspaceEmail: string | null;
  workspacePhone: string | null;
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

export type ChatMessage = {
  id: string;
  senderId: string;
  body: string;
  direction: "inbound" | "outbound";
  channel: string;
  deliveryStatus: "delivered" | "queued" | "pending" | "failed";
  createdAt: string;
};

export type ChannelIntelligence = {
  channels: { channel: string; avgResponseMs: number; responseCount: number }[];
  fastest: { channel: string; avgResponseMs: number; label: string } | null;
  totalMessages: number;
  deliveryRate: number;
};

export type SearchResult = {
  messageId: string;
  body: string;
  senderId: string;
  senderName: string;
  contactId: string;
  contactName: string;
  workspaceId: string;
  workspaceName: string;
  channel: string;
  createdAt: string;
};

export type Preferences = {
  preferredChannel: Channel;
  notificationChannels: string[];
  notificationTimings: string[];
  notificationsEnabled: boolean;
  workingHoursEnabled: boolean;
  workingHoursStart: string;
  workingHoursEnd: string;
  workingHoursTimezone: string;
  workingHoursDays: number[];
  discordId: string | null;
  slackId: string | null;
  telegramChatId: string | null;
};
