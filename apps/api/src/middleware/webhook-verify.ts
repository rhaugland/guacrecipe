import { createMiddleware } from "hono/factory";

export const verifyTelnyxWebhook = createMiddleware(async (c, next) => {
  if (process.env.NODE_ENV !== "production") return next();
  const signature = c.req.header("telnyx-signature-ed25519");
  const timestamp = c.req.header("telnyx-timestamp");
  if (!signature || !timestamp) return c.json({ error: "Invalid signature" }, 401);
  await next();
});

export const verifyResendWebhook = createMiddleware(async (c, next) => {
  if (process.env.NODE_ENV !== "production") return next();
  const signature = c.req.header("svix-signature");
  if (!signature) return c.json({ error: "Invalid signature" }, 401);
  await next();
});
