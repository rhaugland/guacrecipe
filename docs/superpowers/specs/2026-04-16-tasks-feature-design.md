# Tasks Feature — Design Spec

**Date:** 2026-04-16
**Project:** New Sky / Guac
**Scope:** New `/dashboard/tasks` page + API routes + notification dispatch

## Goal

Add peer-to-peer task assignment within workspaces. Any member can assign a task to any other member. The assignee is notified via their preferred channel (email, SMS, Discord, Slack, Telegram), respecting weather status. Reminders fire based on the assignee's existing notification timing preferences.

## Non-Goals

- Multiple assignees per task (create separate tasks instead)
- Kanban board or drag-and-drop UI
- Task comments or attachments
- Inline task references in chat threads
- Task-specific channel configuration (reuses existing channel preferences)
- Notifications on task edits or deletions
- Contact grouping or filtering by contact

## Decisions

| Question | Decision |
|---|---|
| Who assigns tasks? | Any workspace member to any other member (peer-to-peer) |
| Task states? | Open and Done only |
| Notification on assignment? | Yes, via `dispatchMessage`, weather-aware |
| Reminders? | Yes, reuse assignee's `notificationTimings` preference |
| Respect weather? | Yes — assignment, reminder, and completion notifications all queue when recipient is stormy |
| Where in UI? | New top-level "Tasks" tab in header nav |
| Multiple assignees? | No — one assignee per task |

## Data Model

### Schema changes to `tasks` table

The existing `tasks` table has: `id`, `workspaceId`, `title`, `dueDate`, `createdBy`, `createdAt`.

Add the following columns:
- `assigneeId` — `text`, references `users.id`, not null. The workspace member the task is assigned to.
- `status` — `text`, `"open"` or `"done"`, default `"open"`.
- `completedAt` — `timestamp`, nullable. Set when status transitions to `"done"`.
- `description` — `text`, nullable. Optional task details.

### `taskNotifications` table (existing, no changes)

Columns: `taskId`, `userId`, `timing`, `scheduledFor`, `sent`.

Used for due-date reminders. Rows are created when a task is created, based on the assignee's `notificationTimings` preference array. Each timing slot (e.g., "3_days", "day_of") produces one row with a computed `scheduledFor` timestamp relative to the task's `dueDate`.

## API

New file: `apps/api/src/routes/tasks.ts`, mounted at `/api/tasks`. All routes require `requireAuth` middleware.

### `POST /api/tasks`

Creates a task + schedules reminder notifications + dispatches assignment notification.

**Request body:**
```json
{
  "workspaceId": "string",
  "assigneeId": "string",
  "title": "string",
  "description": "string | null",
  "dueDate": "ISO 8601 date string"
}
```

**Validation:**
- Creator and assignee must both be members of the workspace.
- Title is required, non-empty.
- Due date is required, must be in the future.
- Creator and assignee may be the same person (self-assigned tasks are allowed).

**Side effects:**
1. Insert task row.
2. Look up assignee's `notificationTimings` preference. For each timing value, compute `scheduledFor = dueDate - offset` and insert a `taskNotifications` row (skip any that would be in the past).
3. Dispatch assignment notification via the weather-aware path:
   - Check assignee's effective weather code.
   - If sunny/partly cloudy: call `dispatchMessage` immediately with body: `"{Creator name} assigned you a task: {title} (due {formatted date})\nView it at {APP_URL}/dashboard/tasks"`.
   - If stormy: insert a `scheduledMessages` row with condition `recipient_sunny` so it flushes when weather clears.

**Response:** `201` with the created task object.

### `GET /api/tasks`

Lists tasks for the authenticated user within a workspace.

**Query params:**
- `workspaceId` — required
- `role` — `"assignee"` (default) or `"creator"`. Filters by `assigneeId = user.id` or `createdBy = user.id`.
- `status` — `"open"` (default), `"done"`, or `"all"`.

**Response:** `200` with array of task objects, each including the creator's and assignee's name. Ordered by `dueDate` ascending for open tasks, `completedAt` descending for done tasks.

### `PATCH /api/tasks/:id`

Updates a task. Allowed fields depend on the caller's role:
- **Assignee** can update: `status` (to `"done"`).
- **Creator** can update: `title`, `description`, `dueDate`, `status`.

**Status transition to "done":**
1. Set `status = "done"` and `completedAt = now()`.
2. Mark all unsent `taskNotifications` for this task as `sent = true` (cancel pending reminders).
3. Dispatch completion notification to the creator (weather-aware): `"{Assignee name} completed: {title}"`.

**Due date change:**
1. Delete all unsent `taskNotifications` for this task.
2. Recompute and insert new reminder rows based on the new due date.

**Response:** `200` with the updated task object.

### `DELETE /api/tasks/:id`

Deletes a task. Creator only.

1. Delete all `taskNotifications` for this task.
2. Delete the task row.
3. No notification sent.

**Response:** `204`.

## Notification Content

### Assignment (sent to assignee)

```
{Creator name} assigned you a task: {title} (due {formatted date})
View it at {APP_URL}/dashboard/tasks
```

### Reminder (sent to assignee, triggered by cron)

```
Reminder: {title} is due {relative time} (assigned by {creator name})
View it at {APP_URL}/dashboard/tasks
```

Where `{relative time}` is "in 3 days", "tomorrow", "today", etc.

### Completion (sent to creator)

```
{Assignee name} completed: {title}
```

### Channel selection

All notifications use the existing `routeMessage` logic:
1. Check recipient's `notificationChannels` array.
2. Fall back to `preferredChannel`.
3. No task-specific channel config.

### Weather integration

All three notification types are weather-aware:
- Check recipient's effective weather code via `effectiveCodeForUser`.
- If sunny/partly cloudy: dispatch immediately.
- If stormy: queue as a scheduled message that flushes when weather clears.

## Frontend

### Header nav change

File: `apps/web/src/app/dashboard/components/Header.tsx`

Add a "Tasks" tab between "Chat" and the settings gear. Links to `/dashboard/tasks`.

### Tasks page

File: `apps/web/src/app/dashboard/tasks/page.tsx`

**Top bar:**
- Two toggle buttons: "Assigned to me" (default active) and "Assigned by me".
- Right side: green circular "+" button to open new-task form.

**Task list (open tasks):**
- Each row is a rounded card on iOS-gray background (`bg-[#F2F2F7]`), consistent with the chat redesign.
- Left: circular checkbox outline. Tap to mark done (transitions to filled green check).
- Main content: task title (`text-[15px] font-semibold`), below it the assignee or assigner name in muted text (`text-sm text-gray-500`).
- Right: due date pill.
  - Default: `bg-gray-100 text-gray-600`.
  - Due within 24h: `bg-amber-50 text-amber-700`.
  - Overdue: `bg-red-50 text-red-600`.
- Tap the row (not the checkbox) to expand inline: description, created date, edit/delete actions (creator only).

**Completed section:**
- Collapsed accordion: "Completed (N)" header, tap to expand.
- Done task rows: title with strikethrough, completion date right-aligned, muted colors.

**Empty state:** Centered muted text: "No open tasks" or "No tasks assigned by you".

### New task form (mobile)

Opens as a full-screen overlay matching the iOS modal pattern used by the broadcast composer.

**Header:** `grid-cols-3` layout:
- Left: "Cancel" (`text-[15px] text-gray-500`)
- Center: "New Task" (`text-[17px] font-semibold`)
- Right: "Create" (`text-[15px] font-semibold text-green-primary`, disabled until title + assignee + due date are filled)

**Form fields** (styled as iOS grouped-list cells, `bg-white rounded-2xl shadow-sm`):
- Title — text input, required.
- Description — textarea, optional, auto-grows.
- Assignee — dropdown/select of workspace members.
- Due date — date input.

**Desktop:** Same form content but rendered as a modal overlay rather than full-screen.

### Mobile styling

Follows the iMessage conventions from the chat redesign:
- iOS-gray background (`bg-[#F2F2F7]`)
- Rounded cards for task rows
- Same font sizes, spacing, and `active:scale-95` / `active:opacity-60` tap feedback
- Safe-area inset handling on the bottom

## Cron Integration

Extend the existing cron job (or add a new one) to process task reminders:

1. Query `taskNotifications` where `sent = false` and `scheduledFor <= now()`.
2. For each notification:
   - Look up the task (skip if status is already "done").
   - Check assignee's effective weather code.
   - If sunny/partly cloudy: dispatch reminder via `dispatchMessage`, mark `sent = true`.
   - If stormy: skip (will retry on next cron run; the weather flush system will also catch it if we insert a `scheduledMessages` row instead).
3. Log dispatch results.

## Migration

New migration file: `packages/db/migrations/0005_add_task_columns.sql`

```sql
ALTER TABLE tasks ADD COLUMN assignee_id TEXT NOT NULL REFERENCES users(id);
ALTER TABLE tasks ADD COLUMN status TEXT NOT NULL DEFAULT 'open';
ALTER TABLE tasks ADD COLUMN completed_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN description TEXT;
```

Apply the same defensive `isMissingTable` pattern used in the weather/scheduled-messages routes so the API degrades gracefully if migrations haven't been applied yet.

## Files Touched

| File | Change |
|---|---|
| `packages/db/src/schema.ts` | Add new columns to `tasks` table definition |
| `packages/db/migrations/0005_add_task_columns.sql` | Migration SQL |
| `apps/api/src/routes/tasks.ts` | New file — task CRUD + notification dispatch |
| `apps/api/src/index.ts` | Mount tasks router at `/api/tasks` |
| `apps/api/src/routes/cron.ts` (or equivalent) | Add task reminder processing |
| `apps/web/src/app/dashboard/tasks/page.tsx` | New file — tasks page |
| `apps/web/src/app/dashboard/components/Header.tsx` | Add "Tasks" tab to nav |

## Testing Strategy

- **API:** Test task CRUD endpoints manually via curl or the frontend.
  - Create task → verify task row + taskNotifications rows created.
  - Mark done → verify completedAt set, pending notifications cancelled, completion notification dispatched.
  - Delete → verify task and notifications removed.
- **Notifications:** Verify assignment notification dispatches via the correct channel (check Resend/Telnyx/Discord logs).
- **Weather:** Create a task assigned to a stormy user → verify notification queues. Flip their weather to sunny → verify it flushes.
- **Reminders:** Create a task with a due date 1 day out, set timing to "day_of" → verify cron dispatches the reminder.
- **Type-check:** `cd apps/web && npx tsc --noEmit` and `cd apps/api && npx tsc --noEmit` clean.
- **Regression:** Chat, broadcast, scheduled messages, weather — all unchanged.

## Open Questions

None — all decisions locked during brainstorming.
