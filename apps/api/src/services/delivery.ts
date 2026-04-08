import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;
const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const TELNYX_PHONE = process.env.TELNYX_PHONE_NUMBER;
const GUAC_EMAIL = process.env.GUAC_EMAIL_ADDRESS;

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

export async function sendEmail(to: string, subject: string, body: string, replyToMessageId?: string): Promise<boolean> {
  try {
    const headers: Record<string, string> = {};
    if (replyToMessageId) {
      headers["In-Reply-To"] = replyToMessageId;
      headers["References"] = replyToMessageId;
    }

    if (!resend) {
      console.warn("[delivery] Resend not configured, skipping email send");
      return false;
    }
    await resend.emails.send({
      from: `Guac <${GUAC_EMAIL}>`,
      to,
      subject,
      text: body,
      headers,
    });
    return true;
  } catch {
    return false;
  }
}

export async function deliver(input: {
  channel: "sms" | "email" | "both";
  toPhone?: string;
  toEmail?: string;
  senderName: string;
  workspaceName: string;
  body: string;
  conversationId: string;
}): Promise<boolean> {
  const formatted = formatDeliveryMessage({
    senderName: input.senderName,
    workspaceName: input.workspaceName,
    body: input.body,
  });

  const subject = `Message from ${input.senderName} — ${input.workspaceName}`;
  const messageId = `<conv-${input.conversationId}@guac.app>`;

  if (input.channel === "both") {
    const results = await Promise.all([
      input.toEmail ? sendEmail(input.toEmail, subject, formatted, messageId) : Promise.resolve(false),
      input.toPhone ? sendSms(input.toPhone, formatted) : Promise.resolve(false),
    ]);
    return results.some(Boolean);
  } else if (input.channel === "sms" && input.toPhone) {
    return sendSms(input.toPhone, formatted);
  } else if (input.channel === "email" && input.toEmail) {
    return sendEmail(input.toEmail, subject, formatted, messageId);
  }
  return false;
}
