import { Hono } from "hono";
import { requireAuth } from "../middleware/auth";
import { db, dailyMeetingCounts, googleCalendarConnections, workspaceMembers, users, weatherOverrides } from "@guac/db";
import { eq, and, inArray, gte, lte } from "drizzle-orm";
import { getTodayEventCount } from "../services/google-calendar";
import { flushScheduledForRecipient } from "../services/scheduled-messages";

const weather = new Hono();

const SYNC_FRESHNESS_MS = 10 * 60 * 1000; // re-sync if last update older than 10 min

const OVERRIDE_PRESETS: Record<string, { code: string; label: string; emoji: string }> = {
  sunny:        { code: "sunny",        label: "Open",       emoji: "☀️" },
  cloudy:       { code: "cloudy",       label: "Heads-down", emoji: "☁️" },
  thunderstorm: { code: "thunderstorm", label: "Slammed",    emoji: "⛈️" },
  ooo:          { code: "ooo",          label: "OOO",        emoji: "🏖️" },
};

type ResolvedWeather = { weather: { code: string; emoji: string; label: string }; override: boolean };

async function resolveWeather(userId: string, date: string, count: number): Promise<ResolvedWeather> {
  const [override] = await db.select().from(weatherOverrides)
    .where(and(eq(weatherOverrides.userId, userId), eq(weatherOverrides.date, date)));
  if (override) {
    return {
      weather: { code: override.code, emoji: override.emoji, label: override.label },
      override: true,
    };
  }
  return { weather: weatherFromCount(count), override: false };
}

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
          // Newly-fetched count may have dropped recipient to sunny — flush any queued sends
          flushScheduledForRecipient(user.id).catch((err) => console.error("[scheduled] flush failed", err));
        }
      } catch (err) {
        console.error("[weather] background google sync failed", err);
      }
    }
  }

  const count = row?.count ?? 0;
  const source = row?.source ?? "manual";
  const resolved = await resolveWeather(user.id, today, count);
  return c.json({
    date: today,
    count,
    source,
    weather: resolved.weather,
    override: resolved.override,
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

  flushScheduledForRecipient(user.id).catch((err) => console.error("[scheduled] flush failed", err));
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

  const overrideRows = await db.select()
    .from(weatherOverrides)
    .where(and(
      eq(weatherOverrides.userId, user.id),
      inArray(weatherOverrides.date, days),
    ));
  const overrideByDate = new Map(overrideRows.map((o) => [o.date, o]));

  const week = days.map((date) => {
    const row = byDate.get(date);
    const count = row?.count ?? 0;
    const source = row?.source ?? "none";
    const override = overrideByDate.get(date);
    const weather = override
      ? { code: override.code, emoji: override.emoji, label: override.label }
      : weatherFromCount(count);
    return {
      date,
      isToday: date === today,
      count,
      source,
      weather,
      hasData: Boolean(row) || Boolean(override),
      override: Boolean(override),
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

  // Single query: all overrides for these teammates this work week
  const allOverrides = await db.select()
    .from(weatherOverrides)
    .where(and(
      inArray(weatherOverrides.userId, teammateIds),
      inArray(weatherOverrides.date, days),
    ));
  const overridesByUser = new Map<string, Map<string, typeof allOverrides[number]>>();
  for (const row of allOverrides) {
    if (!overridesByUser.has(row.userId)) overridesByUser.set(row.userId, new Map());
    overridesByUser.get(row.userId)!.set(row.date, row);
  }

  // Build response (unique by user id; pick first occurrence for display name)
  const seen = new Set<string>();
  const teammates: Array<{
    userId: string;
    name: string | null;
    email: string | null;
    connected: boolean;
    today: { count: number; weather: ReturnType<typeof weatherFromCount>; override: boolean } | null;
    week: Array<{ date: string; isToday: boolean; count: number; weather: ReturnType<typeof weatherFromCount>; hasData: boolean; override: boolean }>;
  }> = [];

  for (const m of allMembers) {
    if (m.userId === user.id || seen.has(m.userId)) continue;
    seen.add(m.userId);

    const userCounts = countsByUser.get(m.userId) ?? new Map();
    const userOverrides = overridesByUser.get(m.userId) ?? new Map();
    const todayRow = userCounts.get(today);
    const todayOverride = userOverrides.get(today);
    const connected = connectedSet.has(m.userId);

    const week = days.map((date) => {
      const row = userCounts.get(date);
      const override = userOverrides.get(date);
      const count = row?.count ?? 0;
      const weather = override
        ? { code: override.code, emoji: override.emoji, label: override.label }
        : weatherFromCount(count);
      return {
        date,
        isToday: date === today,
        count,
        weather,
        hasData: Boolean(row) || Boolean(override),
        override: Boolean(override),
      };
    });

    let todayPayload: { count: number; weather: ReturnType<typeof weatherFromCount>; override: boolean } | null = null;
    if (todayOverride) {
      todayPayload = {
        count: todayRow?.count ?? 0,
        weather: { code: todayOverride.code, emoji: todayOverride.emoji, label: todayOverride.label },
        override: true,
      };
    } else if (todayRow) {
      todayPayload = {
        count: todayRow.count,
        weather: weatherFromCount(todayRow.count),
        override: false,
      };
    }

    teammates.push({
      userId: m.userId,
      name: m.name,
      email: m.email,
      connected,
      today: todayPayload,
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

weather.put("/override", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{ code: string }>();
  const preset = OVERRIDE_PRESETS[body.code];
  if (!preset) return c.json({ error: "Invalid preset" }, 400);

  const tz = user.workingHoursTimezone ?? "America/New_York";
  const today = todayInTimezone(tz);

  const [existing] = await db.select().from(weatherOverrides)
    .where(and(eq(weatherOverrides.userId, user.id), eq(weatherOverrides.date, today)));

  if (existing) {
    await db.update(weatherOverrides)
      .set({ code: preset.code, label: preset.label, emoji: preset.emoji })
      .where(eq(weatherOverrides.id, existing.id));
  } else {
    await db.insert(weatherOverrides).values({
      userId: user.id, date: today,
      code: preset.code, label: preset.label, emoji: preset.emoji,
    });
  }

  flushScheduledForRecipient(user.id).catch((err) => console.error("[scheduled] flush failed", err));
  return c.json({ weather: { code: preset.code, emoji: preset.emoji, label: preset.label }, override: true });
});

weather.delete("/override", requireAuth, async (c) => {
  const user = c.get("user");
  const tz = user.workingHoursTimezone ?? "America/New_York";
  const today = todayInTimezone(tz);
  await db.delete(weatherOverrides)
    .where(and(eq(weatherOverrides.userId, user.id), eq(weatherOverrides.date, today)));
  flushScheduledForRecipient(user.id).catch((err) => console.error("[scheduled] flush failed", err));
  return c.json({ ok: true });
});

export default weather;
