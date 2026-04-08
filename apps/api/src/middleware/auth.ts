import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import { db, sessions, users } from "@guac/db";
import { eq, and, gt } from "drizzle-orm";

type AuthEnv = {
  Variables: {
    userId: string;
    user: typeof users.$inferSelect;
  };
};

export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const token = getCookie(c, "session");
  if (!token) return c.json({ error: "Unauthorized" }, 401);

  const [session] = await db.select().from(sessions).where(
    and(eq(sessions.token, token), gt(sessions.expiresAt, new Date()))
  );
  if (!session) return c.json({ error: "Unauthorized" }, 401);

  const [user] = await db.select().from(users).where(eq(users.id, session.userId));
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  c.set("userId", user.id);
  c.set("user", user);
  await next();
});
