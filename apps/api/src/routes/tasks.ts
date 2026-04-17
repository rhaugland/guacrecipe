import { Hono } from "hono";
import { requireAuth } from "../middleware/auth";
import { db, tasks, taskNotifications, workspaceMembers, users, scheduledMessages } from "@guac/db";
import { eq, and, desc, asc } from "drizzle-orm";
import { dispatchMessage } from "./messages";
import { effectiveCodeForUser, SUNNY_CODES } from "../services/scheduled-messages";

type Env = {
  Variables: {
    userId: string;
  };
};

function isMissingTable(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "42P01";
}

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
      await db.insert(scheduledMessages).values({
        workspaceId: args.workspaceId,
        senderId: args.senderId,
        recipientId: args.recipientId,
        body: args.body,
        condition: "recipient_sunny",
        status: "pending",
      });
    }
  } catch (err) {
    console.error("[tasks] notification dispatch failed", err);
  }
}

const TIMING_OFFSETS: Record<string, number> = {
  "2_weeks": 14 * 86400000,
  "1_week": 7 * 86400000,
  "3_days": 3 * 86400000,
  "2_days": 2 * 86400000,
  "day_of": 0,
};

async function scheduleTaskNotifications(taskId: string, assigneeId: string, dueDate: string): Promise<void> {
  const [assignee] = await db.select({ notificationTimings: users.notificationTimings })
    .from(users).where(eq(users.id, assigneeId));
  const timings = assignee?.notificationTimings ?? ["day_of"];
  const dueDateMs = new Date(dueDate + "T00:00:00Z").getTime();
  const now = Date.now();
  const notifRows = timings
    .filter((t: string) => TIMING_OFFSETS[t] !== undefined)
    .map((t: string) => ({
      taskId,
      userId: assigneeId,
      timing: t,
      scheduledFor: new Date(dueDateMs - (TIMING_OFFSETS[t] ?? 0)),
    }))
    .filter((r) => r.scheduledFor.getTime() > now);
  if (notifRows.length > 0) {
    await db.insert(taskNotifications).values(notifRows);
  }
}

const tasksRouter = new Hono<Env>();
tasksRouter.use("*", requireAuth);

// POST /api/tasks — create a task
tasksRouter.post("/", async (c) => {
  const userId = c.get("userId");
  const { workspaceId, assigneeId, title, description, dueDate } = await c.req.json();

  if (!title?.trim()) return c.json({ error: "Title is required" }, 400);
  if (!workspaceId || !assigneeId || !dueDate) return c.json({ error: "workspaceId, assigneeId, and dueDate are required" }, 400);
  const dueDateParsed = new Date(dueDate + "T00:00:00Z");
  if (isNaN(dueDateParsed.getTime())) return c.json({ error: "Invalid due date" }, 400);
  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);
  if (dueDateParsed.getTime() < startOfToday.getTime()) return c.json({ error: "Due date must be today or in the future" }, 400);

  // Validate both creator and assignee are workspace members
  try {
    const members = await db.select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.workspaceId, workspaceId as string));
    const memberIds = new Set(members.map((m) => m.userId));
    if (!memberIds.has(userId)) return c.json({ error: "You are not a member of this workspace" }, 403);
    if (!memberIds.has(assigneeId as string)) return c.json({ error: "Assignee is not a member of this workspace" }, 400);
  } catch (err) {
    if (isMissingTable(err)) return c.json({ error: "Tasks feature not available — migration pending" }, 503);
    throw err;
  }

  try {
    const [task] = await db.insert(tasks).values({
      workspaceId: workspaceId as string,
      assigneeId: assigneeId as string,
      title: (title as string).trim(),
      description: description ? (description as string).trim() || null : null,
      dueDate: dueDate as string,
      createdBy: userId,
    }).returning();

    await scheduleTaskNotifications(task.id, assigneeId as string, dueDate as string);

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
  if (role !== "assignee" && role !== "creator") {
    return c.json({ error: "role must be 'assignee' or 'creator'" }, 400);
  }
  if (!["open", "done", "all"].includes(status)) {
    return c.json({ error: "status must be 'open', 'done', or 'all'" }, 400);
  }

  try {
    // Verify membership before fetching task data
    const wsMembers = await db.select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .innerJoin(workspaceMembers, eq(users.id, workspaceMembers.userId))
      .where(eq(workspaceMembers.workspaceId, workspaceId));
    const userMap = new Map(wsMembers.map((u) => [u.id, u]));

    if (!userMap.has(userId)) return c.json({ error: "Not a member of this workspace" }, 403);

    const assigneeIdParam = c.req.query("assigneeId");
    if (assigneeIdParam !== undefined && !assigneeIdParam.trim()) {
      return c.json({ error: "assigneeId must not be blank" }, 400);
    }

    let roleFilter;
    if (assigneeIdParam) {
      // Verify assigneeId is a workspace member
      if (!userMap.has(assigneeIdParam)) return c.json({ error: "Assignee is not a member of this workspace" }, 400);
      roleFilter = eq(tasks.assigneeId, assigneeIdParam);
    } else {
      roleFilter = role === "creator"
        ? eq(tasks.createdBy, userId)
        : eq(tasks.assigneeId, userId);
    }

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
  const body = await c.req.json();

  if (body.status && body.status !== "open" && body.status !== "done") {
    return c.json({ error: "Status must be 'open' or 'done'" }, 400);
  }

  try {
    const [existing] = await db.select().from(tasks).where(eq(tasks.id, taskId));
    if (!existing) return c.json({ error: "Task not found" }, 404);

    const [membership] = await db.select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, existing.workspaceId), eq(workspaceMembers.userId, userId)));
    if (!membership) return c.json({ error: "Not a member of this workspace" }, 403);

    const isCreator = existing.createdBy === userId;
    const isAssignee = existing.assigneeId === userId;
    if (!isCreator && !isAssignee) return c.json({ error: "Not authorized" }, 403);

    // Assignee can only update status
    if (!isCreator && (body.title || body.description !== undefined || body.dueDate)) {
      return c.json({ error: "Only the creator can edit task details" }, 403);
    }

    const updates: Record<string, unknown> = {};
    if (body.title && isCreator) updates.title = (body.title as string).trim();
    if (body.description !== undefined && isCreator) updates.description = body.description ? (body.description as string).trim() || null : null;
    if (body.dueDate && isCreator) {
      const dueDateParsed = new Date((body.dueDate as string) + "T00:00:00Z");
      if (isNaN(dueDateParsed.getTime())) return c.json({ error: "Invalid due date" }, 400);
      const startOfToday = new Date();
      startOfToday.setUTCHours(0, 0, 0, 0);
      if (dueDateParsed.getTime() < startOfToday.getTime()) return c.json({ error: "Due date must be today or in the future" }, 400);
      updates.dueDate = body.dueDate as string;
    }

    // Status transition to "done"
    if (body.status === "done" && existing.status !== "done") {
      updates.status = "done";
      updates.completedAt = new Date();
      // Cancel pending reminders
      await db.update(taskNotifications)
        .set({ sent: true })
        .where(and(eq(taskNotifications.taskId, taskId), eq(taskNotifications.sent, false)));
      // Always use assignee's name/id for the completion notification
      const [assigneeUser] = await db.select({ name: users.name }).from(users).where(eq(users.id, existing.assigneeId));
      const assigneeName = assigneeUser?.name ?? "Someone";
      // Skip self-notification if assignee is the creator
      if (existing.assigneeId !== existing.createdBy) {
        await notifyWeatherAware({
          workspaceId: existing.workspaceId,
          senderId: existing.assigneeId,
          recipientId: existing.createdBy,
          body: `${assigneeName} completed: ${existing.title}`,
        });
      }
    }

    // Due date change: reschedule reminders
    if (body.dueDate && isCreator && (body.dueDate as string) !== existing.dueDate) {
      // Delete unsent reminders then recompute
      await db.delete(taskNotifications)
        .where(and(eq(taskNotifications.taskId, taskId), eq(taskNotifications.sent, false)));
      await scheduleTaskNotifications(taskId, existing.assigneeId, body.dueDate as string);
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

    const [membership] = await db.select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, existing.workspaceId), eq(workspaceMembers.userId, userId)));
    if (!membership) return c.json({ error: "Not a member of this workspace" }, 403);

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
