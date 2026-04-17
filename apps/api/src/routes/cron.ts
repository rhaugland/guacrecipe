import { Hono } from "hono";
import { deliverQueuedMessages } from "../cron/deliver-queued";
import { expireConversations } from "../cron/expire-conversations";
import { expireDisambiguationSessions } from "../cron/expire-disambiguation";
import { sendReminders } from "../cron/send-reminders";
import { db, taskNotifications, tasks, users } from "@guac/db";
import { eq, and, lte } from "drizzle-orm";
import { dispatchMessage } from "./messages";
import { effectiveCodeForUser, SUNNY_CODES } from "../services/scheduled-messages";

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

export default cron;
