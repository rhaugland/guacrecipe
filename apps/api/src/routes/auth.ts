import { Hono } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import { randomBytes } from "crypto";
import { createMagicLink, verifyMagicLink } from "../services/magic-link";
import { sendEmail, sendSms } from "../services/delivery";
import { requireAuth } from "../middleware/auth";
import { db, users, sessions } from "@guac/db";
import { eq } from "drizzle-orm";

const auth = new Hono();

auth.post("/magic-link", async (c) => {
  const { email, phone } = await c.req.json();
  if (!email && !phone) return c.json({ error: "Email or phone required" }, 400);

  // Check if this is a returning user
  let existingUser;
  if (email) {
    const [found] = await db.select().from(users).where(eq(users.email, email));
    existingUser = found;
  } else if (phone) {
    const [found] = await db.select().from(users).where(eq(users.phone, phone));
    existingUser = found;
  }

  // Returning onboarded user — log them in immediately
  if (existingUser?.onboarded) {
    const sessionToken = randomBytes(32).toString("hex");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await db.insert(sessions).values({
      userId: existingUser.id,
      token: sessionToken,
      expiresAt,
    });

    return c.json({ success: true, token: sessionToken, redirect: "/dashboard" });
  }

  // New user — send magic link
  const link = await createMagicLink({ email, phone, userId: existingUser?.id });
  const appUrl = process.env.APP_URL ?? "http://localhost:3002";
  const magicUrl = `${appUrl}/api/auth/verify?token=${link.token}`;

  if (email) {
    const sent = await sendEmail(
      email,
      "Your Guac login link 🥑",
      `Click the button below to sign in to Guac.\n\nThis link expires in 5 days.`,
      { ctaText: "Sign in to Guac", ctaUrl: magicUrl }
    );
    if (!sent) {
      console.error("[auth] Failed to send magic link email to", email);
      return c.json({ error: "Failed to send login link" }, 500);
    }
  } else if (phone) {
    const sent = await sendSms(
      phone,
      `Your Guac login link:\n${magicUrl}\n\nExpires in 5 days.`
    );
    if (!sent) {
      console.error("[auth] Failed to send magic link SMS to", phone);
      return c.json({ error: "Failed to send login link" }, 500);
    }
  }

  return c.json({ success: true });
});

auth.get("/check", async (c) => {
  const email = c.req.query("email");
  const phone = c.req.query("phone");
  if (!email && !phone) return c.json({ exists: false });

  let found;
  if (email) {
    const [user] = await db.select({ onboarded: users.onboarded }).from(users).where(eq(users.email, email));
    found = user;
  } else if (phone) {
    const [user] = await db.select({ onboarded: users.onboarded }).from(users).where(eq(users.phone, phone));
    found = user;
  }

  return c.json({ exists: !!found?.onboarded });
});

auth.get("/verify", async (c) => {
  const token = c.req.query("token");
  if (!token) return c.json({ error: "Token required" }, 400);

  const result = await verifyMagicLink(token);
  if (!result) return c.json({ error: "Invalid or expired link" }, 401);

  setCookie(c, "session", result.sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Lax",
    maxAge: 30 * 24 * 60 * 60,
    path: "/",
  });

  const appUrl = process.env.APP_URL ?? "http://localhost:3002";
  const redirectPath = result.isNewUser ? "/onboarding" : "/dashboard";
  return c.redirect(`${appUrl}${redirectPath}?token=${result.sessionToken}`);
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
