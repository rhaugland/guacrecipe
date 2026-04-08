import { serve } from "@hono/node-server";
import { Hono } from "hono";
import auth from "./routes/auth";

const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok" }));
app.route("/api/auth", auth);

serve({ fetch: app.fetch, port: 3001 }, (info) => {
  console.log(`Guac API running on http://localhost:${info.port}`);
});

export default app;
