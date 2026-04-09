import { handleInboundMessage } from "../../services/routing";

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GATEWAY_URL = "wss://gateway.discord.gg/?v=10&encoding=json";

let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
let ws: import("ws").WebSocket | null = null;
let sequence: number | null = null;

export async function startDiscordGateway() {
  if (!DISCORD_BOT_TOKEN) {
    console.warn("[discord] No bot token configured, skipping gateway");
    return;
  }

  const { WebSocket } = await import("ws");
  ws = new WebSocket(GATEWAY_URL);

  ws.on("message", async (data) => {
    const payload = JSON.parse(data.toString());
    const { op, t, s, d } = payload;

    if (s) sequence = s;

    // Hello — start heartbeating
    if (op === 10) {
      const interval = d.heartbeat_interval;
      heartbeatInterval = setInterval(() => {
        ws?.send(JSON.stringify({ op: 1, d: sequence }));
      }, interval);

      // Identify
      ws?.send(JSON.stringify({
        op: 2,
        d: {
          token: DISCORD_BOT_TOKEN,
          intents: (1 << 12) | (1 << 9), // DIRECT_MESSAGES | GUILD_MESSAGES (for DM content)
          properties: { os: "linux", browser: "guac", device: "guac" },
        },
      }));
    }

    // Heartbeat ACK — nothing to do
    if (op === 11) return;

    // Dispatch events
    if (op === 0 && t === "MESSAGE_CREATE") {
      // Ignore bot messages
      if (d.author?.bot) return;

      // Only handle DMs (guild_id is absent for DMs)
      if (d.guild_id) return;

      const discordUserId = d.author.id;
      const body = d.content ?? "";

      if (!body.trim()) return;

      await handleInboundMessage({
        channel: "discord",
        senderIdentifier: discordUserId,
        body,
        forceDisambiguate: body.startsWith("@"),
      });
    }
  });

  ws.on("close", (code) => {
    console.log(`[discord] Gateway closed (${code}), reconnecting in 5s...`);
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    setTimeout(startDiscordGateway, 5000);
  });

  ws.on("error", (err) => {
    console.error("[discord] Gateway error:", err.message);
  });

  ws.on("open", () => {
    console.log("[discord] Gateway connected");
  });
}
