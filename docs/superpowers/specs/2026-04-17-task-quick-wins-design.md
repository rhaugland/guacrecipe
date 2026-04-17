# Task Quick Wins — Design Spec

**Date:** 2026-04-17
**Project:** New Sky / Guac
**Scope:** Three small features that make tasks feel native to the product

## Goal

Ship three quick wins that integrate tasks into the daily chat workflow: a badge showing open task count, task context in the chat intelligence popover, and a `/task` shortcut in the chat composer.

## Non-Goals

- New API endpoints (reuse existing CRUD)
- Task comments, attachments, or status changes from chat
- Polling or real-time updates for the badge count
- Showing tasks in the contact list rows

## Feature 1: Task Badge on Header

### Behavior

The "Tasks" tab in the header nav shows a small green pill badge with the count of open tasks assigned to the authenticated user. When the count is 0, no badge is shown.

### Data Flow

The dashboard layout (`apps/web/src/app/dashboard/layout.tsx`) fetches the open task count on mount using `api.tasks.list(workspaceId, "assignee", "open")` and passes it to `Header` as a `taskCount` prop. The count is derived from the length of the returned array. No polling — the count refreshes on page navigation when the layout re-renders.

If the user belongs to multiple workspaces, sum the open task count across all workspaces.

### Visual Design

- Green pill badge: `bg-green-primary text-white text-[10px] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center`
- Positioned inline to the right of the "Tasks" label, vertically centered
- Hidden when count is 0

## Feature 2: Tasks in Intelligence Popover

### Behavior

When the intelligence popover opens for a contact in the chat conversation view, show a "Tasks" section listing open tasks assigned to that contact within the current workspace. This gives the user context about what the contact is working on.

### API Change

Add an optional `assigneeId` query parameter to `GET /api/tasks`. When provided, the endpoint filters tasks where `assigneeId` matches the given value, regardless of whether the authenticated user is the creator or assignee. The authenticated user must still be a member of the workspace.

This is needed because the current endpoint only returns tasks where the authenticated user is the assignee (role=assignee) or creator (role=creator). The popover needs to show tasks assigned to a different user.

When `assigneeId` is provided, the `role` parameter is ignored.

### Data Flow

When the popover opens and `selected` contact is set:
1. Fetch tasks via `api.tasks.list(workspaceId, "assignee", "open", selected.userId)` (new optional param).
2. Display up to 5 tasks.
3. If more than 5, show a "View all" link to `/dashboard/tasks`.

### Visual Design

- Section header: "Open Tasks" (`text-xs font-semibold text-gray-500 uppercase tracking-wide`)
- Each task row: title (truncated, `text-sm`) + due date pill on the right (same color coding as the tasks page: gray default, amber within 24h, red overdue)
- If no open tasks for this contact, omit the section entirely (don't show "No tasks")
- Section appears at the top of the popover, above the existing channel intelligence

## Feature 3: Quick-Assign `/task` from Composer

### Behavior

When the user types `/task Some task title` in the chat composer and hits send, instead of sending a message, an inline task creation form appears above the composer.

### Trigger

In `handleSend`, before the normal message send path, check if `draft.trim().startsWith("/task ")`. If so:
1. Extract the text after `/task ` as the pre-filled title.
2. Set state to show the inline task form.
3. Clear the draft.

Also match bare `/task` (no text after it) — the title field will just be empty.

### Inline Task Form

A small card that slides up above the composer, styled to match the iOS aesthetic.

**Layout:**
- Container: `bg-white rounded-2xl shadow-lg border border-gray-100 p-4 mx-4 mb-2`
- Title input: text field, pre-filled from the `/task` text, editable. Required.
- Assignee: read-only display showing the current contact's name (auto-set to `selected.userId`).
- Due date: date input, required. Min value is today.
- Buttons row: "Cancel" (gray text, left) and "Create" (green pill, right). Create is disabled until title and due date are filled.

**On Create:**
1. Call `api.tasks.create({ workspaceId, assigneeId: selected.userId, title, description: null, dueDate })`.
2. Dismiss the form.
3. Show a brief green banner above the composer: "Task assigned to {name}" that auto-dismisses after 3 seconds.

**On Cancel:**
1. Dismiss the form.
2. Restore `/task {title}` back into the draft so the user doesn't lose their text.

### Mobile vs Desktop

Same form on both. On mobile it renders above the composer pill, within the safe-area layout. On desktop it renders above the desktop composer.

## Files Touched

| File | Change |
|---|---|
| `apps/api/src/routes/tasks.ts` | Add optional `assigneeId` query param to GET endpoint |
| `apps/web/src/lib/api-client.ts` | Update `api.tasks.list` signature to accept optional `assigneeId` |
| `apps/web/src/app/dashboard/components/Header.tsx` | Add `taskCount` prop, render badge on Tasks tab |
| `apps/web/src/app/dashboard/layout.tsx` | Fetch open task count across workspaces, pass to Header |
| `apps/web/src/app/dashboard/chat/page.tsx` | Add tasks section to IntelligencePopover, add `/task` parsing in handleSend, add inline task form component |

## Testing Strategy

- **Badge:** Navigate to dashboard with open tasks assigned to you — badge shows count. Complete all tasks — badge disappears. Navigate between pages — count stays accurate.
- **Popover tasks:** Open a conversation with someone who has open tasks — ⓘ popover shows them. Open conversation with someone who has no tasks — no "Tasks" section shown.
- **Quick-assign:** Type `/task Fix the bug` in composer, hit send — inline form appears with "Fix the bug" pre-filled. Fill due date, create — task appears in Tasks page, notification sent to assignee. Cancel — draft restored.
- **Type-check:** `cd apps/web && npx tsc --noEmit` and `cd apps/api && npx tsc --noEmit` clean.

## Open Questions

None.
