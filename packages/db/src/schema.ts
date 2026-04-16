import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
  time,
  date,
  jsonb,
  pgEnum,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const channelEnum = pgEnum("channel", ["sms", "email", "both", "discord", "slack", "telegram"]);
export const roleEnum = pgEnum("role", ["admin", "member"]);
export const conversationStatusEnum = pgEnum("conversation_status", ["active", "expired"]);
export const deliveryStatusEnum = pgEnum("delivery_status", ["delivered", "queued", "pending", "failed"]);
export const directionEnum = pgEnum("direction", ["inbound", "outbound"]);
export const disambiguationStepEnum = pgEnum("disambiguation_step", ["workspace", "recipient"]);
export const disambiguationStatusEnum = pgEnum("disambiguation_status", ["pending", "resolved", "expired"]);
export const scheduledMessageStatusEnum = pgEnum("scheduled_message_status", ["pending", "sent", "canceled"]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 255 }).unique(),
  phone: varchar("phone", { length: 20 }).unique(),
  discordId: varchar("discord_id", { length: 50 }).unique(),
  slackId: varchar("slack_id", { length: 50 }).unique(),
  telegramChatId: varchar("telegram_chat_id", { length: 50 }).unique(),
  slackTeamId: varchar("slack_team_id", { length: 50 }),
  preferredChannel: channelEnum("preferred_channel").default("email"),
  notificationTimings: jsonb("notification_timings").$type<string[]>().default(["2_weeks", "1_week", "3_days", "2_days", "day_of"]),
  workingHoursEnabled: boolean("working_hours_enabled").default(true),
  workingHoursStart: time("working_hours_start").default("09:00"),
  workingHoursEnd: time("working_hours_end").default("17:00"),
  workingHoursTimezone: varchar("working_hours_timezone", { length: 50 }).default("America/New_York"),
  workingHoursDays: jsonb("working_hours_days").$type<number[]>().default([1, 2, 3, 4, 5]),
  notificationChannels: jsonb("notification_channels").$type<string[]>().default(["email"]),
  notificationsEnabled: boolean("notifications_enabled").default(true),
  onboarded: boolean("onboarded").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const workspaces = pgTable("workspaces", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  createdBy: uuid("created_by").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const workspaceMembers = pgTable("workspace_members", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").references(() => workspaces.id).notNull(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  role: roleEnum("role").default("member").notNull(),
  addedAt: timestamp("added_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("workspace_user_unique").on(table.workspaceId, table.userId),
]);

export const magicLinks = pgTable("magic_links", {
  id: uuid("id").defaultRandom().primaryKey(),
  token: varchar("token", { length: 255 }).unique().notNull(),
  userId: uuid("user_id").references(() => users.id),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 20 }),
  workspaceId: uuid("workspace_id").references(() => workspaces.id),
  used: boolean("used").default(false).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const conversations = pgTable("conversations", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").references(() => workspaces.id).notNull(),
  senderId: uuid("sender_id").references(() => users.id).notNull(),
  recipientId: uuid("recipient_id").references(() => users.id),
  status: conversationStatusEnum("status").default("active").notNull(),
  lastActivityAt: timestamp("last_activity_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const messages = pgTable("messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  conversationId: uuid("conversation_id").references(() => conversations.id).notNull(),
  senderId: uuid("sender_id").references(() => users.id).notNull(),
  body: text("body").notNull(),
  direction: directionEnum("direction").notNull(),
  channel: channelEnum("channel").notNull(),
  deliveryStatus: deliveryStatusEnum("delivery_status").default("pending").notNull(),
  deliverAt: timestamp("deliver_at"),
  deliveredAt: timestamp("delivered_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const tasks = pgTable("tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").references(() => workspaces.id).notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  dueDate: date("due_date").notNull(),
  assigneeId: uuid("assignee_id").references(() => users.id).notNull(),
  status: varchar("status", { length: 10 }).default("open").notNull(),
  completedAt: timestamp("completed_at"),
  createdBy: uuid("created_by").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const taskNotifications = pgTable("task_notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  taskId: uuid("task_id").references(() => tasks.id).notNull(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  timing: varchar("timing", { length: 20 }).notNull(),
  scheduledFor: timestamp("scheduled_for").notNull(),
  sent: boolean("sent").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const disambiguationSessions = pgTable("disambiguation_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  senderId: uuid("sender_id").references(() => users.id).notNull(),
  originalMessage: text("original_message").notNull(),
  step: disambiguationStepEnum("step").notNull(),
  options: jsonb("options").$type<{ value: string; label: string }[]>().notNull(),
  resolvedWorkspaceId: uuid("resolved_workspace_id").references(() => workspaces.id),
  resolvedRecipientId: uuid("resolved_recipient_id").references(() => users.id),
  status: disambiguationStatusEnum("status").default("pending").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const workspaceContactOverrides = pgTable("workspace_contact_overrides", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").references(() => workspaces.id).notNull(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 20 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("workspace_contact_unique").on(table.workspaceId, table.userId),
]);

export const slackInstallations = pgTable("slack_installations", {
  id: uuid("id").defaultRandom().primaryKey(),
  teamId: varchar("team_id", { length: 50 }).unique().notNull(),
  teamName: varchar("team_name", { length: 255 }),
  botToken: varchar("bot_token", { length: 255 }).notNull(),
  installedBy: uuid("installed_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  token: varchar("token", { length: 255 }).unique().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const workspaceInvites = pgTable("workspace_invites", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").references(() => workspaces.id).notNull(),
  token: varchar("token", { length: 64 }).unique().notNull(),
  createdBy: uuid("created_by").references(() => users.id).notNull(),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const chatReadReceipts = pgTable("chat_read_receipts", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  workspaceId: uuid("workspace_id").references(() => workspaces.id).notNull(),
  contactId: uuid("contact_id").references(() => users.id).notNull(),
  lastReadAt: timestamp("last_read_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("chat_read_unique").on(table.userId, table.workspaceId, table.contactId),
]);

export const dailyMeetingCounts = pgTable("daily_meeting_counts", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  date: date("date").notNull(),
  count: integer("count").default(0).notNull(),
  source: varchar("source", { length: 32 }).default("manual").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("daily_meeting_user_date_unique").on(table.userId, table.date),
]);

export const googleCalendarConnections = pgTable("google_calendar_connections", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull().unique(),
  googleEmail: varchar("google_email", { length: 255 }),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  tokenExpiresAt: timestamp("token_expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const oauthStates = pgTable("oauth_states", {
  id: uuid("id").defaultRandom().primaryKey(),
  state: varchar("state", { length: 128 }).unique().notNull(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  provider: varchar("provider", { length: 32 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const weatherOverrides = pgTable("weather_overrides", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  date: date("date").notNull(),
  code: varchar("code", { length: 32 }).notNull(),
  label: varchar("label", { length: 64 }).notNull(),
  emoji: varchar("emoji", { length: 16 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("weather_override_user_date_unique").on(table.userId, table.date),
]);

export const scheduledMessages = pgTable("scheduled_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").references(() => workspaces.id).notNull(),
  senderId: uuid("sender_id").references(() => users.id).notNull(),
  recipientId: uuid("recipient_id").references(() => users.id).notNull(),
  body: text("body").notNull(),
  condition: varchar("condition", { length: 32 }).notNull(),
  status: scheduledMessageStatusEnum("status").default("pending").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  sentAt: timestamp("sent_at"),
});
