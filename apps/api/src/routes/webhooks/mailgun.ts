import { Hono } from "hono";
import { handleInboundMessage } from "../../services/routing";

const mailgunWebhook = new Hono();

mailgunWebhook.post("/", async (c) => {
  let sender = "";
  let body = "";

  try {
    const formData = await c.req.parseBody();
    sender = (formData["sender"] as string) ?? (formData["from"] as string) ?? "";
    body = (formData["stripped-text"] as string) ?? (formData["body-plain"] as string) ?? "";
  } catch {
    try {
      const raw = await c.req.text();
      const params = new URLSearchParams(raw);
      sender = params.get("sender") ?? params.get("from") ?? "";
      body = params.get("stripped-text") ?? params.get("body-plain") ?? "";
    } catch (e) {
      console.error("[mailgun] Failed to parse webhook payload", e);
      return c.json({ ok: true });
    }
  }

  // Extract just the email address if it's in "Name <email>" format
  const emailMatch = sender.match(/<([^>]+)>/);
  const senderEmail = emailMatch ? emailMatch[1] : sender;

  if (!senderEmail || !body) {
    console.warn("[mailgun] Missing sender or body", { sender, body: body?.slice(0, 50) });
    return c.json({ ok: true });
  }

  let forceDisambiguate = false;
  if (body.startsWith("? ")) {
    forceDisambiguate = true;
    body = body.slice(2);
  }

  console.log(`[mailgun] Inbound email from ${senderEmail}: ${body.slice(0, 100)}`);

  await handleInboundMessage({
    channel: "email",
    senderIdentifier: senderEmail,
    body,
    forceDisambiguate,
  });

  return c.json({ ok: true });
});

export default mailgunWebhook;
