import { Hono } from "hono";
import { requireAuth } from "../middleware/auth";
import { db, users } from "@guac/db";
import { eq } from "drizzle-orm";

const preferences = new Hono();

preferences.get("/", requireAuth, async (c) => {
  const user = c.get("user");
  return c.json({
    preferredChannel: user.preferredChannel,
    notificationChannels: user.notificationChannels,
    notificationTimings: user.notificationTimings,
    notificationsEnabled: user.notificationsEnabled,
    workingHoursEnabled: user.workingHoursEnabled,
    workingHoursStart: user.workingHoursStart,
    workingHoursEnd: user.workingHoursEnd,
    workingHoursTimezone: user.workingHoursTimezone,
    workingHoursDays: user.workingHoursDays,
    discordId: user.discordId,
    slackId: user.slackId,
    slackTeamId: user.slackTeamId,
  });
});

preferences.patch("/", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();

  const allowedFields = [
    "preferredChannel", "notificationChannels", "notificationTimings", "notificationsEnabled",
    "workingHoursEnabled", "workingHoursStart", "workingHoursEnd",
    "workingHoursTimezone", "workingHoursDays", "discordId", "slackId",
  ] as const;

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }

  const [updated] = await db.update(users).set(updates).where(eq(users.id, userId)).returning();
  return c.json({ user: updated });
});

export default preferences;
