import { Hono } from "hono";
import { db, pushSubscriptions, users } from "@guac/db";
import { eq, and } from "drizzle-orm";

const push = new Hono();

// Save a push subscription for the authenticated user
push.post("/subscribe", async (c) => {
  const userId = c.get("userId" as never) as string | undefined;
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const { endpoint, keys } = await c.req.json<{
    endpoint: string;
    keys: { p256dh: string; auth: string };
  }>();

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return c.json({ error: "Missing subscription data" }, 400);
  }

  // Upsert: delete existing subscription with same endpoint, then insert
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
  await db.insert(pushSubscriptions).values({
    userId,
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
  });

  return c.json({ ok: true });
});

// Remove a push subscription
push.post("/unsubscribe", async (c) => {
  const userId = c.get("userId" as never) as string | undefined;
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const { endpoint } = await c.req.json<{ endpoint: string }>();
  if (!endpoint) return c.json({ error: "Missing endpoint" }, 400);

  await db.delete(pushSubscriptions).where(
    and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint))
  );

  return c.json({ ok: true });
});

// Check if the user has any push subscriptions
push.get("/status", async (c) => {
  const userId = c.get("userId" as never) as string | undefined;
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const subs = await db.select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));

  return c.json({ subscribed: subs.length > 0 });
});

export default push;
