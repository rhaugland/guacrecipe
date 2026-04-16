# Tasks Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add peer-to-peer task assignment within workspaces with weather-aware multi-channel notifications and due-date reminders.

**Architecture:** New columns on the existing `tasks` table, a new `tasks.ts` API route file following the Hono pattern, cron integration for reminders, and a new `/dashboard/tasks` page. Notifications flow through the existing `dispatchMessage` → `routeMessage` → delivery pipeline, gated by the recipient's weather status via `effectiveCodeForUser`.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind CSS, Hono, Drizzle ORM, PostgreSQL.

**Spec:** `docs/superpowers/specs/2026-04-16-tasks-feature-design.md`

**Testing strategy:** This project has no automated test harness for API routes or UI. Each task verifies via (a) TypeScript compilation across both apps and (b) manual verification. The defensive `isMissingTable` pattern is applied so the API degrades gracefully before migrations are applied.

**Commit style:** Conventional commits. Examples: `feat(tasks): add schema columns and migration`, `feat(tasks): task CRUD API routes`.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `packages/db/src/schema.ts` | Modify | Add `assigneeId`, `status`, `completedAt`, `description` columns to `tasks` table |
| `packages/db/src/migrations/0005_task_columns.sql` | Create | Migration SQL for new columns |
| `apps/api/src/routes/tasks.ts` | Create | Task CRUD + notification dispatch |
| `apps/api/src/index.ts` | Modify | Mount tasks router |
| `apps/api/src/routes/cron.ts` | Modify | Add task reminder processing endpoint |
| `apps/web/src/app/dashboard/components/Header.tsx` | Modify | Add "Tasks" tab to nav |
| `apps/web/src/app/dashboard/tasks/page.tsx` | Create | Tasks page UI |

## Task Order & Rationale

1. **Schema + migration** — foundation; everything depends on the new columns.
2. **Tasks API** — CRUD endpoints; the frontend needs these.
3. **Notification dispatch** — weather-aware assignment + completion notifications, wired into the API.
4. **Cron integration** — reminder processing for due-date notifications.
5. **Header nav** — add the "Tasks" tab so the page is reachable.
6. **Tasks page** — the frontend UI.
7. **Final verification** — type-check both apps, walk through the full flow.

---

### Task 1: Schema columns + migration

**Files:**
- Modify: `packages/db/src/schema.ts`
- Create: `packages/db/src/migrations/0005_task_columns.sql`

- [ ] **Step 1: Add columns to the tasks table in the schema**

Open `packages/db/src/schema.ts` and find the `tasks` table definition:

```typescript
export const tasks = pgTable("tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").references(() => workspaces.id).notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  dueDate: date("due_date").notNull(),
  createdBy: uuid("created_by").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

Replace it with:

```typescript
export const tasks = pgTable("tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").references(() => workspaces.id).notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  dueDate: date("due_date").notNull(),
  assigneeId: uuid("assignee_id").references(() => users.id).notNull(),
  status: varchar("status", { length: 10 }).default("open").notNull(),
  completedAt: timestamp("completed_at"),
  createdBy: uuid("created_by").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

Note: `text` should already be imported from `drizzle-orm/pg-core` — verify it's in the import list. If not, add it.

- [ ] **Step 2: Create migration SQL**

Create `packages/db/src/migrations/0005_task_columns.sql`:

```sql
ALTER TABLE tasks ADD COLUMN description TEXT;
ALTER TABLE tasks ADD COLUMN assignee_id UUID NOT NULL REFERENCES users(id);
ALTER TABLE tasks ADD COLUMN status VARCHAR(10) NOT NULL DEFAULT 'open';
ALTER TABLE tasks ADD COLUMN completed_at TIMESTAMPTZ;
```

- [ ] **Step 3: Type-check**

Run: `cd /Users/ryanhaugland/guac/apps/api && npx tsc --noEmit`

Expected: exits with no output, exit code 0.

- [ ] **Step 4: Commit**

```bash
cd /Users/ryanhaugland/guac
git add packages/db/src/schema.ts packages/db/src/migrations/0005_task_columns.sql
git commit -m "feat(tasks): add schema columns and migration"
```

---

### Task 2: Tasks API — CRUD endpoints

**Files:**
- Create: `apps/api/src/routes/tasks.ts`
- Modify: `apps/api/src/index.ts`

**Context for implementer:** This task creates the four CRUD endpoints (POST, GET, PATCH, DELETE) for tasks. Notification dispatch is handled in Task 3 — this task focuses on the data operations only. The file follows the same Hono router pattern as `apps/api/src/routes/messages.ts`. Use the `requireAuth` middleware from `../middleware/auth`. Access `userId` via `c.get("userId")`.

The `isMissingTable` defensive pattern must be applied: wrap all DB operations on `tasks` and `taskNotifications` in try/catch, and if the error code is `"42P01"` (undefined_table), return a graceful response instead of 500-ing.

- [ ] **Step 1: Create the tasks route file with the isMissingTable helper and POST endpoint**

Create `apps/api/src/routes/tasks.ts`:

```typescript
import { Hono } from "hono";
import { requireAuth } from "../middleware/auth";
import { db, tasks, taskNotifications, workspaceMembers, users } from "@guac/db";
import { eq, and, desc, asc } from "drizzle-orm";

function isMissingTable(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "42P01";
}

const tasksRouter = new Hono();
tasksRouter.use("*", requireAuth);

// POST /api/tasks — create a task
tasksRouter.post("/", async (c) => {
  const userId = c.get("userId");
  const { workspaceId, assigneeId, title, description, dueDate } = await c.req.json<{
    workspaceId: string;
    assigneeId: string;
    title: string;
    description?: string;
    dueDate: string;
  }>();

  if (!title?.trim()) return c.json({ error: "Title is required" }, 400);
  if (!workspaceId || !assigneeId || !dueDate) return c.json({ error: "workspaceId, assigneeId, and dueDate are required" }, 400);

  // Validate both creator and assignee are workspace members
  try {
    const members = await db.select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.workspaceId, workspaceId));
    const memberIds = new Set(members.map((m) => m.userId));
    if (!memberIds.has(userId)) return c.json({ error: "You are not a member of this workspace" }, 403);
    if (!memberIds.has(assigneeId)) return c.json({ error: "Assignee is not a member of this workspace" }, 400);
  } catch (err) {
    if (isMissingTable(err)) return c.json({ error: "Tasks feature not available — migration pending" }, 503);
    throw err;
  }

  try {
    const [task] = await db.insert(tasks).values({
      workspaceId,
      assigneeId,
      title: title.trim(),
      description: description?.trim() || null,
      dueDate,
      createdBy: userId,
    }).returning();

    // Schedule reminder notifications based on assignee's timing preferences
    const [assignee] = await db.select({ notificationTimings: users.notificationTimings })
      .from(users).where(eq(users.id, assigneeId));
    const timings = assignee?.notificationTimings ?? ["day_of"];
    const dueDateMs = new Date(dueDate + "T00:00:00Z").getTime();
    const TIMING_OFFSETS: Record<string, number> = {
      "2_weeks": 14 * 86400000,
      "1_week": 7 * 86400000,
      "3_days": 3 * 86400000,
      "2_days": 2 * 86400000,
      "day_of": 0,
    };
    const now = Date.now();
    const notifRows = timings
      .filter((t: string) => TIMING_OFFSETS[t] !== undefined)
      .map((t: string) => ({
        taskId: task.id,
        userId: assigneeId,
        timing: t,
        scheduledFor: new Date(dueDateMs - (TIMING_OFFSETS[t] ?? 0)),
      }))
      .filter((r) => r.scheduledFor.getTime() > now);

    if (notifRows.length > 0) {
      await db.insert(taskNotifications).values(notifRows);
    }

    return c.json(task, 201);
  } catch (err) {
    if (isMissingTable(err)) return c.json({ error: "Tasks feature not available — migration pending" }, 503);
    throw err;
  }
});

// GET /api/tasks — list tasks
tasksRouter.get("/", async (c) => {
  const userId = c.get("userId");
  const workspaceId = c.req.query("workspaceId");
  const role = c.req.query("role") ?? "assignee";
  const status = c.req.query("status") ?? "open";

  if (!workspaceId) return c.json({ error: "workspaceId is required" }, 400);

  try {
    const roleFilter = role === "creator"
      ? eq(tasks.createdBy, userId)
      : eq(tasks.assigneeId, userId);

    const conditions = [eq(tasks.workspaceId, workspaceId), roleFilter];
    if (status !== "all") {
      conditions.push(eq(tasks.status, status));
    }

    const rows = await db.select({
      id: tasks.id,
      workspaceId: tasks.workspaceId,
      title: tasks.title,
      description: tasks.description,
      dueDate: tasks.dueDate,
      assigneeId: tasks.assigneeId,
      status: tasks.status,
      completedAt: tasks.completedAt,
      createdBy: tasks.createdBy,
      createdAt: tasks.createdAt,
    })
      .from(tasks)
      .where(and(...conditions))
      .orderBy(status === "done" ? desc(tasks.completedAt) : asc(tasks.dueDate));

    // Attach creator and assignee names
    const userIds = new Set(rows.flatMap((r) => [r.createdBy, r.assigneeId]));
    const userRows = userIds.size > 0
      ? await db.select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(eq(users.id, Array.from(userIds)[0] as string))
          // Simple approach: fetch all relevant users
      : [];

    // Better: fetch all users in the workspace once
    const wsMembers = await db.select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .innerJoin(workspaceMembers, eq(users.id, workspaceMembers.userId))
      .where(eq(workspaceMembers.workspaceId, workspaceId));
    const userMap = new Map(wsMembers.map((u) => [u.id, u]));

    const tasksWithNames = rows.map((t) => ({
      ...t,
      creatorName: userMap.get(t.createdBy)?.name ?? userMap.get(t.createdBy)?.email ?? "Unknown",
      assigneeName: userMap.get(t.assigneeId)?.name ?? userMap.get(t.assigneeId)?.email ?? "Unknown",
    }));

    return c.json(tasksWithNames);
  } catch (err) {
    if (isMissingTable(err)) return c.json([], 200);
    throw err;
  }
});

// PATCH /api/tasks/:id — update a task
tasksRouter.patch("/:id", async (c) => {
  const userId = c.get("userId");
  const taskId = c.req.param("id");
  const body = await c.req.json<{
    title?: string;
    description?: string;
    dueDate?: string;
    status?: "open" | "done";
  }>();

  try {
    const [existing] = await db.select().from(tasks).where(eq(tasks.id, taskId));
    if (!existing) return c.json({ error: "Task not found" }, 404);

    const isCreator = existing.createdBy === userId;
    const isAssignee = existing.assigneeId === userId;
    if (!isCreator && !isAssignee) return c.json({ error: "Not authorized" }, 403);

    // Assignee can only update status
    if (!isCreator && (body.title || body.description !== undefined || body.dueDate)) {
      return c.json({ error: "Only the creator can edit task details" }, 403);
    }

    const updates: Record<string, unknown> = {};
    if (body.title && isCreator) updates.title = body.title.trim();
    if (body.description !== undefined && isCreator) updates.description = body.description?.trim() || null;
    if (body.dueDate && isCreator) updates.dueDate = body.dueDate;

    // Status transition to "done"
    if (body.status === "done" && existing.status !== "done") {
      updates.status = "done";
      updates.completedAt = new Date();
      // Cancel pending reminders
      await db.update(taskNotifications)
        .set({ sent: true })
        .where(and(eq(taskNotifications.taskId, taskId), eq(taskNotifications.sent, false)));
    }

    // Due date change: reschedule reminders
    if (body.dueDate && isCreator && body.dueDate !== existing.dueDate) {
      // Delete unsent reminders
      await db.delete(taskNotifications)
        .where(and(eq(taskNotifications.taskId, taskId), eq(taskNotifications.sent, false)));
      // Recompute
      const [assignee] = await db.select({ notificationTimings: users.notificationTimings })
        .from(users).where(eq(users.id, existing.assigneeId));
      const timings = assignee?.notificationTimings ?? ["day_of"];
      const dueDateMs = new Date(body.dueDate + "T00:00:00Z").getTime();
      const TIMING_OFFSETS: Record<string, number> = {
        "2_weeks": 14 * 86400000,
        "1_week": 7 * 86400000,
        "3_days": 3 * 86400000,
        "2_days": 2 * 86400000,
        "day_of": 0,
      };
      const now = Date.now();
      const notifRows = timings
        .filter((t: string) => TIMING_OFFSETS[t] !== undefined)
        .map((t: string) => ({
          taskId,
          userId: existing.assigneeId,
          timing: t,
          scheduledFor: new Date(dueDateMs - (TIMING_OFFSETS[t] ?? 0)),
        }))
        .filter((r) => r.scheduledFor.getTime() > now);
      if (notifRows.length > 0) {
        await db.insert(taskNotifications).values(notifRows);
      }
    }

    if (Object.keys(updates).length > 0) {
      const [updated] = await db.update(tasks).set(updates).where(eq(tasks.id, taskId)).returning();
      return c.json(updated);
    }
    return c.json(existing);
  } catch (err) {
    if (isMissingTable(err)) return c.json({ error: "Tasks feature not available — migration pending" }, 503);
    throw err;
  }
});

// DELETE /api/tasks/:id — delete a task (creator only)
tasksRouter.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const taskId = c.req.param("id");

  try {
    const [existing] = await db.select().from(tasks).where(eq(tasks.id, taskId));
    if (!existing) return c.json({ error: "Task not found" }, 404);
    if (existing.createdBy !== userId) return c.json({ error: "Only the creator can delete a task" }, 403);

    await db.delete(taskNotifications).where(eq(taskNotifications.taskId, taskId));
    await db.delete(tasks).where(eq(tasks.id, taskId));
    return c.body(null, 204);
  } catch (err) {
    if (isMissingTable(err)) return c.json({ error: "Tasks feature not available — migration pending" }, 503);
    throw err;
  }
});

export default tasksRouter;
```

**Important:** The GET endpoint has a dead-code section (the `userRows` variable with a single-user query). The implementer should remove that dead code and use only the `wsMembers` query + `userMap` approach. The plan shows the intended final code — just delete lines 92–96 (the `const userIds` and `const userRows` block).

- [ ] **Step 2: Mount the tasks router in index.ts**

Open `apps/api/src/index.ts`. Add the import alongside the other route imports:

```typescript
import tasksRouter from "./routes/tasks";
```

Add the route mount alongside the other `app.route` calls:

```typescript
app.route("/api/tasks", tasksRouter);
```

- [ ] **Step 3: Type-check both apps**

```bash
cd /Users/ryanhaugland/guac/apps/api && npx tsc --noEmit
cd /Users/ryanhaugland/guac/apps/web && npx tsc --noEmit
```

Expected: both exit cleanly.

- [ ] **Step 4: Commit**

```bash
cd /Users/ryanhaugland/guac
git add apps/api/src/routes/tasks.ts apps/api/src/index.ts
git commit -m "feat(tasks): task CRUD API routes"
```

---

### Task 3: Weather-aware notification dispatch

**Files:**
- Modify: `apps/api/src/routes/tasks.ts`

**Context for implementer:** Wire the assignment and completion notifications into the task API. On task creation (POST), dispatch an assignment notification to the assignee. On status change to "done" (PATCH), dispatch a completion notification to the creator. Both are weather-aware: check `effectiveCodeForUser`, dispatch immediately if sunny/partly-cloudy, otherwise insert a `scheduledMessages` row.

- [ ] **Step 1: Add imports for notification support**

At the top of `apps/api/src/routes/tasks.ts`, add these imports:

```typescript
import { dispatchMessage } from "./messages";
import { effectiveCodeForUser, SUNNY_CODES } from "../services/scheduled-messages";
import { scheduledMessages } from "@guac/db";
```

Note: `scheduledMessages` must be exported from `@guac/db`. Verify it is — if not, add it to the package's barrel export. Also import `users` if not already imported (it should be from Task 2).

- [ ] **Step 2: Create a weather-aware notify helper inside tasks.ts**

Add this function after the `isMissingTable` helper, before the router:

```typescript
const APP_URL = process.env.APP_URL ?? "https://app.newsky.chat";

async function notifyWeatherAware(args: {
  workspaceId: string;
  senderId: string;
  recipientId: string;
  body: string;
}): Promise<void> {
  try {
    const code = await effectiveCodeForUser(args.recipientId);
    if (SUNNY_CODES.has(code)) {
      await dispatchMessage(args);
    } else {
      // Queue for when recipient's weather clears
      await db.insert(scheduledMessages).values({
        workspaceId: args.workspaceId,
        senderId: args.senderId,
        recipientId: args.recipientId,
        body: args.body,
        status: "pending",
      });
    }
  } catch (err) {
    // Log but don't fail the task operation if notification fails
    console.error("[tasks] notification dispatch failed", err);
  }
}
```

- [ ] **Step 3: Wire assignment notification into POST endpoint**

In the POST handler, after inserting the task row and scheduling reminders (just before `return c.json(task, 201)`), add:

```typescript
    // Dispatch assignment notification (weather-aware)
    const [creator] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId));
    const creatorName = creator?.name ?? "Someone";
    const formattedDue = new Date(dueDate + "T00:00:00Z").toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });
    await notifyWeatherAware({
      workspaceId,
      senderId: userId,
      recipientId: assigneeId,
      body: `${creatorName} assigned you a task: ${task.title} (due ${formattedDue})\nView it at ${APP_URL}/dashboard/tasks`,
    });
```

- [ ] **Step 4: Wire completion notification into PATCH endpoint**

In the PATCH handler, inside the `if (body.status === "done" ...)` block, after cancelling reminders and before closing the `if`, add:

```typescript
      // Notify creator that task was completed (weather-aware)
      const [assigneeUser] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId));
      const assigneeName = assigneeUser?.name ?? "Someone";
      await notifyWeatherAware({
        workspaceId: existing.workspaceId,
        senderId: userId,
        recipientId: existing.createdBy,
        body: `${assigneeName} completed: ${existing.title}`,
      });
```

- [ ] **Step 5: Type-check**

```bash
cd /Users/ryanhaugland/guac/apps/api && npx tsc --noEmit
```

Expected: exits cleanly.

- [ ] **Step 6: Commit**

```bash
cd /Users/ryanhaugland/guac
git add apps/api/src/routes/tasks.ts
git commit -m "feat(tasks): weather-aware assignment and completion notifications"
```

---

### Task 4: Cron integration for task reminders

**Files:**
- Modify: `apps/api/src/routes/cron.ts`

**Context for implementer:** Add a new cron endpoint `POST /process-task-reminders` that queries `taskNotifications` for unsent rows where `scheduledFor <= now()`, checks the assignee's weather, and dispatches reminders via `dispatchMessage` if sunny. Skips stormy recipients (they'll be retried on the next cron run).

- [ ] **Step 1: Add the reminder processing endpoint**

Open `apps/api/src/routes/cron.ts`. Add the necessary imports at the top (adapt to whatever import style the file uses):

```typescript
import { db, taskNotifications, tasks, users } from "@guac/db";
import { eq, and, lte } from "drizzle-orm";
import { dispatchMessage } from "./messages";
import { effectiveCodeForUser, SUNNY_CODES } from "../services/scheduled-messages";
```

Note: some of these imports may already exist in the file. Merge with existing imports — don't duplicate.

Add this endpoint before the `export default` line:

```typescript
const APP_URL = process.env.APP_URL ?? "https://app.newsky.chat";

// POST /api/cron/process-task-reminders
cron.post("/process-task-reminders", async (c) => {
  try {
    const pending = await db.select({
      notifId: taskNotifications.id,
      taskId: taskNotifications.taskId,
      userId: taskNotifications.userId,
      timing: taskNotifications.timing,
    })
      .from(taskNotifications)
      .where(and(
        eq(taskNotifications.sent, false),
        lte(taskNotifications.scheduledFor, new Date()),
      ));

    let sent = 0;
    for (const notif of pending) {
      // Skip if task is already done
      const [task] = await db.select({
        id: tasks.id,
        title: tasks.title,
        dueDate: tasks.dueDate,
        status: tasks.status,
        workspaceId: tasks.workspaceId,
        createdBy: tasks.createdBy,
      }).from(tasks).where(eq(tasks.id, notif.taskId));

      if (!task || task.status === "done") {
        await db.update(taskNotifications)
          .set({ sent: true })
          .where(eq(taskNotifications.id, notif.notifId));
        continue;
      }

      // Check weather — skip if stormy (retry next run)
      const code = await effectiveCodeForUser(notif.userId);
      if (!SUNNY_CODES.has(code)) continue;

      // Build reminder message
      const [creator] = await db.select({ name: users.name }).from(users).where(eq(users.id, task.createdBy));
      const creatorName = creator?.name ?? "Someone";
      const dueDate = new Date(task.dueDate + "T00:00:00Z");
      const now = new Date();
      const diffDays = Math.ceil((dueDate.getTime() - now.getTime()) / 86400000);
      const relativeTime =
        diffDays <= 0 ? "today" :
        diffDays === 1 ? "tomorrow" :
        `in ${diffDays} days`;

      try {
        await dispatchMessage({
          workspaceId: task.workspaceId,
          senderId: task.createdBy,
          recipientId: notif.userId,
          body: `Reminder: ${task.title} is due ${relativeTime} (assigned by ${creatorName})\nView it at ${APP_URL}/dashboard/tasks`,
        });
        await db.update(taskNotifications)
          .set({ sent: true })
          .where(eq(taskNotifications.id, notif.notifId));
        sent++;
      } catch (err) {
        console.error("[cron] task reminder dispatch failed", { notifId: notif.notifId, err });
      }
    }

    return c.json({ ok: true, processed: pending.length, sent });
  } catch (err) {
    if (typeof err === "object" && err !== null && (err as { code?: string }).code === "42P01") {
      return c.json({ ok: true, processed: 0, sent: 0, note: "tasks tables not migrated yet" });
    }
    throw err;
  }
});
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/ryanhaugland/guac/apps/api && npx tsc --noEmit
```

Expected: exits cleanly.

- [ ] **Step 3: Commit**

```bash
cd /Users/ryanhaugland/guac
git add apps/api/src/routes/cron.ts
git commit -m "feat(tasks): cron endpoint for weather-aware task reminders"
```

---

### Task 5: Header nav — add Tasks tab

**Files:**
- Modify: `apps/web/src/app/dashboard/components/Header.tsx`

**Context for implementer:** The Header component has a `tabs` array with `{ label, href }` entries. Add a "Tasks" entry between "Chat" and the settings gear. The tab activation logic uses `pathname.startsWith(tab.href)` for non-root tabs, so `/dashboard/tasks` will auto-activate correctly.

- [ ] **Step 1: Add the Tasks tab**

Open `apps/web/src/app/dashboard/components/Header.tsx`. Find the `tabs` array:

```typescript
const tabs = [
  { label: "Weather", href: "/dashboard" },
  { label: "Chat", href: "/dashboard/chat" },
];
```

Add the Tasks entry:

```typescript
const tabs = [
  { label: "Weather", href: "/dashboard" },
  { label: "Chat", href: "/dashboard/chat" },
  { label: "Tasks", href: "/dashboard/tasks" },
];
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/ryanhaugland/guac/apps/web && npx tsc --noEmit
```

Expected: exits cleanly.

- [ ] **Step 3: Commit**

```bash
cd /Users/ryanhaugland/guac
git add apps/web/src/app/dashboard/components/Header.tsx
git commit -m "feat(tasks): add Tasks tab to dashboard header nav"
```

---

### Task 6: Tasks page — frontend UI

**Files:**
- Create: `apps/web/src/app/dashboard/tasks/page.tsx`

**Context for implementer:** This is the main tasks page. It follows the same patterns as `apps/web/src/app/dashboard/chat/page.tsx` — a `"use client"` page that fetches data from the API via `fetch`, manages state with React hooks, and uses Tailwind for styling. The page should use the iOS-gray background and rounded card styling consistent with the iMessage chat redesign.

Key behaviors:
- Two toggle tabs at top: "Assigned to me" (default) and "Assigned by me"
- Green `+` button to create new tasks
- Task rows with checkbox, title, assignee/assigner name, due date pill
- Tap checkbox to mark done
- Tap row to expand inline details
- Completed tasks in a collapsible accordion at the bottom
- New task form as a full-screen overlay on mobile (iOS modal pattern)
- Polls or refetches after mutations

The implementer should look at how `chat/page.tsx` handles:
- Auth token retrieval for API calls (check for a `getToken` utility or cookie-based fetch)
- The iOS modal header pattern (`grid-cols-3`)
- Mobile vs desktop breakpoints (`md:hidden` / `hidden md:flex`)

- [ ] **Step 1: Create the tasks page**

Create `apps/web/src/app/dashboard/tasks/page.tsx`. This is a large file — the implementer should:

1. Read the chat page (`apps/web/src/app/dashboard/chat/page.tsx`) to understand the auth fetch pattern, API base URL resolution, and component structure.
2. Build the page with these sections:

**Page shell:**
```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
```

**State:**
- `tasks` — array of task objects from GET /api/tasks
- `role` — `"assignee"` | `"creator"` (toggle tab)
- `showCreateForm` — boolean for new-task overlay
- `expandedTaskId` — string | null for inline detail expansion
- `showCompleted` — boolean for the completed accordion
- Form state: `newTitle`, `newDescription`, `newAssigneeId`, `newDueDate`
- `workspaceId` — fetched from the user's workspace (same pattern as chat)
- `members` — workspace members for the assignee picker
- `creating` — boolean loading state for form submission

**Data fetching:**
- On mount and when `role` changes: `GET /api/tasks?workspaceId={id}&role={role}&status=open`
- Separate fetch for done tasks: `GET /api/tasks?workspaceId={id}&role={role}&status=done`
- After any mutation (create, complete, delete): refetch both

**Top bar layout:**
```tsx
<div className="px-4 pt-4 pb-3 border-b border-gray-100 flex items-center justify-between">
  <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
    <button
      onClick={() => setRole("assignee")}
      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
        role === "assignee" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
      }`}
    >
      Assigned to me
    </button>
    <button
      onClick={() => setRole("creator")}
      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
        role === "creator" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
      }`}
    >
      Assigned by me
    </button>
  </div>
  <button
    onClick={() => setShowCreateForm(true)}
    className="w-8 h-8 bg-green-primary text-white rounded-full flex items-center justify-center active:scale-95 transition-transform"
    aria-label="New task"
  >
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  </button>
</div>
```

**Task row component (inline, not extracted):**
```tsx
<div className="mx-4 mt-3 bg-white rounded-2xl shadow-sm overflow-hidden">
  {openTasks.map((task) => {
    const isExpanded = expandedTaskId === task.id;
    const dueDateObj = new Date(task.dueDate + "T00:00:00Z");
    const now = new Date();
    const diffMs = dueDateObj.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / 86400000);
    const dueColor =
      diffDays < 0 ? "bg-red-50 text-red-600" :
      diffDays <= 1 ? "bg-amber-50 text-amber-700" :
      "bg-gray-100 text-gray-600";
    const dueLabel =
      diffDays < 0 ? "Overdue" :
      diffDays === 0 ? "Today" :
      diffDays === 1 ? "Tomorrow" :
      dueDateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" });

    return (
      <div key={task.id} className="border-b border-gray-100 last:border-b-0">
        <div className="flex items-center gap-3 px-4 py-3">
          {/* Checkbox */}
          <button
            onClick={() => handleComplete(task.id)}
            className="w-6 h-6 rounded-full border-2 border-gray-300 flex items-center justify-center flex-shrink-0 hover:border-green-primary transition-colors"
            aria-label={`Mark "${task.title}" as done`}
          />
          {/* Main content — tap to expand */}
          <button
            onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
            className="flex-1 min-w-0 text-left"
          >
            <p className="text-[15px] font-semibold text-gray-900 truncate">{task.title}</p>
            <p className="text-sm text-gray-500 truncate">
              {role === "assignee" ? `From ${task.creatorName}` : `To ${task.assigneeName}`}
            </p>
          </button>
          {/* Due date pill */}
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${dueColor}`}>
            {dueLabel}
          </span>
        </div>
        {/* Expanded details */}
        {isExpanded && (
          <div className="px-4 pb-3 border-t border-gray-50">
            {task.description && (
              <p className="text-sm text-gray-600 mt-2">{task.description}</p>
            )}
            <p className="text-xs text-gray-400 mt-2">
              Created {new Date(task.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </p>
            {task.createdBy === userId && (
              <button
                onClick={() => handleDelete(task.id)}
                className="mt-2 text-xs text-red-500 hover:text-red-700"
              >
                Delete task
              </button>
            )}
          </div>
        )}
      </div>
    );
  })}
</div>
```

**Empty state:**
```tsx
{openTasks.length === 0 && (
  <div className="flex-1 flex items-center justify-center">
    <p className="text-gray-400 text-sm">
      {role === "assignee" ? "No open tasks assigned to you" : "No tasks assigned by you"}
    </p>
  </div>
)}
```

**Completed accordion:**
```tsx
{doneTasks.length > 0 && (
  <div className="mx-4 mt-4 mb-4">
    <button
      onClick={() => setShowCompleted(!showCompleted)}
      className="text-sm text-gray-500 font-medium flex items-center gap-1"
    >
      <svg className={`w-4 h-4 transition-transform ${showCompleted ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
      Completed ({doneTasks.length})
    </button>
    {showCompleted && (
      <div className="mt-2 bg-white rounded-2xl shadow-sm overflow-hidden">
        {doneTasks.map((task) => (
          <div key={task.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-b-0">
            <div className="w-6 h-6 rounded-full bg-green-primary flex items-center justify-center flex-shrink-0">
              <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-[15px] text-gray-400 line-through truncate flex-1">{task.title}</p>
            <span className="text-xs text-gray-400 flex-shrink-0">
              {task.completedAt ? new Date(task.completedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}
            </span>
          </div>
        ))}
      </div>
    )}
  </div>
)}
```

**New task form (mobile iOS modal + desktop modal):**

```tsx
{showCreateForm && (
  <div className="fixed inset-0 z-50 bg-white md:bg-black/30 md:flex md:items-center md:justify-center">
    <div className="w-full h-full md:w-[480px] md:h-auto md:max-h-[90vh] md:rounded-2xl bg-white md:shadow-xl flex flex-col">
      {/* Header */}
      <div className="grid grid-cols-3 items-center px-4 py-3 border-b border-gray-100">
        <button
          onClick={() => { setShowCreateForm(false); setNewTitle(""); setNewDescription(""); setNewAssigneeId(""); setNewDueDate(""); }}
          className="justify-self-start text-[15px] text-gray-500 active:opacity-60"
        >
          Cancel
        </button>
        <h3 className="justify-self-center text-[17px] font-semibold text-gray-900">New Task</h3>
        <button
          onClick={handleCreate}
          disabled={creating || !newTitle.trim() || !newAssigneeId || !newDueDate}
          className="justify-self-end text-[15px] font-semibold text-green-primary disabled:text-gray-300 active:opacity-60"
        >
          {creating ? "Creating…" : "Create"}
        </button>
      </div>
      {/* Form fields */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="What needs to be done?"
            className="w-full px-3 py-2 bg-gray-50 rounded-xl text-[15px] focus:outline-none focus:ring-2 focus:ring-green-primary/30"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
          <textarea
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="Add details…"
            rows={3}
            className="w-full px-3 py-2 bg-gray-50 rounded-xl text-[15px] focus:outline-none focus:ring-2 focus:ring-green-primary/30 resize-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Assign to</label>
          <select
            value={newAssigneeId}
            onChange={(e) => setNewAssigneeId(e.target.value)}
            className="w-full px-3 py-2 bg-gray-50 rounded-xl text-[15px] focus:outline-none focus:ring-2 focus:ring-green-primary/30"
          >
            <option value="">Select a team member</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name ?? m.email ?? "Unknown"}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Due date</label>
          <input
            type="date"
            value={newDueDate}
            onChange={(e) => setNewDueDate(e.target.value)}
            min={new Date().toISOString().split("T")[0]}
            className="w-full px-3 py-2 bg-gray-50 rounded-xl text-[15px] focus:outline-none focus:ring-2 focus:ring-green-primary/30"
          />
        </div>
      </div>
    </div>
  </div>
)}
```

**Handler functions:** The implementer must write `handleCreate`, `handleComplete`, `handleDelete`, and the data-fetching logic by following the patterns in `chat/page.tsx`. All API calls should use the same auth/fetch pattern the chat page uses.

**Page wrapper:**
```tsx
<div className="flex flex-col h-full bg-[#F2F2F7]">
  {/* top bar */}
  {/* task list */}
  {/* empty state */}
  {/* completed accordion */}
  {/* create form overlay */}
</div>
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/ryanhaugland/guac/apps/web && npx tsc --noEmit
```

Expected: exits cleanly.

- [ ] **Step 3: Commit**

```bash
cd /Users/ryanhaugland/guac
git add apps/web/src/app/dashboard/tasks/page.tsx
git commit -m "feat(tasks): tasks page UI with create, complete, delete flows"
```

---

### Task 7: Final verification

**Files:**
- No code changes. Verification only.

**Context for implementer:** A final pass to confirm the tasks feature is complete and nothing regressed.

- [ ] **Step 1: Full type-check across all apps**

```bash
cd /Users/ryanhaugland/guac/apps/web && npx tsc --noEmit
cd /Users/ryanhaugland/guac/apps/api && npx tsc --noEmit
```

Expected: both exit cleanly.

- [ ] **Step 2: Full feature smoke test**

Walk through every scenario below:

- **Tasks page**
  - [ ] "Tasks" tab appears in header nav between "Chat" and settings gear.
  - [ ] Tasks page loads at `/dashboard/tasks`. Default view: "Assigned to me" active, no tasks (empty state text visible).
  - [ ] Toggle to "Assigned by me" — empty state updates.
  - [ ] Green `+` button opens new task form.

- **Create task**
  - [ ] Form opens as full-screen on mobile, modal on desktop.
  - [ ] Header: Cancel / New Task / Create (Create disabled until title + assignee + due date filled).
  - [ ] Assignee dropdown lists workspace members.
  - [ ] Create a task → task appears in "Assigned by me" list. Row shows title, assignee name, due date pill.
  - [ ] Assignee's "Assigned to me" list shows the new task with creator's name.

- **Complete task**
  - [ ] Tap the circle checkbox → task moves to "Completed" accordion.
  - [ ] Accordion shows count, expands to show completed tasks with strikethrough + date.

- **Expand/delete**
  - [ ] Tap a task row (not checkbox) → expands to show description, created date.
  - [ ] Creator sees "Delete task" link. Tap → task removed.
  - [ ] Assignee does NOT see delete link.

- **Notifications (requires a running API + channel config)**
  - [ ] Create task assigned to a teammate with a configured channel → they receive the assignment notification via their preferred channel.
  - [ ] If teammate is stormy (⛈️) → notification queues. Flip weather to sunny → notification flushes.
  - [ ] Complete a task → creator receives completion notification.

- **Due date pills**
  - [ ] Task due in 5+ days: gray pill.
  - [ ] Task due tomorrow: amber pill.
  - [ ] Task overdue: red pill.

- **Desktop regression**
  - [ ] Weather page, chat page, settings page all unchanged.
  - [ ] Tasks page renders properly at desktop breakpoint.

- [ ] **Step 3: Confirm done**

If all above items pass, the feature is complete.
