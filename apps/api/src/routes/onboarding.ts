import { Hono } from "hono";
import { requireAuth } from "../middleware/auth";
import { db, users } from "@guac/db";
import { eq } from "drizzle-orm";

const onboarding = new Hono();

onboarding.post("/", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();

  const { name, email, phone, preferredChannel, notificationTimings, workingHoursStart, workingHoursEnd, workingHoursTimezone, workingHoursDays } = body;

  if (!name || !preferredChannel) {
    return c.json({ error: "Name and preferred channel are required" }, 400);
  }

  if (!email && !phone) {
    return c.json({ error: "Both email and phone are required" }, 400);
  }

  const [updated] = await db.update(users).set({
    name,
    email: email ?? undefined,
    phone: phone ?? undefined,
    preferredChannel,
    notificationTimings: notificationTimings ?? ["2_weeks", "1_week", "3_days", "2_days", "day_of"],
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
