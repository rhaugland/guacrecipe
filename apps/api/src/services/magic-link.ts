import { randomBytes } from "crypto";
import { db, magicLinks, users, sessions, workspaceMembers } from "@guac/db";
import { eq, and, or } from "drizzle-orm";

const MAGIC_LINK_EXPIRY_DAYS = 5;
const SESSION_EXPIRY_DAYS = 30;

export async function createMagicLink(input: { email?: string; phone?: string; userId?: string; workspaceId?: string }) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + MAGIC_LINK_EXPIRY_DAYS);

  const [link] = await db.insert(magicLinks).values({
    token,
    email: input.email ?? null,
    phone: input.phone ?? null,
    userId: input.userId ?? null,
    workspaceId: input.workspaceId ?? null,
    expiresAt,
  }).returning();

  return link;
}

export async function verifyMagicLink(token: string) {
  const [link] = await db.select().from(magicLinks).where(
    and(eq(magicLinks.token, token), eq(magicLinks.used, false))
  );

  if (!link) return null;
  if (new Date() > link.expiresAt) return null;

  await db.update(magicLinks).set({ used: true }).where(eq(magicLinks.id, link.id));

  let userId = link.userId;
  let isNewUser = !link.userId;

  if (!userId) {
    // Check if a placeholder user was created when an admin added this email/phone to a workspace
    let existingUser;
    if (link.email) {
      const [found] = await db.select().from(users).where(eq(users.email, link.email));
      existingUser = found;
    }
    if (!existingUser && link.phone) {
      const [found] = await db.select().from(users).where(eq(users.phone, link.phone));
      existingUser = found;
    }

    if (existingUser) {
      userId = existingUser.id;
      isNewUser = !existingUser.onboarded;
      // Update contact info — if they signed up with email but were added by phone (or vice versa)
      const updates: Record<string, string> = {};
      if (link.email && !existingUser.email) updates.email = link.email;
      if (link.phone && !existingUser.phone) updates.phone = link.phone;
      if (Object.keys(updates).length > 0) {
        await db.update(users).set(updates).where(eq(users.id, existingUser.id));
      }
    } else {
      const [newUser] = await db.insert(users).values({
        email: link.email,
        phone: link.phone,
      }).returning();
      userId = newUser.id;
    }
  }

  const sessionToken = randomBytes(32).toString("hex");
  const sessionExpiry = new Date();
  sessionExpiry.setDate(sessionExpiry.getDate() + SESSION_EXPIRY_DAYS);

  await db.insert(sessions).values({
    userId,
    token: sessionToken,
    expiresAt: sessionExpiry,
  });

  return { userId, sessionToken, isNewUser };
}
