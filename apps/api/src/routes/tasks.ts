import { Hono } from "hono";
import { requireAuth } from "../middleware/auth";
import { db, tasks, taskNotifications, workspaceMembers, users } from "@guac/db";
import { eq, and, desc, asc } from "drizzle-orm";

type Env = {
  Variables: {
    userId: string;
  };
};

function isMissingTable(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "42P01";
}

const tasksRouter = new Hono<Env>();
tasksRouter.use("*", requireAuth);

// POST /api/tasks — create a task
tasksRouter.post("/", async (c) => {
  const userId = c.get("userId");
  const { workspaceId, assigneeId, title, description, dueDate } = await c.req.json();

  if (!title?.trim()) return c.json({ error: "Title is required" }, 400);
  if (!workspaceId || !assigneeId || !dueDate) return c.json({ error: "workspaceId, assigneeId, and dueDate are required" }, 400);

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

    // Schedule reminder notifications based on assignee's timing preferences
    const [assignee] = await db.select({ notificationTimings: users.notificationTimings })
      .from(users).where(eq(users.id, assigneeId as string));
    const timings = assignee?.notificationTimings ?? ["day_of"];
    const dueDateMs = new Date((dueDate as string) + "T00:00:00Z").getTime();
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
        userId: assigneeId as string,
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

    // Fetch all users in the workspace and build a lookup map
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
  const body = await c.req.json();

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
    if (body.title && isCreator) updates.title = (body.title as string).trim();
    if (body.description !== undefined && isCreator) updates.description = body.description ? (body.description as string).trim() || null : null;
    if (body.dueDate && isCreator) updates.dueDate = body.dueDate as string;

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
    if (body.dueDate && isCreator && (body.dueDate as string) !== existing.dueDate) {
      // Delete unsent reminders
      await db.delete(taskNotifications)
        .where(and(eq(taskNotifications.taskId, taskId), eq(taskNotifications.sent, false)));
      // Recompute
      const [assignee] = await db.select({ notificationTimings: users.notificationTimings })
        .from(users).where(eq(users.id, existing.assigneeId));
      const timings = assignee?.notificationTimings ?? ["day_of"];
      const dueDateMs = new Date((body.dueDate as string) + "T00:00:00Z").getTime();
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
