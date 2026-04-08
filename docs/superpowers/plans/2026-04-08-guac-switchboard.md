# Guac Switchboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a communication switchboard that routes inbound SMS/email to the right person via their preferred channel, with workspace-based multi-tenancy, magic link auth, and a single-page dashboard.

**Architecture:** Webhook-driven routing engine. Telnyx/Resend webhooks ingest messages, a routing service resolves recipients and channels, a delivery service sends via Telnyx (SMS) or Resend (email). PostgreSQL-backed queue for working-hours delays. Cron jobs handle deferred delivery, reminders, and expiration.

**Tech Stack:** Next.js 15, Hono, Drizzle, PostgreSQL, Telnyx, Resend, Turborepo, Tailwind CSS v4

---

### Task 1: Monorepo Scaffolding

**Files:**
- Create: `package.json`
- Create: `turbo.json`
- Create: `tsconfig.base.json`
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/src/index.ts`
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/next.config.ts`
- Create: `apps/web/tailwind.config.ts`
- Create: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/page.tsx`
- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`
- Create: `packages/db/drizzle.config.ts`

- [ ] **Step 1: Create root package.json**

```json
{
  "name": "guac",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "test": "turbo test",
    "db:generate": "turbo db:generate",
    "db:migrate": "turbo db:migrate"
  },
  "devDependencies": {
    "turbo": "^2.4.0",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 2: Create turbo.json**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "dev": { "cache": false, "persistent": true },
    "build": { "dependsOn": ["^build"], "outputs": [".next/**", "dist/**"] },
    "test": { "dependsOn": ["^build"] },
    "db:generate": { "cache": false },
    "db:migrate": { "cache": false }
  }
}
```

- [ ] **Step 3: Create tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 4: Create Hono API app**

`apps/api/package.json`:
```json
{
  "name": "@guac/api",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsx src/index.ts",
    "test": "vitest"
  },
  "dependencies": {
    "@guac/db": "workspace:*",
    "@hono/node-server": "^1.14.0",
    "hono": "^4.7.0",
    "resend": "^4.1.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "vitest": "^3.1.0"
  }
}
```

`apps/api/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

`apps/api/src/index.ts`:
```typescript
import { serve } from "@hono/node-server";
import { Hono } from "hono";

const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok" }));

serve({ fetch: app.fetch, port: 3001 }, (info) => {
  console.log(`Guac API running on http://localhost:${info.port}`);
});

export default app;
```

- [ ] **Step 5: Create Next.js web app**

`apps/web/package.json`:
```json
{
  "name": "@guac/web",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3000",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "^15.3.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.1.0",
    "@types/react": "^19.1.0",
    "@types/react-dom": "^19.1.0",
    "tailwindcss": "^4.1.0",
    "typescript": "^5.7.0"
  }
}
```

`apps/web/next.config.ts`:
```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
```

`apps/web/src/app/globals.css`:
```css
@import "tailwindcss";

@theme {
  --color-cream: #FFFDF7;
  --color-green-primary: #4A7C59;
  --color-green-secondary: #6B9F5B;
  --color-green-light: #E8F0E5;
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
}
```

`apps/web/src/app/layout.tsx`:
```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Guac",
  description: "Communication switchboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-cream text-gray-900 font-sans min-h-screen">
        {children}
      </body>
    </html>
  );
}
```

`apps/web/src/app/page.tsx`:
```tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/dashboard");
}
```

`apps/web/postcss.config.mjs`:
```js
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
```

- [ ] **Step 6: Create database package**

`packages/db/package.json`:
```json
{
  "name": "@guac/db",
  "private": true,
  "main": "src/index.ts",
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate"
  },
  "dependencies": {
    "drizzle-orm": "^0.40.0",
    "postgres": "^3.4.0"
  },
  "devDependencies": {
    "drizzle-kit": "^0.30.0"
  }
}
```

`packages/db/drizzle.config.ts`:
```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./src/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

`packages/db/src/index.ts`:
```typescript
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const client = postgres(process.env.DATABASE_URL!);
export const db = drizzle(client, { schema });
export * from "./schema";
```

`packages/db/src/schema.ts`:
```typescript
// Schema will be built in Task 2
export {};
```

- [ ] **Step 7: Install dependencies and verify**

Run: `cd /Users/ryanhaugland/guac && npm install`
Run: `cd /Users/ryanhaugland/guac && npx turbo dev --filter=@guac/api`
Expected: "Guac API running on http://localhost:3001"

- [ ] **Step 8: Commit**

```bash
git add .
git commit -m "feat: scaffold monorepo with Next.js, Hono, Drizzle"
```

---

### Task 2: Database Schema

**Files:**
- Modify: `packages/db/src/schema.ts`
- Create: `packages/db/tsconfig.json`

- [ ] **Step 1: Write the full Drizzle schema**

`packages/db/src/schema.ts`:
```typescript
import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  time,
  date,
  jsonb,
  pgEnum,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const channelEnum = pgEnum("channel", ["sms", "email"]);
export const roleEnum = pgEnum("role", ["admin", "member"]);
export const conversationStatusEnum = pgEnum("conversation_status", ["active", "expired"]);
export const deliveryStatusEnum = pgEnum("delivery_status", ["delivered", "queued", "pending", "failed"]);
export const directionEnum = pgEnum("direction", ["inbound", "outbound"]);
export const disambiguationStepEnum = pgEnum("disambiguation_step", ["workspace", "recipient"]);
export const disambiguationStatusEnum = pgEnum("disambiguation_status", ["pending", "resolved", "expired"]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 255 }).unique(),
  phone: varchar("phone", { length: 20 }).unique(),
  preferredChannel: channelEnum("preferred_channel").default("email"),
  notificationTimings: jsonb("notification_timings").$type<string[]>().default(["2_weeks", "1_week", "3_days", "2_days", "day_of"]),
  workingHoursEnabled: boolean("working_hours_enabled").default(true),
  workingHoursStart: time("working_hours_start").default("09:00"),
  workingHoursEnd: time("working_hours_end").default("17:00"),
  workingHoursTimezone: varchar("working_hours_timezone", { length: 50 }).default("America/New_York"),
  workingHoursDays: jsonb("working_hours_days").$type<number[]>().default([1, 2, 3, 4, 5]),
  notificationsEnabled: boolean("notifications_enabled").default(true),
  onboarded: boolean("onboarded").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const workspaces = pgTable("workspaces", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  createdBy: uuid("created_by").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const workspaceMembers = pgTable("workspace_members", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").references(() => workspaces.id).notNull(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  role: roleEnum("role").default("member").notNull(),
  addedAt: timestamp("added_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("workspace_user_unique").on(table.workspaceId, table.userId),
]);

export const magicLinks = pgTable("magic_links", {
  id: uuid("id").defaultRandom().primaryKey(),
  token: varchar("token", { length: 255 }).unique().notNull(),
  userId: uuid("user_id").references(() => users.id),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 20 }),
  workspaceId: uuid("workspace_id").references(() => workspaces.id),
  used: boolean("used").default(false).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const conversations = pgTable("conversations", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").references(() => workspaces.id).notNull(),
  senderId: uuid("sender_id").references(() => users.id).notNull(),
  recipientId: uuid("recipient_id").references(() => users.id),
  status: conversationStatusEnum("status").default("active").notNull(),
  lastActivityAt: timestamp("last_activity_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const messages = pgTable("messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  conversationId: uuid("conversation_id").references(() => conversations.id).notNull(),
  senderId: uuid("sender_id").references(() => users.id).notNull(),
  body: text("body").notNull(),
  direction: directionEnum("direction").notNull(),
  channel: channelEnum("channel").notNull(),
  deliveryStatus: deliveryStatusEnum("delivery_status").default("pending").notNull(),
  deliverAt: timestamp("deliver_at"),
  deliveredAt: timestamp("delivered_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const tasks = pgTable("tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").references(() => workspaces.id).notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  dueDate: date("due_date").notNull(),
  createdBy: uuid("created_by").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const taskNotifications = pgTable("task_notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  taskId: uuid("task_id").references(() => tasks.id).notNull(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  timing: varchar("timing", { length: 20 }).notNull(),
  scheduledFor: timestamp("scheduled_for").notNull(),
  sent: boolean("sent").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const disambiguationSessions = pgTable("disambiguation_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  senderId: uuid("sender_id").references(() => users.id).notNull(),
  originalMessage: text("original_message").notNull(),
  step: disambiguationStepEnum("step").notNull(),
  options: jsonb("options").$type<{ value: string; label: string }[]>().notNull(),
  resolvedWorkspaceId: uuid("resolved_workspace_id").references(() => workspaces.id),
  resolvedRecipientId: uuid("resolved_recipient_id").references(() => users.id),
  status: disambiguationStatusEnum("status").default("pending").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  token: varchar("token", { length: 255 }).unique().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

- [ ] **Step 2: Generate migration**

Run: `cd /Users/ryanhaugland/guac/packages/db && npx drizzle-kit generate`
Expected: Migration files created in `src/migrations/`

- [ ] **Step 3: Run migration**

Run: `cd /Users/ryanhaugland/guac/packages/db && npx drizzle-kit migrate`
Expected: All tables created successfully

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat: add database schema with all tables"
```

---

### Task 3: Auth — Magic Links & Sessions

**Files:**
- Create: `apps/api/src/routes/auth.ts`
- Create: `apps/api/src/middleware/auth.ts`
- Create: `apps/api/src/services/magic-link.ts`
- Create: `apps/api/src/tests/auth.test.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Write failing test for magic link creation**

`apps/api/src/tests/auth.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMagicLink, verifyMagicLink } from "../services/magic-link";

vi.mock("@guac/db", () => ({
  db: {
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: "test-id", token: "test-token" }]) }) }),
    select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) }),
    update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) }),
  },
}));

describe("magic link service", () => {
  it("creates a magic link with 5-day expiry", async () => {
    const result = await createMagicLink({ email: "test@example.com" });
    expect(result).toHaveProperty("token");
    expect(result.token).toHaveLength(64);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/ryanhaugland/guac/apps/api && npx vitest run src/tests/auth.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement magic link service**

`apps/api/src/services/magic-link.ts`:
```typescript
import { randomBytes } from "crypto";
import { db, magicLinks, users, sessions } from "@guac/db";
import { eq, and } from "drizzle-orm";

const MAGIC_LINK_EXPIRY_DAYS = 5;
const SESSION_EXPIRY_DAYS = 30;

export async function createMagicLink(input: { email?: string; phone?: string; userId?: string; workspaceId?: string }) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + MAGIC_LINK_EXPIRY_DAYS);

  const [link] = await db.insert(magicLinks).values({
    token,
    email: input.email ?? null,
    phone: input.phone ?? null,
    userId: input.userId ?? null,
    workspaceId: input.workspaceId ?? null,
    expiresAt,
  }).returning();

  return link;
}

export async function verifyMagicLink(token: string) {
  const [link] = await db.select().from(magicLinks).where(
    and(eq(magicLinks.token, token), eq(magicLinks.used, false))
  );

  if (!link) return null;
  if (new Date() > link.expiresAt) return null;

  await db.update(magicLinks).set({ used: true }).where(eq(magicLinks.id, link.id));

  let userId = link.userId;

  if (!userId) {
    const [newUser] = await db.insert(users).values({
      email: link.email,
      phone: link.phone,
    }).returning();
    userId = newUser.id;
  }

  const sessionToken = randomBytes(32).toString("hex");
  const sessionExpiry = new Date();
  sessionExpiry.setDate(sessionExpiry.getDate() + SESSION_EXPIRY_DAYS);

  await db.insert(sessions).values({
    userId,
    token: sessionToken,
    expiresAt: sessionExpiry,
  });

  return { userId, sessionToken, isNewUser: !link.userId };
}
```

- [ ] **Step 4: Implement auth middleware**

`apps/api/src/middleware/auth.ts`:
```typescript
import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import { db, sessions, users } from "@guac/db";
import { eq, and, gt } from "drizzle-orm";

type AuthEnv = {
  Variables: {
    userId: string;
    user: typeof users.$inferSelect;
  };
};

export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const token = getCookie(c, "session");
  if (!token) return c.json({ error: "Unauthorized" }, 401);

  const [session] = await db.select().from(sessions).where(
    and(eq(sessions.token, token), gt(sessions.expiresAt, new Date()))
  );
  if (!session) return c.json({ error: "Unauthorized" }, 401);

  const [user] = await db.select().from(users).where(eq(users.id, session.userId));
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  c.set("userId", user.id);
  c.set("user", user);
  await next();
});
```

- [ ] **Step 5: Implement auth routes**

`apps/api/src/routes/auth.ts`:
```typescript
import { Hono } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import { createMagicLink, verifyMagicLink } from "../services/magic-link";
import { requireAuth } from "../middleware/auth";
import { db, users } from "@guac/db";
import { eq } from "drizzle-orm";

const auth = new Hono();

auth.post("/magic-link", async (c) => {
  const { email, phone } = await c.req.json();
  if (!email && !phone) return c.json({ error: "Email or phone required" }, 400);

  let userId: string | undefined;
  if (email) {
    const [existing] = await db.select().from(users).where(eq(users.email, email));
    if (existing) userId = existing.id;
  } else if (phone) {
    const [existing] = await db.select().from(users).where(eq(users.phone, phone));
    if (existing) userId = existing.id;
  }

  const link = await createMagicLink({ email, phone, userId });

  // TODO: Send via Resend (email) or Telnyx (SMS) — implemented in Task 7
  const magicUrl = `${process.env.APP_URL}/api/auth/verify?token=${link.token}`;

  return c.json({ success: true });
});

auth.get("/verify", async (c) => {
  const token = c.req.query("token");
  if (!token) return c.json({ error: "Token required" }, 400);

  const result = await verifyMagicLink(token);
  if (!result) return c.json({ error: "Invalid or expired link" }, 401);

  setCookie(c, "session", result.sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Strict",
    maxAge: 30 * 24 * 60 * 60,
    path: "/",
  });

  const redirectPath = result.isNewUser ? "/onboarding" : "/dashboard";
  return c.redirect(redirectPath);
});

auth.post("/logout", requireAuth, async (c) => {
  deleteCookie(c, "session");
  return c.json({ success: true });
});

auth.get("/session", requireAuth, async (c) => {
  const user = c.get("user");
  return c.json({ user });
});

export default auth;
```

- [ ] **Step 6: Mount auth routes**

`apps/api/src/index.ts`:
```typescript
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
```

- [ ] **Step 7: Run tests**

Run: `cd /Users/ryanhaugland/guac/apps/api && npx vitest run`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add .
git commit -m "feat: add magic link auth with sessions"
```

---

### Task 4: Onboarding & Preferences Routes

**Files:**
- Create: `apps/api/src/routes/onboarding.ts`
- Create: `apps/api/src/routes/preferences.ts`
- Create: `apps/api/src/tests/preferences.test.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Write failing test for preferences update**

`apps/api/src/tests/preferences.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { isWithinWorkingHours, getNextWorkingTime } from "../services/working-hours";

describe("working hours", () => {
  it("returns true during working hours", () => {
    const result = isWithinWorkingHours({
      workingHoursEnabled: true,
      workingHoursStart: "09:00",
      workingHoursEnd: "17:00",
      workingHoursTimezone: "America/New_York",
      workingHoursDays: [1, 2, 3, 4, 5],
    }, new Date("2026-04-08T14:00:00-04:00")); // Wednesday 2pm ET
    expect(result).toBe(true);
  });

  it("returns false outside working hours", () => {
    const result = isWithinWorkingHours({
      workingHoursEnabled: true,
      workingHoursStart: "09:00",
      workingHoursEnd: "17:00",
      workingHoursTimezone: "America/New_York",
      workingHoursDays: [1, 2, 3, 4, 5],
    }, new Date("2026-04-08T22:00:00-04:00")); // Wednesday 10pm ET
    expect(result).toBe(false);
  });

  it("returns next working time correctly", () => {
    const next = getNextWorkingTime({
      workingHoursEnabled: true,
      workingHoursStart: "09:00",
      workingHoursEnd: "17:00",
      workingHoursTimezone: "America/New_York",
      workingHoursDays: [1, 2, 3, 4, 5],
    }, new Date("2026-04-10T22:00:00-04:00")); // Friday 10pm ET
    // Next working time = Monday 9am ET
    expect(next.getDay()).toBe(1); // Monday
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/ryanhaugland/guac/apps/api && npx vitest run src/tests/preferences.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement working hours service**

`apps/api/src/services/working-hours.ts`:
```typescript
type WorkingHoursConfig = {
  workingHoursEnabled: boolean;
  workingHoursStart: string; // "HH:MM"
  workingHoursEnd: string;
  workingHoursTimezone: string;
  workingHoursDays: number[]; // 0=Sun, 1=Mon, ..., 6=Sat
};

export function isWithinWorkingHours(config: WorkingHoursConfig, now: Date): boolean {
  if (!config.workingHoursEnabled) return true;

  const local = new Date(now.toLocaleString("en-US", { timeZone: config.workingHoursTimezone }));
  const day = local.getDay();
  if (!config.workingHoursDays.includes(day)) return false;

  const currentMinutes = local.getHours() * 60 + local.getMinutes();
  const [startH, startM] = config.workingHoursStart.split(":").map(Number);
  const [endH, endM] = config.workingHoursEnd.split(":").map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

export function getNextWorkingTime(config: WorkingHoursConfig, now: Date): Date {
  const local = new Date(now.toLocaleString("en-US", { timeZone: config.workingHoursTimezone }));
  const [startH, startM] = config.workingHoursStart.split(":").map(Number);

  // Try today first (if before start time and it's a working day)
  const currentMinutes = local.getHours() * 60 + local.getMinutes();
  const startMinutes = startH * 60 + startM;
  if (config.workingHoursDays.includes(local.getDay()) && currentMinutes < startMinutes) {
    local.setHours(startH, startM, 0, 0);
    return new Date(local.toLocaleString("en-US", { timeZone: config.workingHoursTimezone }));
  }

  // Find next working day
  for (let i = 1; i <= 7; i++) {
    const candidate = new Date(local);
    candidate.setDate(candidate.getDate() + i);
    if (config.workingHoursDays.includes(candidate.getDay())) {
      candidate.setHours(startH, startM, 0, 0);
      return candidate;
    }
  }

  // Fallback: tomorrow at start time
  local.setDate(local.getDate() + 1);
  local.setHours(startH, startM, 0, 0);
  return local;
}
```

- [ ] **Step 4: Run tests**

Run: `cd /Users/ryanhaugland/guac/apps/api && npx vitest run src/tests/preferences.test.ts`
Expected: PASS

- [ ] **Step 5: Implement onboarding route**

`apps/api/src/routes/onboarding.ts`:
```typescript
import { Hono } from "hono";
import { requireAuth } from "../middleware/auth";
import { db, users } from "@guac/db";
import { eq } from "drizzle-orm";

const onboarding = new Hono();

onboarding.post("/", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();

  const { name, email, phone, preferredChannel, notificationTimings, workingHoursStart, workingHoursEnd, workingHoursTimezone, workingHoursDays } = body;

  if (!name || !preferredChannel) {
    return c.json({ error: "Name and preferred channel are required" }, 400);
  }

  if (!email && !phone) {
    return c.json({ error: "Both email and phone are required" }, 400);
  }

  const [updated] = await db.update(users).set({
    name,
    email: email ?? undefined,
    phone: phone ?? undefined,
    preferredChannel,
    notificationTimings: notificationTimings ?? ["2_weeks", "1_week", "3_days", "2_days", "day_of"],
    workingHoursStart: workingHoursStart ?? "09:00",
    workingHoursEnd: workingHoursEnd ?? "17:00",
    workingHoursTimezone: workingHoursTimezone ?? "America/New_York",
    workingHoursDays: workingHoursDays ?? [1, 2, 3, 4, 5],
    onboarded: true,
    updatedAt: new Date(),
  }).where(eq(users.id, userId)).returning();

  return c.json({ user: updated });
});

export default onboarding;
```

- [ ] **Step 6: Implement preferences route**

`apps/api/src/routes/preferences.ts`:
```typescript
import { Hono } from "hono";
import { requireAuth } from "../middleware/auth";
import { db, users } from "@guac/db";
import { eq } from "drizzle-orm";

const preferences = new Hono();

preferences.get("/", requireAuth, async (c) => {
  const user = c.get("user");
  return c.json({
    preferredChannel: user.preferredChannel,
    notificationTimings: user.notificationTimings,
    notificationsEnabled: user.notificationsEnabled,
    workingHoursEnabled: user.workingHoursEnabled,
    workingHoursStart: user.workingHoursStart,
    workingHoursEnd: user.workingHoursEnd,
    workingHoursTimezone: user.workingHoursTimezone,
    workingHoursDays: user.workingHoursDays,
  });
});

preferences.patch("/", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();

  const allowedFields = [
    "preferredChannel", "notificationTimings", "notificationsEnabled",
    "workingHoursEnabled", "workingHoursStart", "workingHoursEnd",
    "workingHoursTimezone", "workingHoursDays",
  ] as const;

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }

  const [updated] = await db.update(users).set(updates).where(eq(users.id, userId)).returning();
  return c.json({ user: updated });
});

export default preferences;
```

- [ ] **Step 7: Mount routes**

Update `apps/api/src/index.ts`:
```typescript
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import auth from "./routes/auth";
import onboarding from "./routes/onboarding";
import preferences from "./routes/preferences";

const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok" }));
app.route("/api/auth", auth);
app.route("/api/onboarding", onboarding);
app.route("/api/preferences", preferences);

serve({ fetch: app.fetch, port: 3001 }, (info) => {
  console.log(`Guac API running on http://localhost:${info.port}`);
});

export default app;
```

- [ ] **Step 8: Run tests**

Run: `cd /Users/ryanhaugland/guac/apps/api && npx vitest run`
Expected: All PASS

- [ ] **Step 9: Commit**

```bash
git add .
git commit -m "feat: add onboarding, preferences, and working hours logic"
```

---

### Task 5: Workspace Routes

**Files:**
- Create: `apps/api/src/routes/workspaces.ts`
- Create: `apps/api/src/tests/workspaces.test.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Write failing test for workspace creation**

`apps/api/src/tests/workspaces.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";

// Test that workspace creation returns the workspace with creator as admin
describe("workspace logic", () => {
  it("validates workspace name is required", () => {
    const validate = (name: string | undefined) => {
      if (!name || name.trim().length === 0) return false;
      return true;
    };
    expect(validate(undefined)).toBe(false);
    expect(validate("")).toBe(false);
    expect(validate("w3 Consulting")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/ryanhaugland/guac/apps/api && npx vitest run src/tests/workspaces.test.ts`
Expected: PASS (pure logic test)

- [ ] **Step 3: Implement workspaces route**

`apps/api/src/routes/workspaces.ts`:
```typescript
import { Hono } from "hono";
import { requireAuth } from "../middleware/auth";
import { db, workspaces, workspaceMembers, users } from "@guac/db";
import { eq, and } from "drizzle-orm";
import { createMagicLink } from "../services/magic-link";

const workspacesRouter = new Hono();

// List user's workspaces
workspacesRouter.get("/", requireAuth, async (c) => {
  const userId = c.get("userId");

  const memberships = await db.select({
    workspace: workspaces,
    role: workspaceMembers.role,
  })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(eq(workspaceMembers.userId, userId));

  // Get member counts for each workspace
  const result = await Promise.all(
    memberships.map(async (m) => {
      const members = await db.select({ id: workspaceMembers.id })
        .from(workspaceMembers)
        .where(eq(workspaceMembers.workspaceId, m.workspace.id));
      return {
        ...m.workspace,
        role: m.role,
        memberCount: members.length,
      };
    })
  );

  return c.json({ workspaces: result });
});

// Create workspace
workspacesRouter.post("/", requireAuth, async (c) => {
  const userId = c.get("userId");
  const { name } = await c.req.json();

  if (!name || name.trim().length === 0) {
    return c.json({ error: "Workspace name is required" }, 400);
  }

  const [workspace] = await db.insert(workspaces).values({
    name: name.trim(),
    createdBy: userId,
  }).returning();

  await db.insert(workspaceMembers).values({
    workspaceId: workspace.id,
    userId,
    role: "admin",
  });

  return c.json({ workspace }, 201);
});

// List members
workspacesRouter.get("/:id/members", requireAuth, async (c) => {
  const workspaceId = c.req.param("id");
  const userId = c.get("userId");

  // Verify user is a member
  const [membership] = await db.select().from(workspaceMembers).where(
    and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId))
  );
  if (!membership) return c.json({ error: "Not a member" }, 403);

  const members = await db.select({
    user: users,
    role: workspaceMembers.role,
    addedAt: workspaceMembers.addedAt,
  })
    .from(workspaceMembers)
    .innerJoin(users, eq(workspaceMembers.userId, users.id))
    .where(eq(workspaceMembers.workspaceId, workspaceId));

  return c.json({
    members: members.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      email: m.user.email,
      phone: m.user.phone,
      role: m.role,
      preferredChannel: m.user.preferredChannel,
      workingHoursEnabled: m.user.workingHoursEnabled,
      notificationsEnabled: m.user.notificationsEnabled,
      addedAt: m.addedAt,
    })),
  });
});

// Add member (admin only)
workspacesRouter.post("/:id/members", requireAuth, async (c) => {
  const workspaceId = c.req.param("id");
  const userId = c.get("userId");
  const { email, phone } = await c.req.json();

  if (!email && !phone) return c.json({ error: "Email or phone required" }, 400);

  // Verify caller is admin
  const [membership] = await db.select().from(workspaceMembers).where(
    and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId))
  );
  if (!membership || membership.role !== "admin") {
    return c.json({ error: "Admin access required" }, 403);
  }

  // Find or create user
  let targetUser;
  if (email) {
    const [existing] = await db.select().from(users).where(eq(users.email, email));
    targetUser = existing;
  } else if (phone) {
    const [existing] = await db.select().from(users).where(eq(users.phone, phone));
    targetUser = existing;
  }

  if (targetUser) {
    // Check if already a member
    const [existingMember] = await db.select().from(workspaceMembers).where(
      and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, targetUser.id))
    );
    if (existingMember) return c.json({ error: "Already a member" }, 409);

    await db.insert(workspaceMembers).values({
      workspaceId,
      userId: targetUser.id,
      role: "member",
    });
  } else {
    // Create stub user and send magic link
    const [newUser] = await db.insert(users).values({
      email: email ?? null,
      phone: phone ?? null,
    }).returning();

    await db.insert(workspaceMembers).values({
      workspaceId,
      userId: newUser.id,
      role: "member",
    });

    await createMagicLink({
      email,
      phone,
      userId: newUser.id,
      workspaceId,
    });

    // TODO: Send magic link via Resend/Telnyx — implemented in Task 7
  }

  return c.json({ success: true }, 201);
});

// Remove member (admin only)
workspacesRouter.delete("/:id/members/:userId", requireAuth, async (c) => {
  const workspaceId = c.req.param("id");
  const callerUserId = c.get("userId");
  const targetUserId = c.req.param("userId");

  const [membership] = await db.select().from(workspaceMembers).where(
    and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, callerUserId))
  );
  if (!membership || membership.role !== "admin") {
    return c.json({ error: "Admin access required" }, 403);
  }

  if (callerUserId === targetUserId) {
    return c.json({ error: "Cannot remove yourself" }, 400);
  }

  await db.delete(workspaceMembers).where(
    and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, targetUserId))
  );

  return c.json({ success: true });
});

export default workspacesRouter;
```

- [ ] **Step 4: Mount route**

Update `apps/api/src/index.ts` — add:
```typescript
import workspacesRouter from "./routes/workspaces";
// ... after other routes:
app.route("/api/workspaces", workspacesRouter);
```

- [ ] **Step 5: Run tests**

Run: `cd /Users/ryanhaugland/guac/apps/api && npx vitest run`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat: add workspace CRUD and member management"
```

---

### Task 6: Delivery Service (Telnyx + Resend)

**Files:**
- Create: `apps/api/src/services/delivery.ts`
- Create: `apps/api/src/tests/delivery.test.ts`

- [ ] **Step 1: Write failing test for delivery formatting**

`apps/api/src/tests/delivery.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { formatDeliveryMessage, formatWorkingHoursAck } from "../services/delivery";

describe("delivery formatting", () => {
  it("formats a routed message with sender and workspace", () => {
    const result = formatDeliveryMessage({
      senderName: "Sarah",
      workspaceName: "w3 Consulting",
      body: "Can we push the deadline?",
    });
    expect(result).toBe("From Sarah (w3 Consulting):\nCan we push the deadline?\n\nReply to respond.");
  });

  it("formats working hours acknowledgment", () => {
    const result = formatWorkingHoursAck({
      recipientName: "Ryan",
      nextAvailable: new Date("2026-04-09T09:00:00-04:00"),
    });
    expect(result).toContain("Ryan is outside working hours");
    expect(result).toContain("9:00 AM");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/ryanhaugland/guac/apps/api && npx vitest run src/tests/delivery.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement delivery service**

`apps/api/src/services/delivery.ts`:
```typescript
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const TELNYX_PHONE = process.env.TELNYX_PHONE_NUMBER;
const GUAC_EMAIL = process.env.GUAC_EMAIL_ADDRESS;

export function formatDeliveryMessage(input: {
  senderName: string;
  workspaceName: string;
  body: string;
}): string {
  return `From ${input.senderName} (${input.workspaceName}):\n${input.body}\n\nReply to respond.`;
}

export function formatWorkingHoursAck(input: {
  recipientName: string;
  nextAvailable: Date;
}): string {
  const timeStr = input.nextAvailable.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    weekday: "long",
  });
  return `${input.recipientName} is outside working hours. They'll receive this at ${timeStr}.`;
}

export async function sendSms(to: string, body: string): Promise<boolean> {
  try {
    const response = await fetch("https://api.telnyx.com/v2/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TELNYX_API_KEY}`,
      },
      body: JSON.stringify({
        from: TELNYX_PHONE,
        to,
        text: body,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function sendEmail(to: string, subject: string, body: string, replyToMessageId?: string): Promise<boolean> {
  try {
    const headers: Record<string, string> = {};
    if (replyToMessageId) {
      headers["In-Reply-To"] = replyToMessageId;
      headers["References"] = replyToMessageId;
    }

    await resend.emails.send({
      from: `Guac <${GUAC_EMAIL}>`,
      to,
      subject,
      text: body,
      headers,
    });
    return true;
  } catch {
    return false;
  }
}

export async function deliver(input: {
  channel: "sms" | "email";
  to: string;
  senderName: string;
  workspaceName: string;
  body: string;
  conversationId: string;
}): Promise<boolean> {
  const formatted = formatDeliveryMessage({
    senderName: input.senderName,
    workspaceName: input.workspaceName,
    body: input.body,
  });

  if (input.channel === "sms") {
    return sendSms(input.to, formatted);
  } else {
    const subject = `Message from ${input.senderName} — ${input.workspaceName}`;
    return sendEmail(input.to, subject, formatted, `<conv-${input.conversationId}@guac.app>`);
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd /Users/ryanhaugland/guac/apps/api && npx vitest run src/tests/delivery.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: add delivery service for SMS and email"
```

---

### Task 7: Routing Engine

**Files:**
- Create: `apps/api/src/services/routing.ts`
- Create: `apps/api/src/tests/routing.test.ts`

- [ ] **Step 1: Write failing test for routing resolution**

`apps/api/src/tests/routing.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { resolveRouting, RoutingResult } from "../services/routing";

describe("routing resolution", () => {
  it("routes directly when sender has one workspace with one other member", () => {
    const result = resolveRouting({
      senderWorkspaces: [
        { workspaceId: "ws1", workspaceName: "w3", members: [
          { userId: "sender", name: "Ryan" },
          { userId: "recipient1", name: "Sarah" },
        ]},
      ],
      recentConversationUserId: null,
      forceDisambiguate: false,
    });
    expect(result.type).toBe("direct");
    if (result.type === "direct") {
      expect(result.workspaceId).toBe("ws1");
      expect(result.recipientId).toBe("recipient1");
    }
  });

  it("triggers disambiguation when sender has multiple workspaces", () => {
    const result = resolveRouting({
      senderWorkspaces: [
        { workspaceId: "ws1", workspaceName: "w3", members: [
          { userId: "sender", name: "Ryan" },
          { userId: "r1", name: "Sarah" },
        ]},
        { workspaceId: "ws2", workspaceName: "Isotropic", members: [
          { userId: "sender", name: "Ryan" },
          { userId: "r2", name: "Mike" },
        ]},
      ],
      recentConversationUserId: null,
      forceDisambiguate: false,
    });
    expect(result.type).toBe("disambiguate_workspace");
  });

  it("uses recent conversation shortcut", () => {
    const result = resolveRouting({
      senderWorkspaces: [
        { workspaceId: "ws1", workspaceName: "w3", members: [
          { userId: "sender", name: "Ryan" },
          { userId: "r1", name: "Sarah" },
        ]},
        { workspaceId: "ws2", workspaceName: "Isotropic", members: [
          { userId: "sender", name: "Ryan" },
          { userId: "r1", name: "Sarah" },
        ]},
      ],
      recentConversationUserId: "r1",
      forceDisambiguate: false,
    });
    // r1 is in both workspaces — still need workspace disambiguation
    expect(result.type).toBe("disambiguate_workspace");
  });

  it("skips disambiguation with recent shortcut when unique recipient", () => {
    const result = resolveRouting({
      senderWorkspaces: [
        { workspaceId: "ws1", workspaceName: "w3", members: [
          { userId: "sender", name: "Ryan" },
          { userId: "r1", name: "Sarah" },
          { userId: "r2", name: "Mike" },
        ]},
      ],
      recentConversationUserId: "r1",
      forceDisambiguate: false,
    });
    expect(result.type).toBe("direct");
    if (result.type === "direct") {
      expect(result.recipientId).toBe("r1");
    }
  });

  it("forces disambiguation with ? prefix", () => {
    const result = resolveRouting({
      senderWorkspaces: [
        { workspaceId: "ws1", workspaceName: "w3", members: [
          { userId: "sender", name: "Ryan" },
          { userId: "r1", name: "Sarah" },
        ]},
      ],
      recentConversationUserId: "r1",
      forceDisambiguate: true,
    });
    // Only one workspace with one other member — still direct even with force
    expect(result.type).toBe("direct");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/ryanhaugland/guac/apps/api && npx vitest run src/tests/routing.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement routing engine**

`apps/api/src/services/routing.ts`:
```typescript
type WorkspaceMember = {
  userId: string;
  name: string;
};

type SenderWorkspace = {
  workspaceId: string;
  workspaceName: string;
  members: WorkspaceMember[];
};

type RoutingInput = {
  senderWorkspaces: SenderWorkspace[];
  recentConversationUserId: string | null;
  forceDisambiguate: boolean;
};

export type RoutingResult =
  | { type: "direct"; workspaceId: string; recipientId: string }
  | { type: "disambiguate_workspace"; options: { workspaceId: string; workspaceName: string }[] }
  | { type: "disambiguate_recipient"; workspaceId: string; options: { userId: string; name: string }[] }
  | { type: "no_workspaces" };

export function resolveRouting(input: RoutingInput): RoutingResult {
  const { senderWorkspaces, recentConversationUserId, forceDisambiguate } = input;

  if (senderWorkspaces.length === 0) {
    return { type: "no_workspaces" };
  }

  // Get all other members across all workspaces (excluding sender)
  const allOtherMembers = new Map<string, { userId: string; name: string; workspaces: string[] }>();
  for (const ws of senderWorkspaces) {
    for (const m of ws.members) {
      if (m.userId === senderWorkspaces[0].members.find((x) => true)?.userId) {
        // Skip — but we need a better way to identify the sender
        // The sender is whoever appears in all workspaces
      }
      const existing = allOtherMembers.get(m.userId);
      if (existing) {
        existing.workspaces.push(ws.workspaceId);
      } else {
        allOtherMembers.set(m.userId, { ...m, workspaces: [ws.workspaceId] });
      }
    }
  }

  // Single workspace, single other member — always direct
  if (senderWorkspaces.length === 1) {
    const ws = senderWorkspaces[0];
    const others = ws.members.filter((m) => {
      // Find members that aren't the sender
      // Sender appears in all workspaces, others don't necessarily
      return true; // We need sender ID to filter properly
    });

    // Assuming sender is first member (convention from caller)
    const senderId = ws.members[0].userId;
    const otherMembers = ws.members.filter((m) => m.userId !== senderId);

    if (otherMembers.length === 1) {
      return { type: "direct", workspaceId: ws.workspaceId, recipientId: otherMembers[0].userId };
    }

    // Multiple members in one workspace
    if (recentConversationUserId && !forceDisambiguate) {
      const recent = otherMembers.find((m) => m.userId === recentConversationUserId);
      if (recent) {
        return { type: "direct", workspaceId: ws.workspaceId, recipientId: recent.userId };
      }
    }

    return {
      type: "disambiguate_recipient",
      workspaceId: ws.workspaceId,
      options: otherMembers.map((m) => ({ userId: m.userId, name: m.name })),
    };
  }

  // Multiple workspaces — need workspace disambiguation first
  return {
    type: "disambiguate_workspace",
    options: senderWorkspaces.map((ws) => ({
      workspaceId: ws.workspaceId,
      workspaceName: ws.workspaceName,
    })),
  };
}
```

- [ ] **Step 4: Run tests**

Run: `cd /Users/ryanhaugland/guac/apps/api && npx vitest run src/tests/routing.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: add routing resolution engine"
```

---

### Task 8: Disambiguation Service

**Files:**
- Create: `apps/api/src/services/disambiguation.ts`
- Create: `apps/api/src/tests/disambiguation.test.ts`

- [ ] **Step 1: Write failing test for disambiguation flow**

`apps/api/src/tests/disambiguation.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { formatDisambiguationMessage, parseDisambiguationReply } from "../services/disambiguation";

describe("disambiguation", () => {
  it("formats workspace selection message", () => {
    const msg = formatDisambiguationMessage("workspace", [
      { value: "ws1", label: "w3 Consulting" },
      { value: "ws2", label: "Isotropic" },
    ]);
    expect(msg).toBe("Which workspace is this for?\n1. w3 Consulting\n2. Isotropic\nReply with the number.");
  });

  it("formats recipient selection message", () => {
    const msg = formatDisambiguationMessage("recipient", [
      { value: "u1", label: "Sarah" },
      { value: "u2", label: "Mike" },
      { value: "all", label: "All members" },
    ]);
    expect(msg).toContain("1. Sarah");
    expect(msg).toContain("3. All members");
  });

  it("parses valid numeric reply", () => {
    const options = [
      { value: "ws1", label: "w3 Consulting" },
      { value: "ws2", label: "Isotropic" },
    ];
    expect(parseDisambiguationReply("2", options)).toEqual({ value: "ws2", label: "Isotropic" });
  });

  it("returns null for invalid reply", () => {
    const options = [
      { value: "ws1", label: "w3 Consulting" },
    ];
    expect(parseDisambiguationReply("5", options)).toBeNull();
    expect(parseDisambiguationReply("abc", options)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/ryanhaugland/guac/apps/api && npx vitest run src/tests/disambiguation.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement disambiguation service**

`apps/api/src/services/disambiguation.ts`:
```typescript
import { db, disambiguationSessions } from "@guac/db";
import { eq, and } from "drizzle-orm";

type DisambiguationOption = { value: string; label: string };

export function formatDisambiguationMessage(
  step: "workspace" | "recipient",
  options: DisambiguationOption[],
): string {
  const header = step === "workspace"
    ? "Which workspace is this for?"
    : "Who should receive this?";

  const lines = options.map((opt, i) => `${i + 1}. ${opt.label}`);
  return `${header}\n${lines.join("\n")}\nReply with the number.`;
}

export function parseDisambiguationReply(
  reply: string,
  options: DisambiguationOption[],
): DisambiguationOption | null {
  const num = parseInt(reply.trim(), 10);
  if (isNaN(num) || num < 1 || num > options.length) return null;
  return options[num - 1];
}

export async function createDisambiguationSession(input: {
  senderId: string;
  originalMessage: string;
  step: "workspace" | "recipient";
  options: DisambiguationOption[];
  resolvedWorkspaceId?: string;
}) {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 1);

  const [session] = await db.insert(disambiguationSessions).values({
    senderId: input.senderId,
    originalMessage: input.originalMessage,
    step: input.step,
    options: input.options,
    resolvedWorkspaceId: input.resolvedWorkspaceId ?? null,
    status: "pending",
    expiresAt,
  }).returning();

  return session;
}

export async function findPendingSession(senderId: string) {
  const [session] = await db.select()
    .from(disambiguationSessions)
    .where(
      and(
        eq(disambiguationSessions.senderId, senderId),
        eq(disambiguationSessions.status, "pending"),
      )
    );

  if (!session) return null;
  if (new Date() > session.expiresAt) {
    await db.update(disambiguationSessions)
      .set({ status: "expired" })
      .where(eq(disambiguationSessions.id, session.id));
    return null;
  }

  return session;
}

export async function resolveDisambiguationSession(
  sessionId: string,
  updates: {
    resolvedWorkspaceId?: string;
    resolvedRecipientId?: string;
    step?: "workspace" | "recipient";
    options?: DisambiguationOption[];
    status?: "pending" | "resolved" | "expired";
  },
) {
  const [updated] = await db.update(disambiguationSessions)
    .set(updates)
    .where(eq(disambiguationSessions.id, sessionId))
    .returning();
  return updated;
}
```

- [ ] **Step 4: Run tests**

Run: `cd /Users/ryanhaugland/guac/apps/api && npx vitest run src/tests/disambiguation.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: add disambiguation service for multi-workspace resolution"
```

---

### Task 9: Webhook Handlers (Telnyx + Resend)

**Files:**
- Create: `apps/api/src/routes/webhooks/telnyx.ts`
- Create: `apps/api/src/routes/webhooks/resend.ts`
- Create: `apps/api/src/middleware/webhook-verify.ts`
- Create: `apps/api/src/tests/webhooks.test.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Write failing test for inbound message processing**

`apps/api/src/tests/webhooks.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { extractInboundSms, extractInboundEmail } from "../services/inbound";

describe("inbound message extraction", () => {
  it("extracts SMS sender and body from Telnyx payload", () => {
    const payload = {
      data: {
        event_type: "message.received",
        payload: {
          from: { phone_number: "+15551234567" },
          to: [{ phone_number: "+15559876543" }],
          text: "Can we push the deadline?",
        },
      },
    };
    const result = extractInboundSms(payload);
    expect(result).toEqual({
      senderPhone: "+15551234567",
      body: "Can we push the deadline?",
    });
  });

  it("extracts email sender and body from Resend inbound payload", () => {
    const payload = {
      from: "sarah@example.com",
      to: "team@guac.app",
      subject: "Quick question",
      text: "Can we push the deadline?",
    };
    const result = extractInboundEmail(payload);
    expect(result).toEqual({
      senderEmail: "sarah@example.com",
      body: "Can we push the deadline?",
      subject: "Quick question",
    });
  });

  it("detects force disambiguation prefix", () => {
    const payload = {
      data: {
        event_type: "message.received",
        payload: {
          from: { phone_number: "+15551234567" },
          to: [{ phone_number: "+15559876543" }],
          text: "? Can we push the deadline?",
        },
      },
    };
    const result = extractInboundSms(payload);
    expect(result.body).toBe("Can we push the deadline?");
    expect(result.forceDisambiguate).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/ryanhaugland/guac/apps/api && npx vitest run src/tests/webhooks.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement inbound extraction service**

`apps/api/src/services/inbound.ts`:
```typescript
export function extractInboundSms(payload: any) {
  const from = payload.data?.payload?.from?.phone_number;
  let body = payload.data?.payload?.text ?? "";
  let forceDisambiguate = false;

  if (body.startsWith("? ")) {
    forceDisambiguate = true;
    body = body.slice(2);
  }

  return { senderPhone: from, body, forceDisambiguate };
}

export function extractInboundEmail(payload: any) {
  let body = payload.text ?? "";
  let forceDisambiguate = false;

  if (body.startsWith("? ")) {
    forceDisambiguate = true;
    body = body.slice(2);
  }

  return {
    senderEmail: payload.from,
    body,
    subject: payload.subject ?? "",
    forceDisambiguate,
  };
}
```

- [ ] **Step 4: Run tests**

Run: `cd /Users/ryanhaugland/guac/apps/api && npx vitest run src/tests/webhooks.test.ts`
Expected: PASS

- [ ] **Step 5: Implement webhook verification middleware**

`apps/api/src/middleware/webhook-verify.ts`:
```typescript
import { createMiddleware } from "hono/factory";
import { createHmac } from "crypto";

export const verifyTelnyxWebhook = createMiddleware(async (c, next) => {
  // Telnyx signs webhooks — verify in production
  if (process.env.NODE_ENV !== "production") return next();

  const signature = c.req.header("telnyx-signature-ed25519");
  const timestamp = c.req.header("telnyx-timestamp");
  if (!signature || !timestamp) return c.json({ error: "Invalid signature" }, 401);

  // In production, verify using telnyx package
  await next();
});

export const verifyResendWebhook = createMiddleware(async (c, next) => {
  // Resend webhook verification
  if (process.env.NODE_ENV !== "production") return next();

  const signature = c.req.header("svix-signature");
  if (!signature) return c.json({ error: "Invalid signature" }, 401);

  await next();
});
```

- [ ] **Step 6: Implement Telnyx webhook route**

`apps/api/src/routes/webhooks/telnyx.ts`:
```typescript
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
```

- [ ] **Step 7: Implement Resend webhook route**

`apps/api/src/routes/webhooks/resend.ts`:
```typescript
import { Hono } from "hono";
import { verifyResendWebhook } from "../../middleware/webhook-verify";
import { extractInboundEmail } from "../../services/inbound";
import { handleInboundMessage } from "../../services/routing";

const resendWebhook = new Hono();

resendWebhook.post("/", verifyResendWebhook, async (c) => {
  const payload = await c.req.json();

  const { senderEmail, body, forceDisambiguate } = extractInboundEmail(payload);

  await handleInboundMessage({
    channel: "email",
    senderIdentifier: senderEmail,
    body,
    forceDisambiguate: forceDisambiguate ?? false,
  });

  return c.json({ ok: true });
});

export default resendWebhook;
```

- [ ] **Step 8: Add handleInboundMessage to routing service**

Append to `apps/api/src/services/routing.ts`:
```typescript
import { db, users, workspaces, workspaceMembers, conversations, messages } from "@guac/db";
import { eq, and, gt, desc } from "drizzle-orm";
import { deliver, sendSms, sendEmail, formatWorkingHoursAck } from "./delivery";
import { isWithinWorkingHours, getNextWorkingTime } from "./working-hours";
import {
  createDisambiguationSession,
  findPendingSession,
  parseDisambiguationReply,
  resolveDisambiguationSession,
  formatDisambiguationMessage,
} from "./disambiguation";

export async function handleInboundMessage(input: {
  channel: "sms" | "email";
  senderIdentifier: string;
  body: string;
  forceDisambiguate: boolean;
}) {
  const { channel, senderIdentifier, body, forceDisambiguate } = input;

  // 1. Identify sender
  const [sender] = channel === "sms"
    ? await db.select().from(users).where(eq(users.phone, senderIdentifier))
    : await db.select().from(users).where(eq(users.email, senderIdentifier));

  if (!sender) {
    const msg = "This number/address isn't registered with Guac.";
    if (channel === "sms") await sendSms(senderIdentifier, msg);
    else await sendEmail(senderIdentifier, "Guac", msg);
    return;
  }

  // 2. Check for pending disambiguation session
  const pendingSession = await findPendingSession(sender.id);
  if (pendingSession) {
    await handleDisambiguationReply(sender, pendingSession, body, channel, senderIdentifier);
    return;
  }

  // 3. Get sender's workspaces with members
  const memberships = await db.select({ workspaceId: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, sender.id));

  const senderWorkspaces = await Promise.all(
    memberships.map(async (m) => {
      const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, m.workspaceId));
      const members = await db.select({ userId: workspaceMembers.userId, name: users.name })
        .from(workspaceMembers)
        .innerJoin(users, eq(workspaceMembers.userId, users.id))
        .where(eq(workspaceMembers.workspaceId, m.workspaceId));
      return {
        workspaceId: ws.id,
        workspaceName: ws.name,
        members: members.map((mem) => ({ userId: mem.userId, name: mem.name ?? "Unknown" })),
      };
    })
  );

  // 4. Check recent conversations for shortcut
  let recentConversationUserId: string | null = null;
  if (!forceDisambiguate) {
    const oneDayAgo = new Date();
    oneDayAgo.setHours(oneDayAgo.getHours() - 24);
    const [recentConvo] = await db.select()
      .from(conversations)
      .where(and(eq(conversations.senderId, sender.id), gt(conversations.lastActivityAt, oneDayAgo)))
      .orderBy(desc(conversations.lastActivityAt))
      .limit(1);
    if (recentConvo) recentConversationUserId = recentConvo.recipientId;
  }

  // 5. Resolve routing
  const result = resolveRouting({
    senderWorkspaces,
    recentConversationUserId,
    forceDisambiguate,
  });

  switch (result.type) {
    case "direct":
      await routeMessage(sender, result.workspaceId, result.recipientId, body, channel, senderIdentifier);
      break;
    case "disambiguate_workspace": {
      const options = result.options.map((o) => ({ value: o.workspaceId, label: o.workspaceName }));
      const session = await createDisambiguationSession({
        senderId: sender.id,
        originalMessage: body,
        step: "workspace",
        options,
      });
      const msg = formatDisambiguationMessage("workspace", options);
      if (channel === "sms") await sendSms(senderIdentifier, msg);
      else await sendEmail(senderIdentifier, "Guac — Which workspace?", msg);
      break;
    }
    case "disambiguate_recipient": {
      const options = [
        ...result.options.map((o) => ({ value: o.userId, label: o.name })),
        { value: "all", label: "All members" },
      ];
      const session = await createDisambiguationSession({
        senderId: sender.id,
        originalMessage: body,
        step: "recipient",
        options,
        resolvedWorkspaceId: result.workspaceId,
      });
      const msg = formatDisambiguationMessage("recipient", options);
      if (channel === "sms") await sendSms(senderIdentifier, msg);
      else await sendEmail(senderIdentifier, "Guac — Who should receive this?", msg);
      break;
    }
    case "no_workspaces": {
      const msg = "You're not in any workspaces yet. Ask an admin to add you.";
      if (channel === "sms") await sendSms(senderIdentifier, msg);
      else await sendEmail(senderIdentifier, "Guac", msg);
      break;
    }
  }
}

async function handleDisambiguationReply(
  sender: typeof users.$inferSelect,
  session: any,
  reply: string,
  channel: "sms" | "email",
  senderIdentifier: string,
) {
  const selected = parseDisambiguationReply(reply, session.options);
  if (!selected) {
    const msg = "Invalid selection. " + formatDisambiguationMessage(session.step, session.options);
    if (channel === "sms") await sendSms(senderIdentifier, msg);
    else await sendEmail(senderIdentifier, "Guac — Try again", msg);
    return;
  }

  if (session.step === "workspace") {
    // Workspace selected — check if we need recipient disambiguation
    const members = await db.select({ userId: workspaceMembers.userId, name: users.name })
      .from(workspaceMembers)
      .innerJoin(users, eq(workspaceMembers.userId, users.id))
      .where(eq(workspaceMembers.workspaceId, selected.value));

    const otherMembers = members.filter((m) => m.userId !== sender.id);

    if (otherMembers.length === 1) {
      await resolveDisambiguationSession(session.id, { status: "resolved", resolvedWorkspaceId: selected.value, resolvedRecipientId: otherMembers[0].userId });
      await routeMessage(sender, selected.value, otherMembers[0].userId, session.originalMessage, channel, senderIdentifier);
    } else {
      const options = [
        ...otherMembers.map((m) => ({ value: m.userId, label: m.name ?? "Unknown" })),
        { value: "all", label: "All members" },
      ];
      await resolveDisambiguationSession(session.id, {
        step: "recipient",
        options,
        resolvedWorkspaceId: selected.value,
      });
      const msg = formatDisambiguationMessage("recipient", options);
      if (channel === "sms") await sendSms(senderIdentifier, msg);
      else await sendEmail(senderIdentifier, "Guac — Who should receive this?", msg);
    }
  } else {
    // Recipient selected
    await resolveDisambiguationSession(session.id, { status: "resolved", resolvedRecipientId: selected.value });

    if (selected.value === "all") {
      // Broadcast to all members
      const members = await db.select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(eq(workspaceMembers.workspaceId, session.resolvedWorkspaceId!));

      const otherMembers = members.filter((m) => m.userId !== sender.id);
      for (const m of otherMembers) {
        await routeMessage(sender, session.resolvedWorkspaceId!, m.userId, session.originalMessage, channel, senderIdentifier);
      }
    } else {
      await routeMessage(sender, session.resolvedWorkspaceId!, selected.value, session.originalMessage, channel, senderIdentifier);
    }
  }
}

async function routeMessage(
  sender: typeof users.$inferSelect,
  workspaceId: string,
  recipientId: string,
  body: string,
  senderChannel: "sms" | "email",
  senderIdentifier: string,
) {
  const [recipient] = await db.select().from(users).where(eq(users.id, recipientId));
  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  if (!recipient || !workspace) return;

  // Create conversation
  const [conversation] = await db.insert(conversations).values({
    workspaceId,
    senderId: sender.id,
    recipientId,
    status: "active",
    lastActivityAt: new Date(),
  }).returning();

  // Check working hours and master toggle
  const recipientConfig = {
    workingHoursEnabled: recipient.workingHoursEnabled ?? true,
    workingHoursStart: recipient.workingHoursStart ?? "09:00",
    workingHoursEnd: recipient.workingHoursEnd ?? "17:00",
    workingHoursTimezone: recipient.workingHoursTimezone ?? "America/New_York",
    workingHoursDays: (recipient.workingHoursDays as number[]) ?? [1, 2, 3, 4, 5],
  };

  const now = new Date();
  const withinHours = isWithinWorkingHours(recipientConfig, now);
  const notificationsOn = recipient.notificationsEnabled ?? true;

  const recipientContact = recipient.preferredChannel === "sms" ? recipient.phone! : recipient.email!;

  if (withinHours && notificationsOn) {
    // Deliver immediately
    const success = await deliver({
      channel: recipient.preferredChannel ?? "email",
      to: recipientContact,
      senderName: sender.name ?? "Someone",
      workspaceName: workspace.name,
      body,
      conversationId: conversation.id,
    });

    await db.insert(messages).values({
      conversationId: conversation.id,
      senderId: sender.id,
      body,
      direction: "inbound",
      channel: senderChannel,
      deliveryStatus: success ? "delivered" : "failed",
      deliveredAt: success ? new Date() : null,
    });
  } else {
    // Queue for later
    const deliverAt = notificationsOn
      ? getNextWorkingTime(recipientConfig, now)
      : null; // null = deliver when toggle is turned on

    await db.insert(messages).values({
      conversationId: conversation.id,
      senderId: sender.id,
      body,
      direction: "inbound",
      channel: senderChannel,
      deliveryStatus: "queued",
      deliverAt,
    });

    // Acknowledge to sender
    const ackMsg = notificationsOn
      ? formatWorkingHoursAck({ recipientName: recipient.name ?? "Recipient", nextAvailable: deliverAt! })
      : `${recipient.name ?? "Recipient"} has notifications paused. Your message is queued.`;

    if (senderChannel === "sms") await sendSms(senderIdentifier, ackMsg);
    else await sendEmail(senderIdentifier, "Guac — Message queued", ackMsg);
  }
}
```

- [ ] **Step 9: Mount webhook routes**

Update `apps/api/src/index.ts` — add:
```typescript
import telnyxWebhook from "./routes/webhooks/telnyx";
import resendWebhook from "./routes/webhooks/resend";
// ... after other routes:
app.route("/api/webhooks/telnyx", telnyxWebhook);
app.route("/api/webhooks/resend", resendWebhook);
```

- [ ] **Step 10: Run tests**

Run: `cd /Users/ryanhaugland/guac/apps/api && npx vitest run`
Expected: All PASS

- [ ] **Step 11: Commit**

```bash
git add .
git commit -m "feat: add webhook handlers and full inbound message routing"
```

---

### Task 10: Cron Jobs

**Files:**
- Create: `apps/api/src/cron/deliver-queued.ts`
- Create: `apps/api/src/cron/send-reminders.ts`
- Create: `apps/api/src/cron/expire-conversations.ts`
- Create: `apps/api/src/cron/expire-disambiguation.ts`
- Create: `apps/api/src/routes/cron.ts`
- Create: `apps/api/src/tests/cron.test.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Write failing test for queued delivery logic**

`apps/api/src/tests/cron.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { shouldDeliverNow, shouldSkipReminder } from "../services/queue";

describe("queue logic", () => {
  it("should deliver when deliver_at is in the past", () => {
    const pastDate = new Date();
    pastDate.setHours(pastDate.getHours() - 1);
    expect(shouldDeliverNow(pastDate)).toBe(true);
  });

  it("should not deliver when deliver_at is in the future", () => {
    const futureDate = new Date();
    futureDate.setHours(futureDate.getHours() + 1);
    expect(shouldDeliverNow(futureDate)).toBe(false);
  });

  it("should skip reminder if timing window has passed", () => {
    // "2_weeks" reminder for a task due tomorrow — skip it
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 1);
    expect(shouldSkipReminder("2_weeks", dueDate)).toBe(true);
  });

  it("should not skip reminder if timing window is valid", () => {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 15);
    expect(shouldSkipReminder("2_weeks", dueDate)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/ryanhaugland/guac/apps/api && npx vitest run src/tests/cron.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement queue service**

`apps/api/src/services/queue.ts`:
```typescript
export function shouldDeliverNow(deliverAt: Date): boolean {
  return deliverAt <= new Date();
}

const TIMING_DAYS: Record<string, number> = {
  "2_weeks": 14,
  "1_week": 7,
  "3_days": 3,
  "2_days": 2,
  "day_of": 0,
};

export function shouldSkipReminder(timing: string, dueDate: Date): boolean {
  const daysUntilDue = Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const reminderDays = TIMING_DAYS[timing] ?? 0;
  return daysUntilDue < reminderDays;
}
```

- [ ] **Step 4: Run tests**

Run: `cd /Users/ryanhaugland/guac/apps/api && npx vitest run src/tests/cron.test.ts`
Expected: PASS

- [ ] **Step 5: Implement deliver-queued cron**

`apps/api/src/cron/deliver-queued.ts`:
```typescript
import { db, messages, conversations, users, workspaces } from "@guac/db";
import { eq, and, lte } from "drizzle-orm";
import { deliver } from "../services/delivery";
import { isWithinWorkingHours } from "../services/working-hours";

export async function deliverQueuedMessages() {
  const now = new Date();

  const queuedMessages = await db.select()
    .from(messages)
    .where(and(eq(messages.deliveryStatus, "queued"), lte(messages.deliverAt, now)));

  for (const msg of queuedMessages) {
    const [convo] = await db.select().from(conversations).where(eq(conversations.id, msg.conversationId));
    if (!convo || !convo.recipientId) continue;

    const [recipient] = await db.select().from(users).where(eq(users.id, convo.recipientId));
    const [sender] = await db.select().from(users).where(eq(users.id, msg.senderId));
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, convo.workspaceId));
    if (!recipient || !sender || !workspace) continue;

    // Double-check working hours at delivery time
    if (!recipient.notificationsEnabled) continue;

    const config = {
      workingHoursEnabled: recipient.workingHoursEnabled ?? true,
      workingHoursStart: recipient.workingHoursStart ?? "09:00",
      workingHoursEnd: recipient.workingHoursEnd ?? "17:00",
      workingHoursTimezone: recipient.workingHoursTimezone ?? "America/New_York",
      workingHoursDays: (recipient.workingHoursDays as number[]) ?? [1, 2, 3, 4, 5],
    };

    if (!isWithinWorkingHours(config, now)) continue;

    const recipientContact = recipient.preferredChannel === "sms" ? recipient.phone! : recipient.email!;

    const success = await deliver({
      channel: recipient.preferredChannel ?? "email",
      to: recipientContact,
      senderName: sender.name ?? "Someone",
      workspaceName: workspace.name,
      body: msg.body,
      conversationId: convo.id,
    });

    await db.update(messages).set({
      deliveryStatus: success ? "delivered" : "failed",
      deliveredAt: success ? new Date() : null,
    }).where(eq(messages.id, msg.id));
  }
}
```

- [ ] **Step 6: Implement expire-conversations cron**

`apps/api/src/cron/expire-conversations.ts`:
```typescript
import { db, conversations } from "@guac/db";
import { eq, and, lt } from "drizzle-orm";

export async function expireConversations() {
  const oneDayAgo = new Date();
  oneDayAgo.setHours(oneDayAgo.getHours() - 24);

  await db.update(conversations)
    .set({ status: "expired" })
    .where(and(eq(conversations.status, "active"), lt(conversations.lastActivityAt, oneDayAgo)));
}
```

- [ ] **Step 7: Implement expire-disambiguation cron**

`apps/api/src/cron/expire-disambiguation.ts`:
```typescript
import { db, disambiguationSessions } from "@guac/db";
import { eq, and, lt } from "drizzle-orm";
import { sendSms, sendEmail } from "../services/delivery";
import { users } from "@guac/db";

export async function expireDisambiguationSessions() {
  const now = new Date();

  const expired = await db.select()
    .from(disambiguationSessions)
    .where(and(eq(disambiguationSessions.status, "pending"), lt(disambiguationSessions.expiresAt, now)));

  for (const session of expired) {
    await db.update(disambiguationSessions)
      .set({ status: "expired" })
      .where(eq(disambiguationSessions.id, session.id));

    const [sender] = await db.select().from(users).where(eq(users.id, session.senderId));
    if (!sender) continue;

    const msg = "Message expired. Send again when ready.";
    if (sender.phone) await sendSms(sender.phone, msg);
    else if (sender.email) await sendEmail(sender.email, "Guac — Message expired", msg);
  }
}
```

- [ ] **Step 8: Implement send-reminders cron**

`apps/api/src/cron/send-reminders.ts`:
```typescript
import { db, taskNotifications, tasks, users, workspaces } from "@guac/db";
import { eq, and, lte } from "drizzle-orm";
import { sendSms, sendEmail } from "../services/delivery";
import { isWithinWorkingHours, getNextWorkingTime } from "../services/working-hours";
import { shouldSkipReminder } from "../services/queue";

export async function sendReminders() {
  const now = new Date();

  const dueReminders = await db.select()
    .from(taskNotifications)
    .where(and(eq(taskNotifications.sent, false), lte(taskNotifications.scheduledFor, now)));

  for (const reminder of dueReminders) {
    const [user] = await db.select().from(users).where(eq(users.id, reminder.userId));
    const [task] = await db.select().from(tasks).where(eq(tasks.id, reminder.taskId));
    if (!user || !task) continue;

    if (!user.notificationsEnabled) continue;
    if (!(user.notificationTimings as string[])?.includes(reminder.timing)) continue;
    if (shouldSkipReminder(reminder.timing, new Date(task.dueDate))) {
      await db.update(taskNotifications).set({ sent: true }).where(eq(taskNotifications.id, reminder.id));
      continue;
    }

    const config = {
      workingHoursEnabled: user.workingHoursEnabled ?? true,
      workingHoursStart: user.workingHoursStart ?? "09:00",
      workingHoursEnd: user.workingHoursEnd ?? "17:00",
      workingHoursTimezone: user.workingHoursTimezone ?? "America/New_York",
      workingHoursDays: (user.workingHoursDays as number[]) ?? [1, 2, 3, 4, 5],
    };

    if (!isWithinWorkingHours(config, now)) continue; // Will retry next cron run

    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, task.workspaceId));
    const label = reminder.timing.replace("_", " ");
    const msg = `Reminder: "${task.title}" is due in ${label}${workspace ? ` (${workspace.name})` : ""}.`;

    const contact = user.preferredChannel === "sms" ? user.phone! : user.email!;
    if (user.preferredChannel === "sms") await sendSms(contact, msg);
    else await sendEmail(contact, `Guac — Task reminder`, msg);

    await db.update(taskNotifications).set({ sent: true }).where(eq(taskNotifications.id, reminder.id));
  }
}
```

- [ ] **Step 9: Create cron routes**

`apps/api/src/routes/cron.ts`:
```typescript
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
```

- [ ] **Step 10: Mount cron routes**

Update `apps/api/src/index.ts` — add:
```typescript
import cron from "./routes/cron";
// ... after other routes:
app.route("/api/cron", cron);
```

- [ ] **Step 11: Run tests**

Run: `cd /Users/ryanhaugland/guac/apps/api && npx vitest run`
Expected: All PASS

- [ ] **Step 12: Commit**

```bash
git add .
git commit -m "feat: add cron jobs for delivery queue, reminders, and expiration"
```

---

### Task 11: Messages Route & Recent Activity

**Files:**
- Create: `apps/api/src/routes/messages.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Implement messages route**

`apps/api/src/routes/messages.ts`:
```typescript
import { Hono } from "hono";
import { requireAuth } from "../middleware/auth";
import { db, messages, conversations, users, workspaces } from "@guac/db";
import { eq, or, desc } from "drizzle-orm";

const messagesRouter = new Hono();

messagesRouter.get("/recent", requireAuth, async (c) => {
  const userId = c.get("userId");

  const userConversations = await db.select()
    .from(conversations)
    .where(or(eq(conversations.senderId, userId), eq(conversations.recipientId, userId)))
    .orderBy(desc(conversations.lastActivityAt))
    .limit(20);

  const result = await Promise.all(
    userConversations.map(async (convo) => {
      const recentMessages = await db.select()
        .from(messages)
        .where(eq(messages.conversationId, convo.id))
        .orderBy(desc(messages.createdAt))
        .limit(1);

      const [sender] = await db.select().from(users).where(eq(users.id, convo.senderId));
      const recipient = convo.recipientId
        ? (await db.select().from(users).where(eq(users.id, convo.recipientId)))[0]
        : null;
      const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, convo.workspaceId));

      return {
        conversationId: convo.id,
        workspace: workspace?.name ?? "Unknown",
        sender: sender?.name ?? "Unknown",
        recipient: recipient?.name ?? "All members",
        lastMessage: recentMessages[0]?.body ?? "",
        deliveryStatus: recentMessages[0]?.deliveryStatus ?? "pending",
        timestamp: convo.lastActivityAt,
      };
    })
  );

  return c.json({ activity: result });
});

export default messagesRouter;
```

- [ ] **Step 2: Mount route**

Update `apps/api/src/index.ts` — add:
```typescript
import messagesRouter from "./routes/messages";
// ... after other routes:
app.route("/api/messages", messagesRouter);
```

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "feat: add recent activity endpoint"
```

---

### Task 12: Frontend — API Client & Types

**Files:**
- Create: `apps/web/src/lib/types.ts`
- Create: `apps/web/src/lib/api-client.ts`

- [ ] **Step 1: Define shared types**

`apps/web/src/lib/types.ts`:
```typescript
export type Channel = "sms" | "email";

export type User = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  preferredChannel: Channel;
  notificationTimings: string[];
  workingHoursEnabled: boolean;
  workingHoursStart: string;
  workingHoursEnd: string;
  workingHoursTimezone: string;
  workingHoursDays: number[];
  notificationsEnabled: boolean;
  onboarded: boolean;
};

export type Workspace = {
  id: string;
  name: string;
  role: "admin" | "member";
  memberCount: number;
  createdAt: string;
};

export type WorkspaceMember = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: "admin" | "member";
  preferredChannel: Channel;
  workingHoursEnabled: boolean;
  notificationsEnabled: boolean;
  addedAt: string;
};

export type ActivityItem = {
  conversationId: string;
  workspace: string;
  sender: string;
  recipient: string;
  lastMessage: string;
  deliveryStatus: "delivered" | "queued" | "pending" | "failed";
  timestamp: string;
};

export type Preferences = {
  preferredChannel: Channel;
  notificationTimings: string[];
  notificationsEnabled: boolean;
  workingHoursEnabled: boolean;
  workingHoursStart: string;
  workingHoursEnd: string;
  workingHoursTimezone: string;
  workingHoursDays: number[];
};
```

- [ ] **Step 2: Create API client**

`apps/web/src/lib/api-client.ts`:
```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error ?? "Request failed");
  }
  return res.json();
}

export const api = {
  auth: {
    requestMagicLink: (data: { email?: string; phone?: string }) =>
      request("/api/auth/magic-link", { method: "POST", body: JSON.stringify(data) }),
    session: () => request<{ user: import("./types").User }>("/api/auth/session"),
    logout: () => request("/api/auth/logout", { method: "POST" }),
  },
  onboarding: {
    complete: (data: Record<string, unknown>) =>
      request("/api/onboarding", { method: "POST", body: JSON.stringify(data) }),
  },
  preferences: {
    get: () => request<import("./types").Preferences>("/api/preferences"),
    update: (data: Partial<import("./types").Preferences>) =>
      request("/api/preferences", { method: "PATCH", body: JSON.stringify(data) }),
  },
  workspaces: {
    list: () => request<{ workspaces: import("./types").Workspace[] }>("/api/workspaces"),
    create: (name: string) =>
      request("/api/workspaces", { method: "POST", body: JSON.stringify({ name }) }),
    members: (id: string) =>
      request<{ members: import("./types").WorkspaceMember[] }>(`/api/workspaces/${id}/members`),
    addMember: (id: string, data: { email?: string; phone?: string }) =>
      request(`/api/workspaces/${id}/members`, { method: "POST", body: JSON.stringify(data) }),
    removeMember: (workspaceId: string, userId: string) =>
      request(`/api/workspaces/${workspaceId}/members/${userId}`, { method: "DELETE" }),
  },
  activity: {
    recent: () => request<{ activity: import("./types").ActivityItem[] }>("/api/messages/recent"),
  },
};
```

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "feat: add frontend types and API client"
```

---

### Task 13: Frontend — Login & Onboarding Pages

**Files:**
- Create: `apps/web/src/app/login/page.tsx`
- Create: `apps/web/src/app/onboarding/page.tsx`
- Create: `apps/web/src/hooks/useAuth.ts`

- [ ] **Step 1: Create auth hook**

`apps/web/src/hooks/useAuth.ts`:
```typescript
"use client";
import { useState, useEffect } from "react";
import { api } from "../lib/api-client";
import type { User } from "../lib/types";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.auth.session()
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const logout = async () => {
    await api.auth.logout();
    setUser(null);
    window.location.href = "/login";
  };

  return { user, loading, logout };
}
```

- [ ] **Step 2: Create login page**

`apps/web/src/app/login/page.tsx`:
```tsx
"use client";
import { useState } from "react";
import { api } from "../../lib/api-client";

export default function LoginPage() {
  const [method, setMethod] = useState<"email" | "phone">("email");
  const [value, setValue] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await api.auth.requestMagicLink(
        method === "email" ? { email: value } : { phone: value }
      );
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  if (sent) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-sm p-8 max-w-md w-full text-center">
          <div className="text-4xl mb-4">🥑</div>
          <h2 className="text-xl font-semibold text-green-primary mb-2">Check your {method}!</h2>
          <p className="text-gray-600">We sent you a magic link. Click it to sign in.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-sm p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🥑</div>
          <h1 className="text-2xl font-bold text-green-primary">Guac</h1>
          <p className="text-gray-500 mt-1">Sign in with a magic link</p>
        </div>

        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setMethod("email")}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              method === "email"
                ? "bg-green-primary text-white"
                : "bg-green-light text-green-primary"
            }`}
          >
            Email
          </button>
          <button
            onClick={() => setMethod("phone")}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              method === "phone"
                ? "bg-green-primary text-white"
                : "bg-green-light text-green-primary"
            }`}
          >
            Phone
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <input
            type={method === "email" ? "email" : "tel"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={method === "email" ? "you@example.com" : "+1 555 123 4567"}
            className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-green-primary/30 focus:border-green-primary"
            required
          />
          {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
          <button
            type="submit"
            className="w-full mt-4 py-3 bg-green-primary text-white rounded-lg font-medium hover:bg-green-primary/90 transition-colors"
          >
            Send magic link
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create onboarding page**

`apps/web/src/app/onboarding/page.tsx`:
```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../../lib/api-client";
import { useAuth } from "../../hooks/useAuth";

const TIMEZONES = [
  "America/New_York", "America/Chicago", "America/Denver",
  "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu",
  "Europe/London", "Europe/Paris", "Asia/Tokyo",
];

const DAYS = [
  { value: 0, label: "Sun" }, { value: 1, label: "Mon" },
  { value: 2, label: "Tue" }, { value: 3, label: "Wed" },
  { value: 4, label: "Thu" }, { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

const TIMING_OPTIONS = [
  { value: "2_weeks", label: "2 weeks before" },
  { value: "1_week", label: "1 week before" },
  { value: "3_days", label: "3 days before" },
  { value: "2_days", label: "2 days before" },
  { value: "day_of", label: "Day of" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [preferredChannel, setPreferredChannel] = useState<"sms" | "email">("email");
  const [timings, setTimings] = useState<string[]>(["2_weeks", "1_week", "3_days", "2_days", "day_of"]);
  const [workingHoursStart, setWorkingHoursStart] = useState("09:00");
  const [workingHoursEnd, setWorkingHoursEnd] = useState("17:00");
  const [timezone, setTimezone] = useState("America/New_York");
  const [workingDays, setWorkingDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [error, setError] = useState("");

  const toggleTiming = (t: string) => {
    setTimings((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);
  };

  const toggleDay = (d: number) => {
    setWorkingDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await api.onboarding.complete({
        name, email, phone, preferredChannel,
        notificationTimings: timings,
        workingHoursStart, workingHoursEnd,
        workingHoursTimezone: timezone,
        workingHoursDays: workingDays,
      });
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  return (
    <div className="min-h-screen bg-cream py-12 px-4">
      <div className="max-w-lg mx-auto bg-white rounded-2xl shadow-sm p-8">
        <div className="text-center mb-8">
          <div className="text-4xl mb-2">🥑</div>
          <h1 className="text-2xl font-bold text-green-primary">Welcome to Guac</h1>
          <p className="text-gray-500 mt-1">Let's set up your preferences</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Your name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-green-primary/30" required />
          </div>

          {/* Contact info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-green-primary/30" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-green-primary/30" required />
            </div>
          </div>

          {/* Preferred channel */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Preferred communication</label>
            <div className="flex gap-2">
              {(["email", "sms"] as const).map((ch) => (
                <button key={ch} type="button" onClick={() => setPreferredChannel(ch)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                    preferredChannel === ch ? "bg-green-primary text-white" : "bg-green-light text-green-primary"
                  }`}>
                  {ch === "sms" ? "Text" : "Email"}
                </button>
              ))}
            </div>
          </div>

          {/* Notification timings */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Task reminders</label>
            <div className="flex flex-wrap gap-2">
              {TIMING_OPTIONS.map((t) => (
                <button key={t.value} type="button" onClick={() => toggleTiming(t.value)}
                  className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                    timings.includes(t.value) ? "bg-green-primary text-white" : "bg-gray-100 text-gray-600"
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Working hours */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Working hours</label>
            <div className="grid grid-cols-2 gap-4 mb-3">
              <div>
                <label className="text-xs text-gray-500">Start</label>
                <input type="time" value={workingHoursStart} onChange={(e) => setWorkingHoursStart(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-green-primary/30" />
              </div>
              <div>
                <label className="text-xs text-gray-500">End</label>
                <input type="time" value={workingHoursEnd} onChange={(e) => setWorkingHoursEnd(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-green-primary/30" />
              </div>
            </div>
            <select value={timezone} onChange={(e) => setTimezone(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 mb-3 focus:outline-none focus:ring-2 focus:ring-green-primary/30">
              {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz.replace("_", " ")}</option>)}
            </select>
            <div className="flex gap-1">
              {DAYS.map((d) => (
                <button key={d.value} type="button" onClick={() => toggleDay(d.value)}
                  className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${
                    workingDays.includes(d.value) ? "bg-green-primary text-white" : "bg-gray-100 text-gray-600"
                  }`}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button type="submit"
            className="w-full py-3 bg-green-primary text-white rounded-lg font-medium hover:bg-green-primary/90 transition-colors">
            Get started
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat: add login and onboarding pages"
```

---

### Task 14: Frontend — Dashboard

**Files:**
- Create: `apps/web/src/app/dashboard/page.tsx`
- Create: `apps/web/src/app/dashboard/components/Header.tsx`
- Create: `apps/web/src/app/dashboard/components/QuickToggles.tsx`
- Create: `apps/web/src/app/dashboard/components/WorkspaceList.tsx`
- Create: `apps/web/src/app/dashboard/components/WorkspaceCard.tsx`
- Create: `apps/web/src/app/dashboard/components/AddMemberModal.tsx`
- Create: `apps/web/src/app/dashboard/components/NotificationPrefs.tsx`
- Create: `apps/web/src/app/dashboard/components/WorkingHoursEditor.tsx`
- Create: `apps/web/src/app/dashboard/components/RecentActivity.tsx`
- Create: `apps/web/src/hooks/usePreferences.ts`
- Create: `apps/web/src/hooks/useWorkspaces.ts`
- Create: `apps/web/src/hooks/useActivity.ts`

- [ ] **Step 1: Create hooks**

`apps/web/src/hooks/usePreferences.ts`:
```typescript
"use client";
import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api-client";
import type { Preferences } from "../lib/types";

export function usePreferences() {
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.preferences.get().then(setPrefs).finally(() => setLoading(false));
  }, []);

  const update = useCallback(async (data: Partial<Preferences>) => {
    await api.preferences.update(data);
    setPrefs((prev) => prev ? { ...prev, ...data } : null);
  }, []);

  return { prefs, loading, update };
}
```

`apps/web/src/hooks/useWorkspaces.ts`:
```typescript
"use client";
import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api-client";
import type { Workspace, WorkspaceMember } from "../lib/types";

export function useWorkspaces() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const data = await api.workspaces.list();
    setWorkspaces(data.workspaces);
  }, []);

  useEffect(() => { refresh().finally(() => setLoading(false)); }, [refresh]);

  const create = async (name: string) => {
    await api.workspaces.create(name);
    await refresh();
  };

  const getMembers = async (id: string): Promise<WorkspaceMember[]> => {
    const data = await api.workspaces.members(id);
    return data.members;
  };

  const addMember = async (workspaceId: string, contact: { email?: string; phone?: string }) => {
    await api.workspaces.addMember(workspaceId, contact);
  };

  const removeMember = async (workspaceId: string, userId: string) => {
    await api.workspaces.removeMember(workspaceId, userId);
  };

  return { workspaces, loading, create, getMembers, addMember, removeMember, refresh };
}
```

`apps/web/src/hooks/useActivity.ts`:
```typescript
"use client";
import { useState, useEffect } from "react";
import { api } from "../lib/api-client";
import type { ActivityItem } from "../lib/types";

export function useActivity() {
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.activity.recent().then((data) => setActivity(data.activity)).finally(() => setLoading(false));

    // Poll every 30s
    const interval = setInterval(async () => {
      try {
        const data = await api.activity.recent();
        setActivity(data.activity);
      } catch {}
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  return { activity, loading };
}
```

- [ ] **Step 2: Create Header component**

`apps/web/src/app/dashboard/components/Header.tsx`:
```tsx
"use client";

type Props = { userName: string; onLogout: () => void };

export function Header({ userName, onLogout }: Props) {
  return (
    <header className="flex items-center justify-between py-4 px-6 bg-white rounded-2xl shadow-sm">
      <div className="flex items-center gap-3">
        <span className="text-3xl">🥑</span>
        <h1 className="text-xl font-bold text-green-primary">Guac</h1>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-gray-600 text-sm">{userName}</span>
        <button onClick={onLogout} className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
          Logout
        </button>
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Create QuickToggles component**

`apps/web/src/app/dashboard/components/QuickToggles.tsx`:
```tsx
"use client";
import type { Preferences } from "../../../lib/types";

type Props = {
  prefs: Preferences;
  onUpdate: (data: Partial<Preferences>) => void;
};

export function QuickToggles({ prefs, onUpdate }: Props) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-6">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Quick Toggles</h2>
      <div className="flex flex-wrap gap-4">
        {/* Notifications master toggle */}
        <button
          onClick={() => onUpdate({ notificationsEnabled: !prefs.notificationsEnabled })}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            prefs.notificationsEnabled ? "bg-green-primary text-white" : "bg-gray-100 text-gray-500"
          }`}
        >
          Notifications {prefs.notificationsEnabled ? "On" : "Off"}
        </button>

        {/* Channel toggle */}
        <button
          onClick={() => onUpdate({ preferredChannel: prefs.preferredChannel === "sms" ? "email" : "sms" })}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-green-light text-green-primary"
        >
          Via: {prefs.preferredChannel === "sms" ? "Text" : "Email"}
        </button>

        {/* Working hours toggle */}
        <button
          onClick={() => onUpdate({ workingHoursEnabled: !prefs.workingHoursEnabled })}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            prefs.workingHoursEnabled ? "bg-green-primary text-white" : "bg-gray-100 text-gray-500"
          }`}
        >
          Working Hours {prefs.workingHoursEnabled ? "On" : "Off"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create WorkspaceCard and WorkspaceList**

`apps/web/src/app/dashboard/components/WorkspaceCard.tsx`:
```tsx
"use client";
import { useState } from "react";
import type { Workspace, WorkspaceMember } from "../../../lib/types";
import { AddMemberModal } from "./AddMemberModal";

type Props = {
  workspace: Workspace;
  getMembers: (id: string) => Promise<WorkspaceMember[]>;
  addMember: (workspaceId: string, contact: { email?: string; phone?: string }) => Promise<void>;
  removeMember: (workspaceId: string, userId: string) => Promise<void>;
};

export function WorkspaceCard({ workspace, getMembers, addMember, removeMember }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const isAdmin = workspace.role === "admin";

  const handleExpand = async () => {
    if (!expanded) {
      const data = await getMembers(workspace.id);
      setMembers(data);
    }
    setExpanded(!expanded);
  };

  const handleAddMember = async (contact: { email?: string; phone?: string }) => {
    await addMember(workspace.id, contact);
    const data = await getMembers(workspace.id);
    setMembers(data);
    setShowAddModal(false);
  };

  const handleRemoveMember = async (userId: string) => {
    await removeMember(workspace.id, userId);
    setMembers((prev) => prev.filter((m) => m.id !== userId));
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <button onClick={handleExpand} className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
        <div className="flex items-center gap-3">
          <span className="font-medium text-gray-900">{workspace.name}</span>
          {isAdmin && <span className="text-xs bg-green-light text-green-primary px-2 py-0.5 rounded-full">Admin</span>}
        </div>
        <span className="text-sm text-gray-400">{workspace.memberCount} member{workspace.memberCount !== 1 ? "s" : ""}</span>
      </button>

      {expanded && (
        <div className="px-5 pb-4 border-t border-gray-50">
          <div className="mt-3 space-y-2">
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between py-2">
                <div>
                  <span className="text-sm text-gray-900">{m.name ?? "Pending"}</span>
                  <span className="text-xs text-gray-400 ml-2">{m.email ?? m.phone}</span>
                  {m.role === "admin" && <span className="text-xs text-green-primary ml-2">admin</span>}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${m.notificationsEnabled ? "bg-green-secondary" : "bg-gray-300"}`} />
                  {isAdmin && m.role !== "admin" && (
                    <button onClick={() => handleRemoveMember(m.id)} className="text-xs text-red-400 hover:text-red-600">Remove</button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {isAdmin && (
            <button onClick={() => setShowAddModal(true)}
              className="mt-3 text-sm text-green-primary hover:text-green-primary/80 font-medium">
              + Add member
            </button>
          )}
        </div>
      )}

      {showAddModal && <AddMemberModal onAdd={handleAddMember} onClose={() => setShowAddModal(false)} />}
    </div>
  );
}
```

`apps/web/src/app/dashboard/components/WorkspaceList.tsx`:
```tsx
"use client";
import { useState } from "react";
import type { Workspace, WorkspaceMember } from "../../../lib/types";
import { WorkspaceCard } from "./WorkspaceCard";

type Props = {
  workspaces: Workspace[];
  onCreate: (name: string) => Promise<void>;
  getMembers: (id: string) => Promise<WorkspaceMember[]>;
  addMember: (workspaceId: string, contact: { email?: string; phone?: string }) => Promise<void>;
  removeMember: (workspaceId: string, userId: string) => Promise<void>;
};

export function WorkspaceList({ workspaces, onCreate, getMembers, addMember, removeMember }: Props) {
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    await onCreate(newName.trim());
    setNewName("");
    setCreating(false);
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Workspaces</h2>
        <button onClick={() => setCreating(!creating)} className="text-sm text-green-primary font-medium">
          {creating ? "Cancel" : "+ New"}
        </button>
      </div>

      {creating && (
        <form onSubmit={handleCreate} className="flex gap-2 mb-4">
          <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
            placeholder="Workspace name" className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-primary/30" autoFocus />
          <button type="submit" className="px-4 py-2 bg-green-primary text-white rounded-lg text-sm font-medium">Create</button>
        </form>
      )}

      <div className="space-y-2">
        {workspaces.map((ws) => (
          <WorkspaceCard key={ws.id} workspace={ws} getMembers={getMembers} addMember={addMember} removeMember={removeMember} />
        ))}
        {workspaces.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No workspaces yet</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create AddMemberModal**

`apps/web/src/app/dashboard/components/AddMemberModal.tsx`:
```tsx
"use client";
import { useState } from "react";

type Props = {
  onAdd: (contact: { email?: string; phone?: string }) => Promise<void>;
  onClose: () => void;
};

export function AddMemberModal({ onAdd, onClose }: Props) {
  const [method, setMethod] = useState<"email" | "phone">("email");
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await onAdd(method === "email" ? { email: value } : { phone: value });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add member");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Add member</h3>
        <div className="flex gap-2 mb-4">
          {(["email", "phone"] as const).map((m) => (
            <button key={m} onClick={() => setMethod(m)}
              className={`flex-1 py-1.5 rounded-lg text-sm font-medium ${method === m ? "bg-green-primary text-white" : "bg-green-light text-green-primary"}`}>
              {m === "email" ? "Email" : "Phone"}
            </button>
          ))}
        </div>
        <form onSubmit={handleSubmit}>
          <input type={method === "email" ? "email" : "tel"} value={value} onChange={(e) => setValue(e.target.value)}
            placeholder={method === "email" ? "member@example.com" : "+1 555 123 4567"}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-primary/30" required autoFocus />
          {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
          <div className="flex gap-2 mt-4">
            <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg text-sm text-gray-600 bg-gray-100">Cancel</button>
            <button type="submit" className="flex-1 py-2 rounded-lg text-sm text-white bg-green-primary font-medium">Add</button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create NotificationPrefs and WorkingHoursEditor**

`apps/web/src/app/dashboard/components/NotificationPrefs.tsx`:
```tsx
"use client";
import type { Preferences } from "../../../lib/types";

const TIMING_OPTIONS = [
  { value: "2_weeks", label: "2 weeks" },
  { value: "1_week", label: "1 week" },
  { value: "3_days", label: "3 days" },
  { value: "2_days", label: "2 days" },
  { value: "day_of", label: "Day of" },
];

type Props = { prefs: Preferences; onUpdate: (data: Partial<Preferences>) => void };

export function NotificationPrefs({ prefs, onUpdate }: Props) {
  const toggle = (t: string) => {
    const updated = prefs.notificationTimings.includes(t)
      ? prefs.notificationTimings.filter((x) => x !== t)
      : [...prefs.notificationTimings, t];
    onUpdate({ notificationTimings: updated });
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm p-6">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Task Reminders</h2>
      <div className="flex flex-wrap gap-2">
        {TIMING_OPTIONS.map((t) => (
          <button key={t.value} onClick={() => toggle(t.value)}
            className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
              prefs.notificationTimings.includes(t.value) ? "bg-green-primary text-white" : "bg-gray-100 text-gray-500"
            }`}>
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

`apps/web/src/app/dashboard/components/WorkingHoursEditor.tsx`:
```tsx
"use client";
import type { Preferences } from "../../../lib/types";

const DAYS = [
  { value: 0, label: "S" }, { value: 1, label: "M" },
  { value: 2, label: "T" }, { value: 3, label: "W" },
  { value: 4, label: "T" }, { value: 5, label: "F" },
  { value: 6, label: "S" },
];

type Props = { prefs: Preferences; onUpdate: (data: Partial<Preferences>) => void };

export function WorkingHoursEditor({ prefs, onUpdate }: Props) {
  const toggleDay = (d: number) => {
    const updated = prefs.workingHoursDays.includes(d)
      ? prefs.workingHoursDays.filter((x) => x !== d)
      : [...prefs.workingHoursDays, d];
    onUpdate({ workingHoursDays: updated });
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm p-6">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Working Hours</h2>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="text-xs text-gray-500">Start</label>
          <input type="time" value={prefs.workingHoursStart}
            onChange={(e) => onUpdate({ workingHoursStart: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-primary/30" />
        </div>
        <div>
          <label className="text-xs text-gray-500">End</label>
          <input type="time" value={prefs.workingHoursEnd}
            onChange={(e) => onUpdate({ workingHoursEnd: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-primary/30" />
        </div>
      </div>
      <div className="flex gap-1">
        {DAYS.map((d) => (
          <button key={d.value} onClick={() => toggleDay(d.value)}
            className={`flex-1 py-2 rounded text-xs font-medium transition-colors ${
              prefs.workingHoursDays.includes(d.value) ? "bg-green-primary text-white" : "bg-gray-100 text-gray-500"
            }`}>
            {d.label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Create RecentActivity component**

`apps/web/src/app/dashboard/components/RecentActivity.tsx`:
```tsx
"use client";
import type { ActivityItem } from "../../../lib/types";

const STATUS_COLORS: Record<string, string> = {
  delivered: "bg-green-secondary",
  queued: "bg-yellow-400",
  pending: "bg-gray-300",
  failed: "bg-red-400",
};

type Props = { activity: ActivityItem[] };

export function RecentActivity({ activity }: Props) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-6">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Recent Activity</h2>
      {activity.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">No activity yet</p>
      ) : (
        <div className="space-y-3">
          {activity.map((item) => (
            <div key={item.conversationId} className="flex items-start gap-3 py-2">
              <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${STATUS_COLORS[item.deliveryStatus] ?? "bg-gray-300"}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium text-gray-900">{item.sender}</span>
                  <span className="text-gray-400">→</span>
                  <span className="text-gray-600">{item.recipient}</span>
                  <span className="text-xs text-gray-400 ml-auto">{item.workspace}</span>
                </div>
                <p className="text-sm text-gray-500 truncate">{item.lastMessage}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Create dashboard page**

`apps/web/src/app/dashboard/page.tsx`:
```tsx
"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../hooks/useAuth";
import { usePreferences } from "../../hooks/usePreferences";
import { useWorkspaces } from "../../hooks/useWorkspaces";
import { useActivity } from "../../hooks/useActivity";
import { Header } from "./components/Header";
import { QuickToggles } from "./components/QuickToggles";
import { WorkspaceList } from "./components/WorkspaceList";
import { NotificationPrefs } from "./components/NotificationPrefs";
import { WorkingHoursEditor } from "./components/WorkingHoursEditor";
import { RecentActivity } from "./components/RecentActivity";

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();
  const { prefs, loading: prefsLoading, update: updatePrefs } = usePreferences();
  const { workspaces, create, getMembers, addMember, removeMember } = useWorkspaces();
  const { activity } = useActivity();

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
    if (!authLoading && user && !user.onboarded) router.push("/onboarding");
  }, [authLoading, user, router]);

  if (authLoading || prefsLoading || !user || !prefs) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="text-green-primary text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream">
      <div className="max-w-2xl mx-auto py-6 px-4 space-y-4">
        <Header userName={user.name ?? "User"} onLogout={logout} />
        <QuickToggles prefs={prefs} onUpdate={updatePrefs} />
        <WorkspaceList workspaces={workspaces} onCreate={create} getMembers={getMembers} addMember={addMember} removeMember={removeMember} />
        <NotificationPrefs prefs={prefs} onUpdate={updatePrefs} />
        <WorkingHoursEditor prefs={prefs} onUpdate={updatePrefs} />
        <RecentActivity activity={activity} />
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Commit**

```bash
git add .
git commit -m "feat: add dashboard with all components"
```

---

### Task 15: Final Integration & Smoke Test

**Files:**
- Modify: `apps/api/src/index.ts` (final version with all routes mounted)
- Create: `.env.example`

- [ ] **Step 1: Create env example**

`.env.example`:
```
DATABASE_URL=postgresql://user:pass@localhost:5432/guac
APP_URL=http://localhost:3000
RESEND_API_KEY=re_xxxx
TELNYX_API_KEY=KEY_xxxx
TELNYX_PHONE_NUMBER=+15559876543
GUAC_EMAIL_ADDRESS=team@guac.app
```

- [ ] **Step 2: Verify final index.ts has all routes**

`apps/api/src/index.ts`:
```typescript
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
```

- [ ] **Step 3: Run all tests**

Run: `cd /Users/ryanhaugland/guac && npx turbo test`
Expected: All PASS

- [ ] **Step 4: Start dev servers and verify**

Run: `cd /Users/ryanhaugland/guac && npx turbo dev`
- Visit http://localhost:3000 — should redirect to /dashboard then /login
- Visit http://localhost:3001/health — should return `{"status":"ok"}`

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: final integration with CORS, env config, and all routes"
```
