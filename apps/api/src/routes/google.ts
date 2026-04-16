import { Hono } from "hono";
import { randomBytes } from "crypto";
import { db, googleCalendarConnections, oauthStates, sessions, users, dailyMeetingCounts } from "@guac/db";
import { eq, and, gt } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import {
  buildAuthUrl,
  exchangeCode,
  fetchUserEmail,
  getTodayEventCount,
  isGoogleConfigured,
} from "../services/google-calendar";
import { flushScheduledForRecipient } from "../services/scheduled-messages";

const google = new Hono();

const APP_URL = process.env.APP_URL ?? "https://guacwithme.com";
const STATE_TTL_MS = 10 * 60 * 1000; // 10 min

// GET /api/google/connect?token=<sessionToken>
// Initiated via window.location from the web app; we accept the bearer token in query
// because OAuth navigations can't carry Authorization headers.
google.get("/connect", async (c) => {
  if (!isGoogleConfigured()) {
    return c.text("Google Calendar is not configured on this server.", 500);
  }

  const token = c.req.query("token");
  if (!token) return c.text("Missing session token.", 401);

  const [session] = await db.select().from(sessions).where(
    and(eq(sessions.token, token), gt(sessions.expiresAt, new Date()))
  );
  if (!session) return c.text("Invalid or expired session.", 401);

  const state = randomBytes(32).toString("hex");
  await db.insert(oauthStates).values({
    state,
    userId: session.userId,
    provider: "google",
    expiresAt: new Date(Date.now() + STATE_TTL_MS),
  });

  const url = buildAuthUrl(state);
  return c.redirect(url);
});

// GET /api/google/callback?code=...&state=...
google.get("/callback", async (c) => {
  const error = c.req.query("error");
  if (error) {
    return c.redirect(`${APP_URL}/dashboard?google=error&reason=${encodeURIComponent(error)}`);
  }

  const code = c.req.query("code");
  const state = c.req.query("state");
  if (!code || !state) {
    return c.redirect(`${APP_URL}/dashboard?google=error&reason=missing_code`);
  }

  // Look up state
  const [stateRow] = await db.select().from(oauthStates).where(
    and(eq(oauthStates.state, state), gt(oauthStates.expiresAt, new Date()))
  );
  if (!stateRow) {
    return c.redirect(`${APP_URL}/dashboard?google=error&reason=invalid_state`);
  }

  // Single-use
  await db.delete(oauthStates).where(eq(oauthStates.id, stateRow.id));

  try {
    const tokens = await exchangeCode(code);
    if (!tokens.refresh_token) {
      // Without a refresh token we can't sustain the connection. Force re-consent.
      return c.redirect(`${APP_URL}/dashboard?google=error&reason=no_refresh_token`);
    }

    const email = await fetchUserEmail(tokens.access_token);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    // Upsert
    const [existing] = await db.select().from(googleCalendarConnections).where(eq(googleCalendarConnections.userId, stateRow.userId));
    if (existing) {
      await db.update(googleCalendarConnections)
        .set({
          googleEmail: email,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          tokenExpiresAt: expiresAt,
          updatedAt: new Date(),
        })
        .where(eq(googleCalendarConnections.id, existing.id));
    } else {
      await db.insert(googleCalendarConnections).values({
        userId: stateRow.userId,
        googleEmail: email,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt: expiresAt,
      });
    }

    // Sync today's count immediately so user sees fresh data on landing
    try {
      const [user] = await db.select().from(users).where(eq(users.id, stateRow.userId));
      const tz = user?.workingHoursTimezone ?? "America/New_York";
      const count = await getTodayEventCount(stateRow.userId, tz);
      if (count !== null) {
        const today = new Intl.DateTimeFormat("en-CA", {
          timeZone: tz,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date());

        const [existingCount] = await db.select().from(dailyMeetingCounts)
          .where(and(eq(dailyMeetingCounts.userId, stateRow.userId), eq(dailyMeetingCounts.date, today)));
        if (existingCount) {
          await db.update(dailyMeetingCounts)
            .set({ count, source: "google_calendar", updatedAt: new Date() })
            .where(eq(dailyMeetingCounts.id, existingCount.id));
        } else {
          await db.insert(dailyMeetingCounts).values({
            userId: stateRow.userId,
            date: today,
            count,
            source: "google_calendar",
          });
        }
        flushScheduledForRecipient(stateRow.userId).catch((err) => console.error("[scheduled] flush failed", err));
      }
    } catch (err) {
      console.error("[google] initial sync after connect failed", err);
      // Non-fatal — connection still saved, user can refresh later
    }

    return c.redirect(`${APP_URL}/dashboard?google=connected`);
  } catch (err) {
    console.error("[google] callback failed", err);
    return c.redirect(`${APP_URL}/dashboard?google=error&reason=exchange_failed`);
  }
});

// POST /api/google/disconnect
google.post("/disconnect", requireAuth, async (c) => {
  const userId = c.get("userId");
  await db.delete(googleCalendarConnections).where(eq(googleCalendarConnections.userId, userId));
  return c.json({ ok: true });
});

// GET /api/google/status
google.get("/status", requireAuth, async (c) => {
  const userId = c.get("userId");
  const [conn] = await db.select({ email: googleCalendarConnections.googleEmail })
    .from(googleCalendarConnections)
    .where(eq(googleCalendarConnections.userId, userId));
  return c.json({
    connected: Boolean(conn),
    email: conn?.email ?? null,
    configured: isGoogleConfigured(),
  });
});

// POST /api/google/sync — re-fetch today's count from calendar
google.post("/sync", requireAuth, async (c) => {
  const user = c.get("user");
  const tz = user.workingHoursTimezone ?? "America/New_York";
  const count = await getTodayEventCount(user.id, tz);
  if (count === null) {
    return c.json({ error: "Not connected or fetch failed" }, 400);
  }

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const [existing] = await db.select().from(dailyMeetingCounts)
    .where(and(eq(dailyMeetingCounts.userId, user.id), eq(dailyMeetingCounts.date, today)));
  if (existing) {
    await db.update(dailyMeetingCounts)
      .set({ count, source: "google_calendar", updatedAt: new Date() })
      .where(eq(dailyMeetingCounts.id, existing.id));
  } else {
    await db.insert(dailyMeetingCounts).values({
      userId: user.id,
      date: today,
      count,
      source: "google_calendar",
    });
  }

  flushScheduledForRecipient(user.id).catch((err) => console.error("[scheduled] flush failed", err));

  return c.json({ count, date: today, source: "google_calendar" });
});

export default google;
