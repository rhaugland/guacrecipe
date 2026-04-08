import { Hono } from "hono";
import { verifyTelnyxWebhook } from "../../middleware/webhook-verify";
import { extractInboundSms } from "../../services/inbound";
import { handleInboundMessage } from "../../services/routing";

const telnyxWebhook = new Hono();

telnyxWebhook.post("/", verifyTelnyxWebhook, async (c) => {
  const payload = await c.req.json();
  if (payload.data?.event_type !== "message.received") {
    return c.json({ ok: true });
  }
  const { senderPhone, body, forceDisambiguate } = extractInboundSms(payload);
  await handleInboundMessage({
    channel: "sms",
    senderIdentifier: senderPhone,
    body,
    forceDisambiguate: forceDisambiguate ?? false,
  });
  return c.json({ ok: true });
});

export default telnyxWebhook;
