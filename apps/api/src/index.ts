import { serve } from "@hono/node-server";
import { Hono } from "hono";
import auth from "./routes/auth";
import onboarding from "./routes/onboarding";
import preferences from "./routes/preferences";
import workspacesRouter from "./routes/workspaces";

const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok" }));
app.route("/api/auth", auth);
app.route("/api/onboarding", onboarding);
app.route("/api/preferences", preferences);
app.route("/api/workspaces", workspacesRouter);

serve({ fetch: app.fetch, port: 3001 }, (info) => {
  console.log(`Guac API running on http://localhost:${info.port}`);
});

export default app;
