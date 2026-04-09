import { Hono } from "hono";
import { requireAuth } from "../middleware/auth";
import { db, messages, conversations, users, workspaces, workspaceMembers } from "@guac/db";
import { eq, or, desc, and } from "drizzle-orm";
import { routeMessage } from "../services/routing";

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

// Send a message from the web chat
messagesRouter.post("/send", requireAuth, async (c) => {
  const userId = c.get("userId");
  const { workspaceId, recipientId, body } = await c.req.json();

  if (!workspaceId || !recipientId || !body?.trim()) {
    return c.json({ error: "workspaceId, recipientId, and body are required" }, 400);
  }

  // Verify sender is a member of this workspace
  const [membership] = await db.select().from(workspaceMembers).where(
    and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId))
  );
  if (!membership) return c.json({ error: "Not a member of this workspace" }, 403);

  // Verify recipient is a member
  const [recipientMembership] = await db.select().from(workspaceMembers).where(
    and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, recipientId))
  );
  if (!recipientMembership) return c.json({ error: "Recipient not in workspace" }, 400);

  const [sender] = await db.select().from(users).where(eq(users.id, userId));
  if (!sender) return c.json({ error: "Sender not found" }, 404);

  await routeMessage(sender, workspaceId, recipientId, body.trim(), "email", sender.email ?? "");

  return c.json({ success: true });
});

// Get conversation history between two users in a workspace
messagesRouter.get("/conversation/:workspaceId/:recipientId", requireAuth, async (c) => {
  const userId = c.get("userId");
  const workspaceId = c.req.param("workspaceId");
  const recipientId = c.req.param("recipientId");

  const convos = await db.select()
    .from(conversations)
    .where(
      or(
        and(eq(conversations.workspaceId, workspaceId), eq(conversations.senderId, userId), eq(conversations.recipientId, recipientId)),
        and(eq(conversations.workspaceId, workspaceId), eq(conversations.senderId, recipientId), eq(conversations.recipientId, userId)),
      )
    )
    .orderBy(desc(conversations.lastActivityAt));

  const allMessages = [];
  for (const convo of convos) {
    const msgs = await db.select()
      .from(messages)
      .where(eq(messages.conversationId, convo.id))
      .orderBy(messages.createdAt);
    allMessages.push(...msgs.map((m) => ({
      id: m.id,
      senderId: m.senderId,
      body: m.body,
      direction: m.direction,
      channel: m.channel,
      deliveryStatus: m.deliveryStatus,
      createdAt: m.createdAt,
    })));
  }

  // Sort by createdAt
  allMessages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return c.json({ messages: allMessages });
});

export default messagesRouter;
