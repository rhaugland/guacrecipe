import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
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

export async function sendSms(to: string, body: string): Promise<boolean> {
  try {
    const response = await fetch("https://api.telnyx.com/v2/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TELNYX_API_KEY}`,
      },
      body: JSON.stringify({
        from: TELNYX_PHONE,
        to,
        text: body,
      }),
    });
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
  channel: "sms" | "email";
  to: string;
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

  if (input.channel === "sms") {
    return sendSms(input.to, formatted);
  } else {
    const subject = `Message from ${input.senderName} — ${input.workspaceName}`;
    return sendEmail(input.to, subject, formatted, `<conv-${input.conversationId}@guac.app>`);
  }
}
