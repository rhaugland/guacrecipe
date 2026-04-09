import { db, users, workspaces, workspaceMembers, conversations, messages, workspaceContactOverrides } from "@guac/db";
import { eq, and, or, gt, desc } from "drizzle-orm";
import { deliver, sendSms, sendEmail, sendDiscord, sendSlack, sendTelegram, formatWorkingHoursAck } from "./delivery";
import { isWithinWorkingHours, getNextWorkingTime } from "./working-hours";
import {
  createDisambiguationSession,
  findPendingSession,
  parseDisambiguationReply,
  resolveDisambiguationSession,
  formatDisambiguationMessage,
} from "./disambiguation";

type WorkspaceMember = {
  userId: string;
  name: string;
};

type SenderWorkspace = {
  workspaceId: string;
  workspaceName: string;
  members: WorkspaceMember[];
};

type RoutingInput = {
  senderWorkspaces: SenderWorkspace[];
  recentConversationUserId: string | null;
  forceDisambiguate: boolean;
};

export type RoutingResult =
  | { type: "direct"; workspaceId: string; recipientId: string }
  | { type: "disambiguate_workspace"; options: { workspaceId: string; workspaceName: string }[] }
  | { type: "disambiguate_recipient"; workspaceId: string; options: { userId: string; name: string }[] }
  | { type: "no_workspaces" };

/**
 * Parse @mentions from message body.
 * Returns matched workspace/member names (lowercased) and the cleaned message body.
 * Supports: @name, @"workspace name", @workspace-name
 */
export function parseMentions(body: string, senderWorkspaces: SenderWorkspace[], senderId: string): {
  mentionedWorkspace: SenderWorkspace | null;
  mentionedRecipient: { userId: string; name: string; workspaceId: string } | null;
  cleanBody: string;
} {
  let mentionedWorkspace: SenderWorkspace | null = null;
  let mentionedRecipient: { userId: string; name: string; workspaceId: string } | null = null;
  let cleanBody = body;

  // Extract all @mentions — supports @word, @"multi word", @multi-word
  const mentionPattern = /@"([^"]+)"|@(\S+)/g;
  const mentions: string[] = [];
  let match;
  while ((match = mentionPattern.exec(body)) !== null) {
    mentions.push((match[1] ?? match[2]).toLowerCase());
  }

  if (mentions.length === 0) return { mentionedWorkspace, mentionedRecipient, cleanBody };

  // Try to match workspace names
  for (const mention of mentions) {
    const ws = senderWorkspaces.find((w) => w.workspaceName.toLowerCase() === mention);
    if (ws) {
      mentionedWorkspace = ws;
      cleanBody = cleanBody.replace(new RegExp(`@"?${escapeRegex(mention)}"?`, "i"), "").trim();
      break;
    }
  }

  // Try to match member names across relevant workspaces
  const searchWorkspaces = mentionedWorkspace ? [mentionedWorkspace] : senderWorkspaces;
  for (const mention of mentions) {
    for (const ws of searchWorkspaces) {
      const member = ws.members.find(
        (m) => m.userId !== senderId && m.name.toLowerCase() === mention
      );
      if (member) {
        mentionedRecipient = { userId: member.userId, name: member.name, workspaceId: ws.workspaceId };
        cleanBody = cleanBody.replace(new RegExp(`@"?${escapeRegex(mention)}"?`, "i"), "").trim();
        break;
      }
      // Also try first-name match
      const firstNameMatch = ws.members.find(
        (m) => m.userId !== senderId && m.name.toLowerCase().split(/\s+/)[0] === mention
      );
      if (firstNameMatch) {
        mentionedRecipient = { userId: firstNameMatch.userId, name: firstNameMatch.name, workspaceId: ws.workspaceId };
        cleanBody = cleanBody.replace(new RegExp(`@"?${escapeRegex(mention)}"?`, "i"), "").trim();
        break;
      }
    }
    if (mentionedRecipient) break;
  }

  return { mentionedWorkspace, mentionedRecipient, cleanBody };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function resolveRouting(input: RoutingInput & { senderId: string }): RoutingResult {
  const { senderWorkspaces, recentConversationUserId, forceDisambiguate, senderId } = input;

  if (senderWorkspaces.length === 0) {
    return { type: "no_workspaces" };
  }

  // Single workspace
  if (senderWorkspaces.length === 1) {
    const ws = senderWorkspaces[0];
    const otherMembers = ws.members.filter((m) => m.userId !== senderId);

    if (otherMembers.length === 1) {
      return { type: "direct", workspaceId: ws.workspaceId, recipientId: otherMembers[0].userId };
    }

    // Multiple members — check recent conversation shortcut
    if (recentConversationUserId && !forceDisambiguate) {
      const recent = otherMembers.find((m) => m.userId === recentConversationUserId);
      if (recent) {
        return { type: "direct", workspaceId: ws.workspaceId, recipientId: recent.userId };
      }
    }

    return {
      type: "disambiguate_recipient",
      workspaceId: ws.workspaceId,
      options: otherMembers.map((m) => ({ userId: m.userId, name: m.name })),
    };
  }

  // Multiple workspaces
  return {
    type: "disambiguate_workspace",
    options: senderWorkspaces.map((ws) => ({
      workspaceId: ws.workspaceId,
      workspaceName: ws.workspaceName,
    })),
  };
}

async function replyToSender(channel: "sms" | "email" | "discord" | "slack" | "telegram", senderIdentifier: string, msg: string, subject?: string) {
  if (channel === "sms") await sendSms(senderIdentifier, msg);
  else if (channel === "email") await sendEmail(senderIdentifier, subject ?? "Guac", msg);
  else if (channel === "discord") await sendDiscord(senderIdentifier, msg);
  else if (channel === "slack") await sendSlack(senderIdentifier, msg);
  else if (channel === "telegram") await sendTelegram(senderIdentifier, msg);
}

export async function handleInboundMessage(input: {
  channel: "sms" | "email" | "discord" | "slack" | "telegram";
  senderIdentifier: string;
  body: string;
  forceDisambiguate: boolean;
}) {
  const { channel, senderIdentifier, body, forceDisambiguate } = input;

  // 1. Identify sender by channel
  let lookupIdentifier = senderIdentifier;
  if (channel === "sms") {
    const digits = senderIdentifier.replace(/\D/g, "");
    lookupIdentifier = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  }

  let senderRows;
  if (channel === "sms") {
    senderRows = await db.select().from(users).where(eq(users.phone, lookupIdentifier));
  } else if (channel === "email") {
    senderRows = await db.select().from(users).where(eq(users.email, senderIdentifier));
  } else if (channel === "discord") {
    senderRows = await db.select().from(users).where(eq(users.discordId, senderIdentifier));
  } else if (channel === "slack") {
    senderRows = await db.select().from(users).where(eq(users.slackId, senderIdentifier));
  } else if (channel === "telegram") {
    senderRows = await db.select().from(users).where(eq(users.telegramChatId, senderIdentifier));
  } else {
    return;
  }
  const [sender] = senderRows ?? [];

  if (!sender) {
    const msg = "You're not registered with Guac. Sign up at " + (process.env.APP_URL ?? "https://guacwithme.com");
    await replyToSender(channel, senderIdentifier, msg);
    return;
  }

  // 2. Check for pending disambiguation session
  const pendingSession = await findPendingSession(sender.id);
  if (pendingSession) {
    await handleDisambiguationReply(sender, pendingSession, body, channel, senderIdentifier);
    return;
  }

  // 3. Get sender's workspaces with members
  const memberships = await db.select({ workspaceId: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, sender.id));

  const senderWorkspaces = await Promise.all(
    memberships.map(async (m) => {
      const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, m.workspaceId));
      const members = await db.select({ userId: workspaceMembers.userId, name: users.name })
        .from(workspaceMembers)
        .innerJoin(users, eq(workspaceMembers.userId, users.id))
        .where(eq(workspaceMembers.workspaceId, m.workspaceId));
      return {
        workspaceId: ws.id,
        workspaceName: ws.name,
        members: members.map((mem) => ({ userId: mem.userId, name: mem.name ?? "Unknown" })),
      };
    })
  );

  // 4. Check recent conversations for shortcut
  let recentConversationUserId: string | null = null;
  if (!forceDisambiguate) {
    const oneDayAgo = new Date();
    oneDayAgo.setHours(oneDayAgo.getHours() - 24);
    const [recentConvo] = await db.select()
      .from(conversations)
      .where(and(eq(conversations.senderId, sender.id), gt(conversations.lastActivityAt, oneDayAgo)))
      .orderBy(desc(conversations.lastActivityAt))
      .limit(1);
    if (recentConvo) recentConversationUserId = recentConvo.recipientId;
  }

  // 5. Try @mention parsing first for direct routing
  const { mentionedWorkspace, mentionedRecipient, cleanBody } = parseMentions(body, senderWorkspaces, sender.id);

  // If both workspace and recipient are resolved via mentions, route directly
  if (mentionedRecipient) {
    const wsId = mentionedWorkspace?.workspaceId ?? mentionedRecipient.workspaceId;
    await routeMessage(sender, wsId, mentionedRecipient.userId, cleanBody, channel, senderIdentifier);
    return;
  }

  // If only workspace is mentioned, narrow down to that workspace for disambiguation
  const effectiveWorkspaces = mentionedWorkspace
    ? senderWorkspaces.filter((ws) => ws.workspaceId === mentionedWorkspace.workspaceId)
    : senderWorkspaces;
  const effectiveBody = mentionedWorkspace ? cleanBody : body;

  // 6. Resolve routing
  const result = resolveRouting({
    senderId: sender.id,
    senderWorkspaces: effectiveWorkspaces,
    recentConversationUserId,
    forceDisambiguate,
  });

  switch (result.type) {
    case "direct":
      await routeMessage(sender, result.workspaceId, result.recipientId, effectiveBody, channel, senderIdentifier);
      break;
    case "disambiguate_workspace": {
      const options = result.options.map((o) => ({ value: o.workspaceId, label: o.workspaceName }));
      await createDisambiguationSession({
        senderId: sender.id,
        originalMessage: effectiveBody,
        step: "workspace",
        options,
      });
      const msg = formatDisambiguationMessage("workspace", options);
      await replyToSender(channel, senderIdentifier, msg, "Guac — Which workspace?");
      break;
    }
    case "disambiguate_recipient": {
      const options = [
        ...result.options.map((o) => ({ value: o.userId, label: o.name })),
        { value: "all", label: "All members" },
      ];
      await createDisambiguationSession({
        senderId: sender.id,
        originalMessage: effectiveBody,
        step: "recipient",
        options,
        resolvedWorkspaceId: result.workspaceId,
      });
      const msg = formatDisambiguationMessage("recipient", options);
      await replyToSender(channel, senderIdentifier, msg, "Guac — Who should receive this?");
      break;
    }
    case "no_workspaces": {
      const msg = "You're not in any workspaces yet. Ask an admin to add you.";
      await replyToSender(channel, senderIdentifier, msg);
      break;
    }
  }
}

async function handleDisambiguationReply(
  sender: typeof users.$inferSelect,
  session: any,
  reply: string,
  channel: "sms" | "email" | "discord" | "slack" | "telegram",
  senderIdentifier: string,
) {
  const selected = parseDisambiguationReply(reply, session.options);
  if (!selected) {
    const msg = "Invalid selection. " + formatDisambiguationMessage(session.step, session.options);
    await replyToSender(channel, senderIdentifier, msg, "Guac — Try again");
    return;
  }

  if (session.step === "workspace") {
    const members = await db.select({ userId: workspaceMembers.userId, name: users.name })
      .from(workspaceMembers)
      .innerJoin(users, eq(workspaceMembers.userId, users.id))
      .where(eq(workspaceMembers.workspaceId, selected.value));

    const otherMembers = members.filter((m) => m.userId !== sender.id);

    if (otherMembers.length === 1) {
      await resolveDisambiguationSession(session.id, { status: "resolved", resolvedWorkspaceId: selected.value, resolvedRecipientId: otherMembers[0].userId });
      await routeMessage(sender, selected.value, otherMembers[0].userId, session.originalMessage, channel, senderIdentifier);
    } else {
      const options = [
        ...otherMembers.map((m) => ({ value: m.userId, label: m.name ?? "Unknown" })),
        { value: "all", label: "All members" },
      ];
      await resolveDisambiguationSession(session.id, {
        step: "recipient",
        options,
        resolvedWorkspaceId: selected.value,
      });
      const msg = formatDisambiguationMessage("recipient", options);
      await replyToSender(channel, senderIdentifier, msg, "Guac — Who should receive this?");
    }
  } else {
    await resolveDisambiguationSession(session.id, { status: "resolved", resolvedRecipientId: selected.value });

    if (selected.value === "all") {
      const members = await db.select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(eq(workspaceMembers.workspaceId, session.resolvedWorkspaceId!));

      const otherMembers = members.filter((m) => m.userId !== sender.id);
      for (const m of otherMembers) {
        await routeMessage(sender, session.resolvedWorkspaceId!, m.userId, session.originalMessage, channel, senderIdentifier);
      }
    } else {
      await routeMessage(sender, session.resolvedWorkspaceId!, selected.value, session.originalMessage, channel, senderIdentifier);
    }
  }
}

export async function routeMessage(
  sender: typeof users.$inferSelect,
  workspaceId: string,
  recipientId: string,
  body: string,
  senderChannel: "sms" | "email" | "discord" | "slack" | "telegram",
  senderIdentifier: string,
) {
  const [recipient] = await db.select().from(users).where(eq(users.id, recipientId));
  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  if (!recipient || !workspace) return;

  // Check for workspace-specific contact overrides
  const [contactOverride] = await db.select().from(workspaceContactOverrides).where(
    and(eq(workspaceContactOverrides.workspaceId, workspaceId), eq(workspaceContactOverrides.userId, recipientId))
  );

  // Conversation Continuity: reuse existing conversation between these users in this workspace
  const [existingConvo] = await db.select().from(conversations).where(
    or(
      and(eq(conversations.workspaceId, workspaceId), eq(conversations.senderId, sender.id), eq(conversations.recipientId, recipientId)),
      and(eq(conversations.workspaceId, workspaceId), eq(conversations.senderId, recipientId), eq(conversations.recipientId, sender.id)),
    )
  ).orderBy(desc(conversations.lastActivityAt)).limit(1);

  let conversation;
  if (existingConvo) {
    await db.update(conversations).set({ lastActivityAt: new Date(), status: "active" }).where(eq(conversations.id, existingConvo.id));
    conversation = existingConvo;
  } else {
    [conversation] = await db.insert(conversations).values({
      workspaceId,
      senderId: sender.id,
      recipientId,
      status: "active",
      lastActivityAt: new Date(),
    }).returning();
  }

  const recipientConfig = {
    workingHoursEnabled: recipient.workingHoursEnabled ?? true,
    workingHoursStart: recipient.workingHoursStart ?? "09:00",
    workingHoursEnd: recipient.workingHoursEnd ?? "17:00",
    workingHoursTimezone: recipient.workingHoursTimezone ?? "America/New_York",
    workingHoursDays: (recipient.workingHoursDays as number[]) ?? [1, 2, 3, 4, 5],
  };

  const now = new Date();
  const withinHours = isWithinWorkingHours(recipientConfig, now);
  const notificationsOn = recipient.notificationsEnabled ?? true;

  if (withinHours && notificationsOn) {
    const channels = (recipient.notificationChannels as string[] | null)?.length
      ? (recipient.notificationChannels as string[])
      : [recipient.preferredChannel ?? "email"];

    const deliveryInput = {
      toEmail: contactOverride?.email ?? recipient.email ?? undefined,
      toPhone: contactOverride?.phone ?? recipient.phone ?? undefined,
      toDiscordId: recipient.discordId ?? undefined,
      toSlackId: recipient.slackId ?? undefined,
      toTelegramChatId: recipient.telegramChatId ?? undefined,
      recipientId: recipient.id,
      senderName: sender.name ?? "Someone",
      workspaceName: workspace.name,
      body,
      conversationId: conversation.id,
    };

    const results = await Promise.all(
      channels.map((ch) => deliver({ ...deliveryInput, channel: ch as any }))
    );
    const success = results.some(Boolean);

    await db.insert(messages).values({
      conversationId: conversation.id,
      senderId: sender.id,
      body,
      direction: "outbound",
      channel: senderChannel,
      deliveryStatus: success ? "delivered" : "failed",
      deliveredAt: success ? new Date() : null,
    });
  } else {
    const deliverAt = notificationsOn
      ? getNextWorkingTime(recipientConfig, now)
      : null;

    await db.insert(messages).values({
      conversationId: conversation.id,
      senderId: sender.id,
      body,
      direction: "outbound",
      channel: senderChannel,
      deliveryStatus: "queued",
      deliverAt,
    });

    const ackMsg = notificationsOn
      ? formatWorkingHoursAck({ recipientName: recipient.name ?? "Recipient", nextAvailable: deliverAt! })
      : `${recipient.name ?? "Recipient"} has notifications paused. Your message is queued.`;

    await replyToSender(senderChannel, senderIdentifier, ackMsg, "Guac — Message queued");
  }
}
