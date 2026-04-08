import { db, users, workspaces, workspaceMembers, conversations, messages } from "@guac/db";
import { eq, and, gt, desc } from "drizzle-orm";
import { deliver, sendSms, sendEmail, formatWorkingHoursAck } from "./delivery";
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

export function resolveRouting(input: RoutingInput): RoutingResult {
  const { senderWorkspaces, recentConversationUserId, forceDisambiguate } = input;

  if (senderWorkspaces.length === 0) {
    return { type: "no_workspaces" };
  }

  // Single workspace
  if (senderWorkspaces.length === 1) {
    const ws = senderWorkspaces[0];
    const senderId = ws.members[0].userId; // sender is always first
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

export async function handleInboundMessage(input: {
  channel: "sms" | "email";
  senderIdentifier: string;
  body: string;
  forceDisambiguate: boolean;
}) {
  const { channel, senderIdentifier, body, forceDisambiguate } = input;

  // 1. Identify sender
  const [sender] = channel === "sms"
    ? await db.select().from(users).where(eq(users.phone, senderIdentifier))
    : await db.select().from(users).where(eq(users.email, senderIdentifier));

  if (!sender) {
    const msg = "This number/address isn't registered with Guac.";
    if (channel === "sms") await sendSms(senderIdentifier, msg);
    else await sendEmail(senderIdentifier, "Guac", msg);
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

  // 5. Resolve routing
  const result = resolveRouting({
    senderWorkspaces,
    recentConversationUserId,
    forceDisambiguate,
  });

  switch (result.type) {
    case "direct":
      await routeMessage(sender, result.workspaceId, result.recipientId, body, channel, senderIdentifier);
      break;
    case "disambiguate_workspace": {
      const options = result.options.map((o) => ({ value: o.workspaceId, label: o.workspaceName }));
      await createDisambiguationSession({
        senderId: sender.id,
        originalMessage: body,
        step: "workspace",
        options,
      });
      const msg = formatDisambiguationMessage("workspace", options);
      if (channel === "sms") await sendSms(senderIdentifier, msg);
      else await sendEmail(senderIdentifier, "Guac — Which workspace?", msg);
      break;
    }
    case "disambiguate_recipient": {
      const options = [
        ...result.options.map((o) => ({ value: o.userId, label: o.name })),
        { value: "all", label: "All members" },
      ];
      await createDisambiguationSession({
        senderId: sender.id,
        originalMessage: body,
        step: "recipient",
        options,
        resolvedWorkspaceId: result.workspaceId,
      });
      const msg = formatDisambiguationMessage("recipient", options);
      if (channel === "sms") await sendSms(senderIdentifier, msg);
      else await sendEmail(senderIdentifier, "Guac — Who should receive this?", msg);
      break;
    }
    case "no_workspaces": {
      const msg = "You're not in any workspaces yet. Ask an admin to add you.";
      if (channel === "sms") await sendSms(senderIdentifier, msg);
      else await sendEmail(senderIdentifier, "Guac", msg);
      break;
    }
  }
}

async function handleDisambiguationReply(
  sender: typeof users.$inferSelect,
  session: any,
  reply: string,
  channel: "sms" | "email",
  senderIdentifier: string,
) {
  const selected = parseDisambiguationReply(reply, session.options);
  if (!selected) {
    const msg = "Invalid selection. " + formatDisambiguationMessage(session.step, session.options);
    if (channel === "sms") await sendSms(senderIdentifier, msg);
    else await sendEmail(senderIdentifier, "Guac — Try again", msg);
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
      if (channel === "sms") await sendSms(senderIdentifier, msg);
      else await sendEmail(senderIdentifier, "Guac — Who should receive this?", msg);
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

async function routeMessage(
  sender: typeof users.$inferSelect,
  workspaceId: string,
  recipientId: string,
  body: string,
  senderChannel: "sms" | "email",
  senderIdentifier: string,
) {
  const [recipient] = await db.select().from(users).where(eq(users.id, recipientId));
  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  if (!recipient || !workspace) return;

  const [conversation] = await db.insert(conversations).values({
    workspaceId,
    senderId: sender.id,
    recipientId,
    status: "active",
    lastActivityAt: new Date(),
  }).returning();

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
    const success = await deliver({
      channel: recipient.preferredChannel ?? "email",
      toEmail: recipient.email ?? undefined,
      toPhone: recipient.phone ?? undefined,
      senderName: sender.name ?? "Someone",
      workspaceName: workspace.name,
      body,
      conversationId: conversation.id,
    });

    await db.insert(messages).values({
      conversationId: conversation.id,
      senderId: sender.id,
      body,
      direction: "inbound",
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
      direction: "inbound",
      channel: senderChannel,
      deliveryStatus: "queued",
      deliverAt,
    });

    const ackMsg = notificationsOn
      ? formatWorkingHoursAck({ recipientName: recipient.name ?? "Recipient", nextAvailable: deliverAt! })
      : `${recipient.name ?? "Recipient"} has notifications paused. Your message is queued.`;

    if (senderChannel === "sms") await sendSms(senderIdentifier, ackMsg);
    else await sendEmail(senderIdentifier, "Guac — Message queued", ackMsg);
  }
}
