import { Resend } from "resend";
import { db, users, slackInstallations } from "@guac/db";
import { eq } from "drizzle-orm";
import { wrapEmailHtml } from "./email-template";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;
const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const TELNYX_PHONE = process.env.TELNYX_PHONE_NUMBER;
const GUAC_EMAIL = process.env.GUAC_EMAIL_ADDRESS;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

export function formatDeliveryMessage(input: {
  senderName: string;
  workspaceName: string;
  body: string;
}): string {
  return `From ${input.senderName} (${input.workspaceName}):\n${input.body}\n\nReply to respond.`;
}

export function formatWorkingHoursAck(input: {
  recipientName: string;
  nextAvailable: Date;
}): string {
  const timeStr = input.nextAvailable.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    weekday: "long",
  });
  return `${input.recipientName} is outside working hours. They'll receive this at ${timeStr}.`;
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return phone.startsWith("+") ? phone : `+${digits}`;
}

export async function sendSms(to: string, body: string): Promise<boolean> {
  try {
    const normalized = normalizePhone(to);
    const response = await fetch("https://api.telnyx.com/v2/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TELNYX_API_KEY}`,
      },
      body: JSON.stringify({
        from: TELNYX_PHONE,
        to: normalized,
        text: body,
      }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error("[delivery] Telnyx SMS failed:", JSON.stringify(err));
    }
    return response.ok;
  } catch {
    return false;
  }
}

export async function sendEmail(to: string, subject: string, body: string, options?: { replyToMessageId?: string; ctaText?: string; ctaUrl?: string }): Promise<boolean> {
  try {
    const headers: Record<string, string> = {};
    if (options?.replyToMessageId) {
      headers["In-Reply-To"] = options.replyToMessageId;
      headers["References"] = options.replyToMessageId;
    }

    if (!resend) {
      console.warn("[delivery] Resend not configured, skipping email send");
      return false;
    }

    const escapedBody = body.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const html = wrapEmailHtml(escapedBody, { ctaText: options?.ctaText, ctaUrl: options?.ctaUrl });

    await resend.emails.send({
      from: `Guac <${GUAC_EMAIL}>`,
      to,
      subject,
      text: body,
      html,
      headers,
    });
    return true;
  } catch {
    return false;
  }
}

export async function sendDiscord(userId: string, body: string): Promise<boolean> {
  try {
    if (!DISCORD_BOT_TOKEN) {
      console.warn("[delivery] Discord bot token not configured");
      return false;
    }
    // Create a DM channel with the user
    const dmRes = await fetch("https://discord.com/api/v10/users/@me/channels", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
      },
      body: JSON.stringify({ recipient_id: userId }),
    });
    if (!dmRes.ok) {
      const err = await dmRes.json().catch(() => ({}));
      console.error("[delivery] Discord DM channel failed:", JSON.stringify(err));
      return false;
    }
    const dm = await dmRes.json();

    // Send the message
    const msgRes = await fetch(`https://discord.com/api/v10/channels/${dm.id}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
      },
      body: JSON.stringify({ content: body }),
    });
    if (!msgRes.ok) {
      const err = await msgRes.json().catch(() => ({}));
      console.error("[delivery] Discord message failed:", JSON.stringify(err));
    }
    return msgRes.ok;
  } catch {
    return false;
  }
}

export async function sendSlack(slackUserId: string, body: string, teamId?: string): Promise<boolean> {
  try {
    // Look up the bot token: use teamId if provided, otherwise find from user's slack_team_id
    let botToken: string | null = null;

    if (teamId) {
      const [installation] = await db.select().from(slackInstallations).where(eq(slackInstallations.teamId, teamId));
      botToken = installation?.botToken ?? null;
    }

    if (!botToken) {
      // Find the user's team from their slackId, then get the token
      const [user] = await db.select({ slackTeamId: users.slackTeamId }).from(users).where(eq(users.slackId, slackUserId));
      if (user?.slackTeamId) {
        const [installation] = await db.select().from(slackInstallations).where(eq(slackInstallations.teamId, user.slackTeamId));
        botToken = installation?.botToken ?? null;
      }
    }

    // Fallback to env var for backwards compat
    if (!botToken) botToken = process.env.SLACK_BOT_TOKEN ?? null;

    if (!botToken) {
      console.warn("[delivery] No Slack bot token found for user", slackUserId);
      return false;
    }

    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${botToken}`,
      },
      body: JSON.stringify({ channel: slackUserId, text: body }),
    });
    const data = await res.json();
    if (!data.ok) {
      console.error("[delivery] Slack message failed:", data.error);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function deliver(input: {
  channel: "sms" | "email" | "both" | "discord" | "slack";
  toPhone?: string;
  toEmail?: string;
  toDiscordId?: string;
  toSlackId?: string;
  senderName: string;
  workspaceName: string;
  body: string;
  conversationId: string;
}): Promise<boolean> {
  console.log(`[delivery] channel=${input.channel} toPhone=${input.toPhone} toEmail=${input.toEmail} toDiscord=${input.toDiscordId} toSlack=${input.toSlackId}`);
  const formatted = formatDeliveryMessage({
    senderName: input.senderName,
    workspaceName: input.workspaceName,
    body: input.body,
  });

  const subject = `Message from ${input.senderName} — ${input.workspaceName}`;
  const messageId = `<conv-${input.conversationId}@guac.app>`;

  if (input.channel === "both") {
    const results = await Promise.all([
      input.toEmail ? sendEmail(input.toEmail, subject, formatted, { replyToMessageId: messageId }) : Promise.resolve(false),
      input.toPhone ? sendSms(input.toPhone, formatted) : Promise.resolve(false),
    ]);
    return results.some(Boolean);
  } else if (input.channel === "sms" && input.toPhone) {
    return sendSms(input.toPhone, formatted);
  } else if (input.channel === "email" && input.toEmail) {
    return sendEmail(input.toEmail, subject, formatted, { replyToMessageId: messageId });
  } else if (input.channel === "discord" && input.toDiscordId) {
    return sendDiscord(input.toDiscordId, formatted);
  } else if (input.channel === "slack" && input.toSlackId) {
    return sendSlack(input.toSlackId, formatted);
  }
  return false;
}
