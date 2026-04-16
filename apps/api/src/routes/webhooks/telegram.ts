import { Hono } from "hono";
import { handleInboundMessage } from "../../services/routing";

const telegramWebhook = new Hono();

telegramWebhook.post("/", async (c) => {
  const body = await c.req.json();

  // Telegram sends updates with a "message" field for new messages
  const message = body.message;
  if (!message?.text || !message?.chat?.id) {
    return c.json({ ok: true });
  }

  // Ignore bot messages
  if (message.from?.is_bot) return c.json({ ok: true });

  const chatId = String(message.chat.id);
  const text = message.text;

  // Messages starting with "/" are bot commands — ignore them
  if (text.startsWith("/start")) {
    // Welcome message
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    if (TELEGRAM_BOT_TOKEN) {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: "Welcome to New Sky! ☁️\n\nSend any message here and it'll be routed to your workspace contacts.\n\nSign up at " + (process.env.APP_URL ?? "https://guacwithme.com") + " and add your Telegram Chat ID in your preferences: " + chatId,
        }),
      });
    }
    return c.json({ ok: true });
  }

  if (text.startsWith("/")) return c.json({ ok: true });

  // Route the message through Guac
  const forceDisambiguate = text.startsWith("? ") || text.startsWith("@");
  const cleanText = text.startsWith("? ") ? text.slice(2) : text;

  await handleInboundMessage({
    channel: "telegram",
    senderIdentifier: chatId,
    body: cleanText,
    forceDisambiguate,
  });

  return c.json({ ok: true });
});

export default telegramWebhook;
