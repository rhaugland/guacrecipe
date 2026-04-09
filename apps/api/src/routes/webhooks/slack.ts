import { Hono } from "hono";
import { handleInboundMessage } from "../../services/routing";

const slackWebhook = new Hono();

slackWebhook.post("/", async (c) => {
  const payload = await c.req.json();

  // Slack URL verification challenge
  if (payload.type === "url_verification") {
    return c.json({ challenge: payload.challenge });
  }

  // Only handle message events
  if (payload.type !== "event_callback" || payload.event?.type !== "message") {
    return c.json({ ok: true });
  }

  const event = payload.event;

  // Ignore bot messages (prevents loops), message edits, and non-DM channels
  if (event.bot_id || event.subtype || event.channel_type !== "im") {
    return c.json({ ok: true });
  }

  const slackUserId = event.user;
  const body = event.text ?? "";

  if (!body.trim()) {
    return c.json({ ok: true });
  }

  await handleInboundMessage({
    channel: "slack",
    senderIdentifier: slackUserId,
    body,
    forceDisambiguate: body.startsWith("@"),
  });

  return c.json({ ok: true });
});

export default slackWebhook;
