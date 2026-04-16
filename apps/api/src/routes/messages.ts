import { Hono } from "hono";
import { requireAuth } from "../middleware/auth";
import { db, messages, conversations, users, workspaces, workspaceMembers, chatReadReceipts, scheduledMessages } from "@guac/db";
import { eq, or, desc, and, gt, ilike } from "drizzle-orm";
import { routeMessage } from "../services/routing";
import { flushScheduledForRecipient } from "../services/scheduled-messages";

const messagesRouter = new Hono();

// Postgres "undefined_table" error code. Returned when the scheduled_messages
// migration hasn't been applied yet — we degrade gracefully for read paths and
// surface a clear 503 for write paths.
function isMissingTable(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "42P01";
}

/**
 * Dispatch a message from sender to recipient inside a workspace.
 *
 * This is the shared path used by both the `POST /send` route and the
 * scheduled-message flush helper. It preserves every side effect of the
 * original handler:
 *  - Membership validation (sender and recipient must both belong to the workspace).
 *  - Sender lookup (sender record must exist).
 *  - Conversation upsert (continuity), `messages` row insert, working-hours
 *    queueing, push notifications, etc. — all handled inside `routeMessage`.
 *
 * Returns `{ success: true }` on dispatch. Throws on validation failure so
 * the caller can map errors back to HTTP responses or logging.
 */
export async function dispatchMessage(args: {
  workspaceId: string;
  senderId: string;
  recipientId: string;
  body: string;
}): Promise<{ success: true }> {
  const { workspaceId, senderId, recipientId, body } = args;

  if (!workspaceId || !recipientId || !body?.trim()) {
    throw new Error("workspaceId, recipientId, and body are required");
  }

  const [membership] = await db.select().from(workspaceMembers).where(
    and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, senderId))
  );
  if (!membership) throw new Error("Not a member of this workspace");

  const [recipientMembership] = await db.select().from(workspaceMembers).where(
    and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, recipientId))
  );
  if (!recipientMembership) throw new Error("Recipient not in workspace");

  const [sender] = await db.select().from(users).where(eq(users.id, senderId));
  if (!sender) throw new Error("Sender not found");

  await routeMessage(sender, workspaceId, recipientId, body.trim(), "email", sender.email ?? "");

  return { success: true };
}

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

  try {
    const result = await dispatchMessage({ workspaceId, senderId: userId, recipientId, body });
    return c.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to send";
    let status: 400 | 403 | 404 = 400;
    if (msg === "Not a member of this workspace") status = 403;
    else if (msg === "Sender not found") status = 404;
    return c.json({ error: msg }, status);
  }
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

// Broadcast a message to all members in a workspace
messagesRouter.post("/broadcast", requireAuth, async (c) => {
  const userId = c.get("userId");
  const { workspaceId, body } = await c.req.json();

  if (!workspaceId || !body?.trim()) {
    return c.json({ error: "workspaceId and body are required" }, 400);
  }

  const [membership] = await db.select().from(workspaceMembers).where(
    and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId))
  );
  if (!membership) return c.json({ error: "Not a member of this workspace" }, 403);

  const [sender] = await db.select().from(users).where(eq(users.id, userId));
  if (!sender) return c.json({ error: "Sender not found" }, 404);

  // Get all other members
  const members = await db.select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.workspaceId, workspaceId));

  const recipients = members.filter((m) => m.userId !== userId);
  if (recipients.length === 0) return c.json({ error: "No other members in workspace" }, 400);

  // Route to each member
  const results = await Promise.allSettled(
    recipients.map((r) => routeMessage(sender, workspaceId, r.userId, body.trim(), "email", sender.email ?? ""))
  );

  const sent = results.filter((r) => r.status === "fulfilled").length;
  return c.json({ success: true, sent, total: recipients.length });
});

// Get channel intelligence — avg response times per contact
messagesRouter.get("/intelligence/:workspaceId/:recipientId", requireAuth, async (c) => {
  const userId = c.get("userId");
  const workspaceId = c.req.param("workspaceId");
  const recipientId = c.req.param("recipientId");

  // Get all conversations between these two users in this workspace
  const convos = await db.select()
    .from(conversations)
    .where(
      or(
        and(eq(conversations.workspaceId, workspaceId), eq(conversations.senderId, userId), eq(conversations.recipientId, recipientId)),
        and(eq(conversations.workspaceId, workspaceId), eq(conversations.senderId, recipientId), eq(conversations.recipientId, userId)),
      )
    );

  if (convos.length === 0) return c.json({ intelligence: null });

  // Get all messages across these conversations
  const allMsgs: { id: string; senderId: string; channel: string; deliveryStatus: string; createdAt: Date; conversationId: string }[] = [];
  for (const convo of convos) {
    const msgs = await db.select().from(messages)
      .where(eq(messages.conversationId, convo.id))
      .orderBy(messages.createdAt);
    allMsgs.push(...msgs.map((m) => ({
      id: m.id,
      senderId: m.senderId,
      channel: m.channel,
      deliveryStatus: m.deliveryStatus,
      createdAt: m.createdAt,
      conversationId: m.conversationId,
    })));
  }

  allMsgs.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  // Calculate response times per channel
  // A "response" is when recipientId sends a message after userId sent one
  const channelStats: Record<string, { totalMs: number; count: number }> = {};
  let lastSentByUser: Date | null = null;
  let lastSentChannel: string | null = null;

  for (const msg of allMsgs) {
    if (msg.senderId === userId) {
      lastSentByUser = new Date(msg.createdAt);
      lastSentChannel = msg.channel;
    } else if (msg.senderId === recipientId && lastSentByUser) {
      const responseTime = new Date(msg.createdAt).getTime() - lastSentByUser.getTime();
      const ch = msg.channel;
      if (!channelStats[ch]) channelStats[ch] = { totalMs: 0, count: 0 };
      channelStats[ch].totalMs += responseTime;
      channelStats[ch].count += 1;
      lastSentByUser = null;
      lastSentChannel = null;
    }
  }

  const channels = Object.entries(channelStats).map(([channel, stats]) => ({
    channel,
    avgResponseMs: Math.round(stats.totalMs / stats.count),
    responseCount: stats.count,
  })).sort((a, b) => a.avgResponseMs - b.avgResponseMs);

  const totalMessages = allMsgs.length;
  const delivered = allMsgs.filter((m) => m.deliveryStatus === "delivered").length;

  // Find fastest channel
  const fastest = channels.length > 0 ? channels[0] : null;

  return c.json({
    intelligence: {
      channels,
      fastest: fastest ? {
        channel: fastest.channel,
        avgResponseMs: fastest.avgResponseMs,
        label: formatDuration(fastest.avgResponseMs),
      } : null,
      totalMessages,
      deliveryRate: totalMessages > 0 ? Math.round((delivered / totalMessages) * 100) : 0,
    },
  });
});

// Mark a conversation as read
messagesRouter.post("/read/:workspaceId/:contactId", requireAuth, async (c) => {
  const userId = c.get("userId");
  const workspaceId = c.req.param("workspaceId");
  const contactId = c.req.param("contactId");

  const [existing] = await db.select().from(chatReadReceipts).where(
    and(
      eq(chatReadReceipts.userId, userId),
      eq(chatReadReceipts.workspaceId, workspaceId),
      eq(chatReadReceipts.contactId, contactId)
    )
  );

  if (existing) {
    await db.update(chatReadReceipts).set({ lastReadAt: new Date() }).where(eq(chatReadReceipts.id, existing.id));
  } else {
    await db.insert(chatReadReceipts).values({ userId, workspaceId, contactId, lastReadAt: new Date() });
  }

  return c.json({ ok: true });
});

// Get unread counts for all contacts
messagesRouter.get("/unread", requireAuth, async (c) => {
  const userId = c.get("userId");

  // Get all conversations where this user is sender or recipient
  const allConvos = await db.select().from(conversations).where(
    or(eq(conversations.senderId, userId), eq(conversations.recipientId, userId))
  );

  // Get all read receipts for this user
  const receipts = await db.select().from(chatReadReceipts).where(eq(chatReadReceipts.userId, userId));
  const receiptMap = new Map(receipts.map((r) => [`${r.workspaceId}:${r.contactId}`, r.lastReadAt]));

  // Group conversations by workspace+contact
  const contactConvos: Record<string, { workspaceId: string; contactId: string; convoIds: string[] }> = {};
  for (const convo of allConvos) {
    const contactId = convo.senderId === userId ? convo.recipientId : convo.senderId;
    if (!contactId) continue;
    const key = `${convo.workspaceId}:${contactId}`;
    if (!contactConvos[key]) contactConvos[key] = { workspaceId: convo.workspaceId, contactId, convoIds: [] };
    contactConvos[key].convoIds.push(convo.id);
  }

  // Count unread messages per contact
  const unreadCounts: { workspaceId: string; contactId: string; count: number }[] = [];
  for (const [key, info] of Object.entries(contactConvos)) {
    const lastRead = receiptMap.get(key) ?? new Date(0);

    let count = 0;
    for (const convoId of info.convoIds) {
      const unread = await db.select({ id: messages.id }).from(messages).where(
        and(
          eq(messages.conversationId, convoId),
          eq(messages.senderId, info.contactId),
          gt(messages.createdAt, lastRead)
        )
      );
      count += unread.length;
    }

    if (count > 0) {
      unreadCounts.push({ workspaceId: info.workspaceId, contactId: info.contactId, count });
    }
  }

  return c.json({ unread: unreadCounts });
});

// Search messages across all user's conversations
messagesRouter.get("/search", requireAuth, async (c) => {
  const userId = c.get("userId");
  const query = c.req.query("q");
  if (!query || query.trim().length < 2) return c.json({ results: [] });

  const userConvos = await db.select({ id: conversations.id, workspaceId: conversations.workspaceId, senderId: conversations.senderId, recipientId: conversations.recipientId })
    .from(conversations)
    .where(or(eq(conversations.senderId, userId), eq(conversations.recipientId, userId)));

  if (userConvos.length === 0) return c.json({ results: [] });

  const results: {
    messageId: string;
    body: string;
    senderId: string;
    senderName: string;
    contactId: string;
    contactName: string;
    workspaceId: string;
    workspaceName: string;
    channel: string;
    createdAt: Date;
  }[] = [];

  // Search in batches to avoid huge queries
  for (const convo of userConvos) {
    const matches = await db.select().from(messages)
      .where(and(eq(messages.conversationId, convo.id), ilike(messages.body, `%${query}%`)))
      .orderBy(desc(messages.createdAt))
      .limit(5);

    if (matches.length > 0) {
      const contactId = convo.senderId === userId ? convo.recipientId : convo.senderId;
      if (!contactId) continue;

      const [contact] = await db.select().from(users).where(eq(users.id, contactId));
      const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, convo.workspaceId));

      for (const msg of matches) {
        const [sender] = await db.select().from(users).where(eq(users.id, msg.senderId));
        results.push({
          messageId: msg.id,
          body: msg.body,
          senderId: msg.senderId,
          senderName: sender?.name ?? "Unknown",
          contactId,
          contactName: contact?.name ?? "Unknown",
          workspaceId: convo.workspaceId,
          workspaceName: workspace?.name ?? "Unknown",
          channel: msg.channel,
          createdAt: msg.createdAt,
        });
      }
    }
  }

  results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return c.json({ results: results.slice(0, 20) });
});

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m`;
  return "<1m";
}

// Schedule a message to send when the recipient's weather clears.
messagesRouter.post("/schedule", requireAuth, async (c) => {
  const userId = c.get("userId");
  const { workspaceId, recipientId, body, condition } = await c.req.json();

  if (!workspaceId || !recipientId || !body?.trim()) {
    return c.json({ error: "workspaceId, recipientId, and body are required" }, 400);
  }
  const cond = typeof condition === "string" && condition.length > 0 ? condition : "recipient_sunny";

  // Validate sender is in the workspace
  const [membership] = await db.select().from(workspaceMembers).where(
    and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId))
  );
  if (!membership) return c.json({ error: "Not a member of this workspace" }, 403);

  // Validate recipient is in the workspace
  const [recipientMembership] = await db.select().from(workspaceMembers).where(
    and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, recipientId))
  );
  if (!recipientMembership) return c.json({ error: "Recipient not in workspace" }, 400);

  let inserted: typeof scheduledMessages.$inferSelect;
  try {
    const [row] = await db.insert(scheduledMessages).values({
      workspaceId,
      senderId: userId,
      recipientId,
      body: body.trim(),
      condition: cond,
    }).returning();
    inserted = row;
  } catch (err) {
    if (isMissingTable(err)) {
      return c.json({ error: "Scheduled messages not yet available — database migration pending." }, 503);
    }
    throw err;
  }

  // Look up recipient name/email for response shape
  const [recipient] = await db.select({ name: users.name, email: users.email })
    .from(users).where(eq(users.id, recipientId));

  // Fire-and-forget: recipient might already be sunny — try to dispatch immediately.
  flushScheduledForRecipient(recipientId).catch((err) => console.error("[scheduled] flush failed", err));

  return c.json({
    scheduled: {
      id: inserted.id,
      workspaceId: inserted.workspaceId,
      recipientId: inserted.recipientId,
      recipientName: recipient?.name ?? null,
      recipientEmail: recipient?.email ?? null,
      body: inserted.body,
      condition: inserted.condition,
      createdAt: inserted.createdAt,
    },
  });
});

// List the current user's pending scheduled messages.
messagesRouter.get("/scheduled", requireAuth, async (c) => {
  const userId = c.get("userId");

  try {
    const rows = await db.select({
      id: scheduledMessages.id,
      workspaceId: scheduledMessages.workspaceId,
      recipientId: scheduledMessages.recipientId,
      body: scheduledMessages.body,
      condition: scheduledMessages.condition,
      createdAt: scheduledMessages.createdAt,
      recipientName: users.name,
      recipientEmail: users.email,
    })
      .from(scheduledMessages)
      .innerJoin(users, eq(scheduledMessages.recipientId, users.id))
      .where(and(
        eq(scheduledMessages.senderId, userId),
        eq(scheduledMessages.status, "pending"),
      ))
      .orderBy(desc(scheduledMessages.createdAt));

    return c.json({ scheduled: rows });
  } catch (err) {
    if (isMissingTable(err)) return c.json({ scheduled: [] });
    throw err;
  }
});

// Cancel a pending scheduled message (sender-only).
messagesRouter.delete("/scheduled/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");

  try {
    const [row] = await db.select().from(scheduledMessages).where(eq(scheduledMessages.id, id));
    if (!row) return c.json({ error: "Not found" }, 404);
    if (row.senderId !== userId) return c.json({ error: "Forbidden" }, 403);
    if (row.status !== "pending") return c.json({ error: "Already " + row.status }, 400);

    await db.update(scheduledMessages)
      .set({ status: "canceled" })
      .where(eq(scheduledMessages.id, id));

    return c.json({ ok: true });
  } catch (err) {
    if (isMissingTable(err)) return c.json({ error: "Not found" }, 404);
    throw err;
  }
});

export default messagesRouter;
