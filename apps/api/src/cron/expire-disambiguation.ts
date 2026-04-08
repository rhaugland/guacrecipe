import { db, disambiguationSessions, users } from "@guac/db";
import { eq, and, lt } from "drizzle-orm";
import { sendSms, sendEmail } from "../services/delivery";

export async function expireDisambiguationSessions() {
  const now = new Date();
  const expired = await db.select()
    .from(disambiguationSessions)
    .where(and(eq(disambiguationSessions.status, "pending"), lt(disambiguationSessions.expiresAt, now)));

  for (const session of expired) {
    await db.update(disambiguationSessions)
      .set({ status: "expired" })
      .where(eq(disambiguationSessions.id, session.id));

    const [sender] = await db.select().from(users).where(eq(users.id, session.senderId));
    if (!sender) continue;

    const msg = "Message expired. Send again when ready.";
    if (sender.phone) await sendSms(sender.phone, msg);
    else if (sender.email) await sendEmail(sender.email, "Guac — Message expired", msg);
  }
}
