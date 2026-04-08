import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import auth from "./routes/auth";
import onboarding from "./routes/onboarding";
import preferences from "./routes/preferences";
import workspacesRouter from "./routes/workspaces";
import messagesRouter from "./routes/messages";
import telnyxWebhook from "./routes/webhooks/telnyx";
import resendWebhook from "./routes/webhooks/resend";
import cron from "./routes/cron";

const app = new Hono();

app.use("*", cors({
  origin: process.env.APP_URL ?? "http://localhost:3000",
  credentials: true,
}));

app.get("/health", (c) => c.json({ status: "ok" }));
app.route("/api/auth", auth);
app.route("/api/onboarding", onboarding);
app.route("/api/preferences", preferences);
app.route("/api/workspaces", workspacesRouter);
app.route("/api/messages", messagesRouter);
app.route("/api/webhooks/telnyx", telnyxWebhook);
app.route("/api/webhooks/resend", resendWebhook);
app.route("/api/cron", cron);

serve({ fetch: app.fetch, port: 3001 }, (info) => {
  console.log(`Guac API running on http://localhost:${info.port}`);
});

export default app;
