import { Hono } from "hono";
import { requireAuth } from "../middleware/auth";
import { db, messages, conversations, users, workspaces } from "@guac/db";
import { eq, or, desc } from "drizzle-orm";

const messagesRouter = new Hono();

messagesRouter.get("/recent", requireAuth, async (c) => {
  const userId = c.get("userId");

  const userConversations = await db.select()
    .from(conversations)
    .where(or(eq(conversations.senderId, userId), eq(conversations.recipientId, userId)))
    .orderBy(desc(conversations.lastActivityAt))
    .limit(20);

  const result = await Promise.all(
    userConversations.map(async (convo) => {
      const recentMessages = await db.select()
        .from(messages)
        .where(eq(messages.conversationId, convo.id))
        .orderBy(desc(messages.createdAt))
        .limit(1);

      const [sender] = await db.select().from(users).where(eq(users.id, convo.senderId));
      const recipient = convo.recipientId
        ? (await db.select().from(users).where(eq(users.id, convo.recipientId)))[0]
        : null;
      const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, convo.workspaceId));

      return {
        conversationId: convo.id,
        workspace: workspace?.name ?? "Unknown",
        sender: sender?.name ?? "Unknown",
        recipient: recipient?.name ?? "All members",
        lastMessage: recentMessages[0]?.body ?? "",
        deliveryStatus: recentMessages[0]?.deliveryStatus ?? "pending",
        timestamp: convo.lastActivityAt,
      };
    })
  );

  return c.json({ activity: result });
});

export default messagesRouter;
