import { Hono } from "hono";
import { deliverQueuedMessages } from "../cron/deliver-queued";
import { expireConversations } from "../cron/expire-conversations";
import { expireDisambiguationSessions } from "../cron/expire-disambiguation";
import { sendReminders } from "../cron/send-reminders";

const cron = new Hono();

cron.post("/deliver-queued", async (c) => {
  await deliverQueuedMessages();
  return c.json({ ok: true });
});

cron.post("/send-reminders", async (c) => {
  await sendReminders();
  return c.json({ ok: true });
});

cron.post("/expire-conversations", async (c) => {
  await expireConversations();
  return c.json({ ok: true });
});

cron.post("/expire-disambiguation", async (c) => {
  await expireDisambiguationSessions();
  return c.json({ ok: true });
});

export default cron;
