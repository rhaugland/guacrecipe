import { db, messages, conversations, users, workspaces } from "@guac/db";
import { eq, and, lte } from "drizzle-orm";
import { deliver } from "../services/delivery";
import { isWithinWorkingHours } from "../services/working-hours";

export async function deliverQueuedMessages() {
  const now = new Date();
  const queuedMessages = await db.select()
    .from(messages)
    .where(and(eq(messages.deliveryStatus, "queued"), lte(messages.deliverAt, now)));

  for (const msg of queuedMessages) {
    const [convo] = await db.select().from(conversations).where(eq(conversations.id, msg.conversationId));
    if (!convo || !convo.recipientId) continue;

    const [recipient] = await db.select().from(users).where(eq(users.id, convo.recipientId));
    const [sender] = await db.select().from(users).where(eq(users.id, msg.senderId));
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, convo.workspaceId));
    if (!recipient || !sender || !workspace) continue;

    if (!recipient.notificationsEnabled) continue;

    const config = {
      workingHoursEnabled: recipient.workingHoursEnabled ?? true,
      workingHoursStart: recipient.workingHoursStart ?? "09:00",
      workingHoursEnd: recipient.workingHoursEnd ?? "17:00",
      workingHoursTimezone: recipient.workingHoursTimezone ?? "America/New_York",
      workingHoursDays: (recipient.workingHoursDays as number[]) ?? [1, 2, 3, 4, 5],
    };

    if (!isWithinWorkingHours(config, now)) continue;

    const success = await deliver({
      channel: recipient.preferredChannel ?? "email",
      toEmail: recipient.email ?? undefined,
      toPhone: recipient.phone ?? undefined,
      toDiscordId: recipient.discordId ?? undefined,
      toSlackId: recipient.slackId ?? undefined,
      toTelegramChatId: recipient.telegramChatId ?? undefined,
      recipientId: recipient.id,
      senderName: sender.name ?? "Someone",
      workspaceName: workspace.name,
      body: msg.body,
      conversationId: convo.id,
    });

    await db.update(messages).set({
      deliveryStatus: success ? "delivered" : "failed",
      deliveredAt: success ? new Date() : null,
    }).where(eq(messages.id, msg.id));
  }
}
