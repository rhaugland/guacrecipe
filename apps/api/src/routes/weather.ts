import { Hono } from "hono";
import { requireAuth } from "../middleware/auth";
import { db, dailyMeetingCounts, googleCalendarConnections } from "@guac/db";
import { eq, and } from "drizzle-orm";
import { getTodayEventCount } from "../services/google-calendar";

const weather = new Hono();

const SYNC_FRESHNESS_MS = 10 * 60 * 1000; // re-sync if last update older than 10 min

function todayInTimezone(timezone: string): string {
  // Returns YYYY-MM-DD in the user's timezone
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

function weatherFromCount(count: number): { code: string; emoji: string; label: string } {
  if (count <= 1) return { code: "sunny", emoji: "☀️", label: "Sunny skies" };
  if (count <= 3) return { code: "partly_cloudy", emoji: "⛅", label: "Partly cloudy" };
  if (count <= 5) return { code: "cloudy", emoji: "☁️", label: "Cloudy" };
  if (count <= 7) return { code: "rainy", emoji: "🌧️", label: "Rainy" };
  return { code: "thunderstorm", emoji: "⛈️", label: "Thunderstorm" };
}

weather.get("/", requireAuth, async (c) => {
  const user = c.get("user");
  const tz = user.workingHoursTimezone ?? "America/New_York";
  const today = todayInTimezone(tz);

  // Check if Google Calendar is connected
  const [conn] = await db.select({ id: googleCalendarConnections.id })
    .from(googleCalendarConnections)
    .where(eq(googleCalendarConnections.userId, user.id));
  const calendarConnected = Boolean(conn);

  let [row] = await db.select()
    .from(dailyMeetingCounts)
    .where(and(eq(dailyMeetingCounts.userId, user.id), eq(dailyMeetingCounts.date, today)));

  // Auto-sync from Google if connected and data is stale (or missing)
  if (calendarConnected) {
    const stale = !row || (Date.now() - new Date(row.updatedAt).getTime() > SYNC_FRESHNESS_MS);
    const userOverrode = row?.source === "manual";
    if (stale && !userOverrode) {
      try {
        const fetched = await getTodayEventCount(user.id, tz);
        if (fetched !== null) {
          if (row) {
            await db.update(dailyMeetingCounts)
              .set({ count: fetched, source: "google_calendar", updatedAt: new Date() })
              .where(eq(dailyMeetingCounts.id, row.id));
            row = { ...row, count: fetched, source: "google_calendar", updatedAt: new Date() };
          } else {
            const [inserted] = await db.insert(dailyMeetingCounts).values({
              userId: user.id,
              date: today,
              count: fetched,
              source: "google_calendar",
            }).returning();
            row = inserted;
          }
        }
      } catch (err) {
        console.error("[weather] background google sync failed", err);
      }
    }
  }

  const count = row?.count ?? 0;
  const source = row?.source ?? "manual";
  return c.json({
    date: today,
    count,
    source,
    weather: weatherFromCount(count),
    calendarConnected,
  });
});

weather.put("/count", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{ count: number }>();
  const count = Math.max(0, Math.min(99, Math.floor(Number(body.count) || 0)));

  const tz = user.workingHoursTimezone ?? "America/New_York";
  const today = todayInTimezone(tz);

  const [existing] = await db.select()
    .from(dailyMeetingCounts)
    .where(and(eq(dailyMeetingCounts.userId, user.id), eq(dailyMeetingCounts.date, today)));

  if (existing) {
    await db.update(dailyMeetingCounts)
      .set({ count, source: "manual", updatedAt: new Date() })
      .where(eq(dailyMeetingCounts.id, existing.id));
  } else {
    await db.insert(dailyMeetingCounts).values({
      userId: user.id,
      date: today,
      count,
      source: "manual",
    });
  }

  return c.json({
    date: today,
    count,
    source: "manual",
    weather: weatherFromCount(count),
  });
});

export default weather;
