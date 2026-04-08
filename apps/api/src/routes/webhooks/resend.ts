import { Hono } from "hono";
import { verifyResendWebhook } from "../../middleware/webhook-verify";
import { extractInboundEmail } from "../../services/inbound";
import { handleInboundMessage } from "../../services/routing";

const resendWebhook = new Hono();

resendWebhook.post("/", verifyResendWebhook, async (c) => {
  const payload = await c.req.json();
  const { senderEmail, body, forceDisambiguate } = extractInboundEmail(payload);
  await handleInboundMessage({
    channel: "email",
    senderIdentifier: senderEmail,
    body,
    forceDisambiguate: forceDisambiguate ?? false,
  });
  return c.json({ ok: true });
});

export default resendWebhook;
