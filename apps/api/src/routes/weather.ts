import { Hono } from "hono";
import { requireAuth } from "../middleware/auth";
import { db, dailyMeetingCounts, googleCalendarConnections, workspaceMembers, users } from "@guac/db";
import { eq, and, inArray, gte, lte } from "drizzle-orm";
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

// Returns the Mon–Fri dates (YYYY-MM-DD) of the work week containing `today`.
// Treats Monday as start-of-week. If today is Sat/Sun, returns the upcoming Mon–Fri.
function workWeekDates(today: string): string[] {
  const [y, m, d] = today.split("-").map(Number);
  // Construct as UTC noon to avoid DST/timezone wobble during arithmetic
  const base = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dow = base.getUTCDay(); // 0=Sun..6=Sat
  // Distance to Monday: if Mon..Fri => negative or zero offset back to Mon; if Sat/Sun => forward to next Mon
  let mondayOffset: number;
  if (dow === 0) mondayOffset = 1;        // Sun -> next Mon (+1)
  else if (dow === 6) mondayOffset = 2;   // Sat -> next Mon (+2)
  else mondayOffset = 1 - dow;            // Mon..Fri -> back to Mon (0..-4)
  const monday = new Date(base);
  monday.setUTCDate(base.getUTCDate() + mondayOffset);
  const out: string[] = [];
  for (let i = 0; i < 5; i++) {
    const d2 = new Date(monday);
    d2.setUTCDate(monday.getUTCDate() + i);
    const yy = d2.getUTCFullYear();
    const mm = String(d2.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d2.getUTCDate()).padStart(2, "0");
    out.push(`${yy}-${mm}-${dd}`);
  }
  return out;
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

// GET /api/weather/week — returns this work week (Mon–Fri) for the current user.
// Days with no row return count: 0, source: "none". Uses stored data only (no Google sync) for speed.
weather.get("/week", requireAuth, async (c) => {
  const user = c.get("user");
  const tz = user.workingHoursTimezone ?? "America/New_York";
  const today = todayInTimezone(tz);
  const days = workWeekDates(today);

  const rows = await db.select()
    .from(dailyMeetingCounts)
    .where(and(
      eq(dailyMeetingCounts.userId, user.id),
      gte(dailyMeetingCounts.date, days[0]!),
      lte(dailyMeetingCounts.date, days[4]!),
    ));
  const byDate = new Map(rows.map((r) => [r.date, r]));

  const week = days.map((date) => {
    const row = byDate.get(date);
    const count = row?.count ?? 0;
    const source = row?.source ?? "none";
    return {
      date,
      isToday: date === today,
      count,
      source,
      weather: weatherFromCount(count),
      hasData: Boolean(row),
    };
  });

  return c.json({ week, today });
});

// GET /api/weather/team — returns teammates across all your workspaces with their today + week.
// For unconnected users with no manual data, returns connected: false and null counts.
weather.get("/team", requireAuth, async (c) => {
  const user = c.get("user");
  const tz = user.workingHoursTimezone ?? "America/New_York";
  const today = todayInTimezone(tz);
  const days = workWeekDates(today);

  // Find all workspace IDs this user belongs to
  const myMemberships = await db.select({ workspaceId: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, user.id));
  const workspaceIds = myMemberships.map((m) => m.workspaceId);
  if (workspaceIds.length === 0) {
    return c.json({ teammates: [] });
  }

  // All members across those workspaces (de-duped, excluding self)
  const allMembers = await db.select({
    userId: workspaceMembers.userId,
    name: users.name,
    email: users.email,
  })
    .from(workspaceMembers)
    .innerJoin(users, eq(workspaceMembers.userId, users.id))
    .where(inArray(workspaceMembers.workspaceId, workspaceIds));

  const teammateIds = Array.from(new Set(
    allMembers.filter((m) => m.userId !== user.id).map((m) => m.userId)
  ));
  if (teammateIds.length === 0) {
    return c.json({ teammates: [] });
  }

  // Single query: who's connected to Google Calendar?
  const connections = await db.select({ userId: googleCalendarConnections.userId })
    .from(googleCalendarConnections)
    .where(inArray(googleCalendarConnections.userId, teammateIds));
  const connectedSet = new Set(connections.map((c) => c.userId));

  // Single query: all daily counts for these teammates this work week
  const allCounts = await db.select()
    .from(dailyMeetingCounts)
    .where(and(
      inArray(dailyMeetingCounts.userId, teammateIds),
      gte(dailyMeetingCounts.date, days[0]!),
      lte(dailyMeetingCounts.date, days[4]!),
    ));
  const countsByUser = new Map<string, Map<string, typeof allCounts[number]>>();
  for (const row of allCounts) {
    if (!countsByUser.has(row.userId)) countsByUser.set(row.userId, new Map());
    countsByUser.get(row.userId)!.set(row.date, row);
  }

  // Build response (unique by user id; pick first occurrence for display name)
  const seen = new Set<string>();
  const teammates: Array<{
    userId: string;
    name: string | null;
    email: string | null;
    connected: boolean;
    today: { count: number; weather: ReturnType<typeof weatherFromCount> } | null;
    week: Array<{ date: string; isToday: boolean; count: number; weather: ReturnType<typeof weatherFromCount>; hasData: boolean }>;
  }> = [];

  for (const m of allMembers) {
    if (m.userId === user.id || seen.has(m.userId)) continue;
    seen.add(m.userId);

    const userCounts = countsByUser.get(m.userId) ?? new Map();
    const todayRow = userCounts.get(today);
    const connected = connectedSet.has(m.userId);

    const week = days.map((date) => {
      const row = userCounts.get(date);
      const count = row?.count ?? 0;
      return {
        date,
        isToday: date === today,
        count,
        weather: weatherFromCount(count),
        hasData: Boolean(row),
      };
    });

    teammates.push({
      userId: m.userId,
      name: m.name,
      email: m.email,
      connected,
      today: todayRow
        ? { count: todayRow.count, weather: weatherFromCount(todayRow.count) }
        : null,
      week,
    });
  }

  // Sort: connected first, then by name
  teammates.sort((a, b) => {
    if (a.connected !== b.connected) return a.connected ? -1 : 1;
    return (a.name ?? a.email ?? "").localeCompare(b.name ?? b.email ?? "");
  });

  return c.json({ teammates });
});

export default weather;
