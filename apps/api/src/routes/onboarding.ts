import { Hono } from "hono";
import { requireAuth } from "../middleware/auth";
import { db, users, workspaceMembers } from "@guac/db";
import { eq, and } from "drizzle-orm";

const onboarding = new Hono();

onboarding.post("/", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();

  const { name, email, phone, discordId, slackId, preferredChannel, notificationChannels, notificationTimings, workingHoursEnabled, workingHoursStart, workingHoursEnd, workingHoursTimezone, workingHoursDays } = body;

  if (!name || !preferredChannel) {
    return c.json({ error: "Name and preferred channel are required" }, 400);
  }

  if (!email) {
    return c.json({ error: "Email is required" }, 400);
  }

  // Merge any placeholder accounts that were added to workspaces by the other contact method
  if (email) {
    const [placeholder] = await db.select().from(users).where(
      and(eq(users.email, email))
    );
    if (placeholder && placeholder.id !== userId) {
      // Move their workspace memberships to the real user
      const memberships = await db.select().from(workspaceMembers).where(eq(workspaceMembers.userId, placeholder.id));
      for (const m of memberships) {
        const [existing] = await db.select().from(workspaceMembers).where(
          and(eq(workspaceMembers.workspaceId, m.workspaceId), eq(workspaceMembers.userId, userId))
        );
        if (!existing) {
          await db.update(workspaceMembers).set({ userId }).where(eq(workspaceMembers.id, m.id));
        } else {
          await db.delete(workspaceMembers).where(eq(workspaceMembers.id, m.id));
        }
      }
      await db.delete(users).where(eq(users.id, placeholder.id));
    }
  }
  if (phone) {
    const [placeholder] = await db.select().from(users).where(
      and(eq(users.phone, phone))
    );
    if (placeholder && placeholder.id !== userId) {
      const memberships = await db.select().from(workspaceMembers).where(eq(workspaceMembers.userId, placeholder.id));
      for (const m of memberships) {
        const [existing] = await db.select().from(workspaceMembers).where(
          and(eq(workspaceMembers.workspaceId, m.workspaceId), eq(workspaceMembers.userId, userId))
        );
        if (!existing) {
          await db.update(workspaceMembers).set({ userId }).where(eq(workspaceMembers.id, m.id));
        } else {
          await db.delete(workspaceMembers).where(eq(workspaceMembers.id, m.id));
        }
      }
      await db.delete(users).where(eq(users.id, placeholder.id));
    }
  }

  const [updated] = await db.update(users).set({
    name,
    email: email ?? undefined,
    phone: phone ?? undefined,
    discordId: discordId ?? undefined,
    slackId: slackId ?? undefined,
    preferredChannel,
    notificationChannels: notificationChannels ?? [preferredChannel],
    notificationTimings: notificationTimings ?? [],
    workingHoursEnabled: workingHoursEnabled ?? true,
    workingHoursStart: workingHoursStart ?? "09:00",
    workingHoursEnd: workingHoursEnd ?? "17:00",
    workingHoursTimezone: workingHoursTimezone ?? "America/New_York",
    workingHoursDays: workingHoursDays ?? [1, 2, 3, 4, 5],
    onboarded: true,
    updatedAt: new Date(),
  }).where(eq(users.id, userId)).returning();

  return c.json({ user: updated });
});

export default onboarding;
