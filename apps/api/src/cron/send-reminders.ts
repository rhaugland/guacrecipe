import { db, taskNotifications, tasks, users, workspaces } from "@guac/db";
import { eq, and, lte } from "drizzle-orm";
import { sendSms, sendEmail } from "../services/delivery";
import { isWithinWorkingHours } from "../services/working-hours";
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

    if (!isWithinWorkingHours(config, now)) continue;

    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, task.workspaceId));
    const label = reminder.timing.replace("_", " ");
    const msg = `Reminder: "${task.title}" is due in ${label}${workspace ? ` (${workspace.name})` : ""}.`;

    const contact = user.preferredChannel === "sms" ? user.phone! : user.email!;
    if (user.preferredChannel === "sms") await sendSms(contact, msg);
    else await sendEmail(contact, `Guac — Task reminder`, msg);

    await db.update(taskNotifications).set({ sent: true }).where(eq(taskNotifications.id, reminder.id));
  }
}
