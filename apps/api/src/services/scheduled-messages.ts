import { db, scheduledMessages, dailyMeetingCounts, weatherOverrides, users } from "@guac/db";
import { eq, and } from "drizzle-orm";
import { dispatchMessage } from "../routes/messages";

export const SUNNY_CODES = new Set(["sunny", "partly_cloudy"]);

// Postgres "undefined_table" error code. Returned when the new MVP migrations
// haven't been applied yet — we degrade gracefully instead of 500-ing.
function isMissingTable(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "42P01";
}

function todayInTimezone(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function weatherFromCount(count: number): { code: string } {
  if (count <= 1) return { code: "sunny" };
  if (count <= 3) return { code: "partly_cloudy" };
  if (count <= 5) return { code: "cloudy" };
  if (count <= 7) return { code: "rainy" };
  return { code: "thunderstorm" };
}

/**
 * Returns the recipient's effective weather code for today, accounting for
 * any manual override.
 */
export async function effectiveCodeForUser(userId: string): Promise<string> {
  const [u] = await db.select({ tz: users.workingHoursTimezone }).from(users).where(eq(users.id, userId));
  const tz = u?.tz ?? "America/New_York";
  const date = todayInTimezone(tz);

  try {
    const [override] = await db.select().from(weatherOverrides)
      .where(and(eq(weatherOverrides.userId, userId), eq(weatherOverrides.date, date)));
    if (override) return override.code;
  } catch (err) {
    if (!isMissingTable(err)) throw err;
    // weather_overrides migration not applied — fall through to computed weather
  }

  const [count] = await db.select().from(dailyMeetingCounts)
    .where(and(eq(dailyMeetingCounts.userId, userId), eq(dailyMeetingCounts.date, date)));
  return weatherFromCount(count?.count ?? 0).code;
}

/**
 * If `recipientId`'s effective weather is sunny or partly cloudy, dispatch
 * all pending scheduled messages addressed to them. Failed dispatches stay
 * pending and will be retried on the next flush. Returns the number of
 * messages successfully dispatched.
 */
export async function flushScheduledForRecipient(recipientId: string): Promise<number> {
  const code = await effectiveCodeForUser(recipientId);
  if (!SUNNY_CODES.has(code)) return 0;

  let pending: typeof scheduledMessages.$inferSelect[];
  try {
    pending = await db.select().from(scheduledMessages)
      .where(and(
        eq(scheduledMessages.recipientId, recipientId),
        eq(scheduledMessages.status, "pending"),
      ));
  } catch (err) {
    if (isMissingTable(err)) return 0;
    throw err;
  }

  let dispatched = 0;
  for (const sm of pending) {
    try {
      await dispatchMessage({
        workspaceId: sm.workspaceId,
        senderId: sm.senderId,
        recipientId: sm.recipientId,
        body: sm.body,
      });
      await db.update(scheduledMessages)
        .set({ status: "sent", sentAt: new Date() })
        .where(eq(scheduledMessages.id, sm.id));
      dispatched++;
    } catch (err) {
      console.error("[scheduled] dispatch failed", { id: sm.id, err });
      // Leave pending; will retry next flush.
    }
  }
  return dispatched;
}
