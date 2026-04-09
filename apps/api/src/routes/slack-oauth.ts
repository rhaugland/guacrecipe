import { Hono } from "hono";
import { requireAuth } from "../middleware/auth";
import { db, users, slackInstallations } from "@guac/db";
import { eq } from "drizzle-orm";

const SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID;
const SLACK_CLIENT_SECRET = process.env.SLACK_CLIENT_SECRET;
const APP_URL = process.env.APP_URL ?? "http://localhost:3002";

const slackOauth = new Hono();

// Step 1: Redirect user to Slack's OAuth page
slackOauth.get("/install", requireAuth, async (c) => {
  const userId = c.get("userId");
  const redirectUri = `${APP_URL}/api/slack/callback`;
  const scopes = "chat:write,users:read,users:read.email,im:history";
  const url = `https://slack.com/oauth/v2/authorize?client_id=${SLACK_CLIENT_ID}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${userId}`;
  return c.redirect(url);
});

// Step 2: Slack redirects back with a code
slackOauth.get("/callback", async (c) => {
  const code = c.req.query("code");
  const userId = c.req.query("state");
  const error = c.req.query("error");

  if (error || !code) {
    return c.redirect(`${APP_URL}/dashboard?slack=error`);
  }

  const redirectUri = `${APP_URL}/api/slack/callback`;

  // Exchange code for token
  const tokenRes = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: SLACK_CLIENT_ID!,
      client_secret: SLACK_CLIENT_SECRET!,
      code,
      redirect_uri: redirectUri,
    }),
  });

  const data = await tokenRes.json();
  if (!data.ok) {
    console.error("[slack-oauth] Token exchange failed:", data.error);
    return c.redirect(`${APP_URL}/dashboard?slack=error`);
  }

  const teamId = data.team?.id;
  const teamName = data.team?.name;
  const botToken = data.access_token;
  const slackUserId = data.authed_user?.id;

  // Upsert the installation
  const [existing] = await db.select().from(slackInstallations).where(eq(slackInstallations.teamId, teamId));
  if (existing) {
    await db.update(slackInstallations).set({
      botToken,
      teamName,
      installedBy: userId ?? existing.installedBy,
    }).where(eq(slackInstallations.teamId, teamId));
  } else {
    await db.insert(slackInstallations).values({
      teamId,
      teamName,
      botToken,
      installedBy: userId ?? undefined,
    });
  }

  // Auto-connect the installing user's Slack account
  if (userId && slackUserId) {
    await db.update(users).set({
      slackId: slackUserId,
      slackTeamId: teamId,
      updatedAt: new Date(),
    }).where(eq(users.id, userId));
  }

  return c.redirect(`${APP_URL}/dashboard?slack=connected`);
});

export default slackOauth;
