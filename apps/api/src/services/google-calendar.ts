import { db, googleCalendarConnections } from "@guac/db";
import { eq } from "drizzle-orm";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "";
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI ?? "";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

export function isGoogleConfigured(): boolean {
  return Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_REDIRECT_URI);
}

export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent", // force refresh_token even on re-consent
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
};

export async function exchangeCode(code: string): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
    }).toString(),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google token exchange failed: ${err}`);
  }
  return res.json() as Promise<TokenResponse>;
}

export async function refreshToken(refreshTokenValue: string): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshTokenValue,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      grant_type: "refresh_token",
    }).toString(),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google token refresh failed: ${err}`);
  }
  return res.json() as Promise<TokenResponse>;
}

export async function fetchUserEmail(accessToken: string): Promise<string | null> {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json() as { email?: string };
  return data.email ?? null;
}

// Returns a valid access token, refreshing if expired. Updates DB if refreshed.
async function getValidAccessToken(userId: string): Promise<string | null> {
  const [conn] = await db.select().from(googleCalendarConnections).where(eq(googleCalendarConnections.userId, userId));
  if (!conn) return null;

  // If token expires in less than 60 seconds, refresh it
  const now = Date.now();
  const expiresAt = new Date(conn.tokenExpiresAt).getTime();
  if (expiresAt - now > 60_000) {
    return conn.accessToken;
  }

  try {
    const refreshed = await refreshToken(conn.refreshToken);
    const newExpiresAt = new Date(now + refreshed.expires_in * 1000);
    await db.update(googleCalendarConnections)
      .set({
        accessToken: refreshed.access_token,
        tokenExpiresAt: newExpiresAt,
        updatedAt: new Date(),
      })
      .where(eq(googleCalendarConnections.id, conn.id));
    return refreshed.access_token;
  } catch (err) {
    console.error("[google] token refresh failed for user", userId, err);
    return null;
  }
}

type CalendarEvent = {
  id: string;
  status?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: { self?: boolean; responseStatus?: string }[];
};

// Counts non-declined, non-all-day events for "today" in user's timezone.
export async function getTodayEventCount(userId: string, timezone: string): Promise<number | null> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) return null;

  // Compute today's start/end in user's timezone, expressed as UTC ISO strings
  const tzNow = new Date();
  const dateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(tzNow);

  // Build timeMin/timeMax as start-of-day and end-of-day in the user's timezone
  // We use Intl to build a date string, then parse back with the timezone offset
  const startLocal = `${dateStr}T00:00:00`;
  const endLocal = `${dateStr}T23:59:59`;
  const timeMin = zonedToUtcIso(startLocal, timezone);
  const timeMax = zonedToUtcIso(endLocal, timezone);

  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "100",
  });

  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const err = await res.text();
    console.error("[google] calendar fetch failed", res.status, err);
    return null;
  }
  const data = await res.json() as { items?: CalendarEvent[] };
  const items = data.items ?? [];

  const count = items.filter((ev) => {
    if (ev.status === "cancelled") return false;
    // Skip all-day events (treated as "blocks", not meetings)
    if (ev.start?.date && !ev.start?.dateTime) return false;
    // Skip declined-by-self events
    const self = ev.attendees?.find((a) => a.self);
    if (self?.responseStatus === "declined") return false;
    return true;
  }).length;

  return count;
}

// Convert a "YYYY-MM-DDTHH:mm:ss" string interpreted in `timezone` to a UTC ISO string.
function zonedToUtcIso(localDateTime: string, timezone: string): string {
  // We don't have date-fns-tz; build the UTC equivalent by computing the timezone offset for that wall time.
  // Strategy: format `Date.now()` in the target tz to derive offset, then apply.
  const asUtcDate = new Date(`${localDateTime}Z`); // pretend it's UTC to get a baseline
  const tzFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = tzFormatter.formatToParts(asUtcDate);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  const tzWallTime = `${get("year")}-${get("month")}-${get("day")}T${get("hour") === "24" ? "00" : get("hour")}:${get("minute")}:${get("second")}Z`;
  const drift = new Date(tzWallTime).getTime() - asUtcDate.getTime();
  // The local wall time interpreted in tz produced asUtcDate +/- drift; correct by subtracting drift
  return new Date(asUtcDate.getTime() - drift).toISOString();
}
