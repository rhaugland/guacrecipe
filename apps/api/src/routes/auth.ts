import { Hono } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import { createMagicLink, verifyMagicLink } from "../services/magic-link";
import { requireAuth } from "../middleware/auth";
import { db, users } from "@guac/db";
import { eq } from "drizzle-orm";

const auth = new Hono();

auth.post("/magic-link", async (c) => {
  const { email, phone } = await c.req.json();
  if (!email && !phone) return c.json({ error: "Email or phone required" }, 400);

  let userId: string | undefined;
  if (email) {
    const [existing] = await db.select().from(users).where(eq(users.email, email));
    if (existing) userId = existing.id;
  } else if (phone) {
    const [existing] = await db.select().from(users).where(eq(users.phone, phone));
    if (existing) userId = existing.id;
  }

  const link = await createMagicLink({ email, phone, userId });

  // TODO: Send via Resend (email) or Telnyx (SMS) — implemented in Task 6
  const magicUrl = `${process.env.APP_URL}/api/auth/verify?token=${link.token}`;

  return c.json({ success: true });
});

auth.get("/verify", async (c) => {
  const token = c.req.query("token");
  if (!token) return c.json({ error: "Token required" }, 400);

  const result = await verifyMagicLink(token);
  if (!result) return c.json({ error: "Invalid or expired link" }, 401);

  setCookie(c, "session", result.sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Strict",
    maxAge: 30 * 24 * 60 * 60,
    path: "/",
  });

  const redirectPath = result.isNewUser ? "/onboarding" : "/dashboard";
  return c.redirect(redirectPath);
});

auth.post("/logout", requireAuth, async (c) => {
  deleteCookie(c, "session");
  return c.json({ success: true });
});

auth.get("/session", requireAuth, async (c) => {
  const user = c.get("user");
  return c.json({ user });
});

export default auth;
