import { db, conversations } from "@guac/db";
import { eq, and, lt } from "drizzle-orm";

export async function expireConversations() {
  const oneDayAgo = new Date();
  oneDayAgo.setHours(oneDayAgo.getHours() - 24);

  await db.update(conversations)
    .set({ status: "expired" })
    .where(and(eq(conversations.status, "active"), lt(conversations.lastActivityAt, oneDayAgo)));
}
