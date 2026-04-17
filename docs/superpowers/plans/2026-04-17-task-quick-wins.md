# Task Quick Wins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three features that make tasks feel native to chat: header badge, tasks in intelligence popover, and `/task` quick-assign from the composer.

**Architecture:** All three features build on the existing `GET /api/tasks` endpoint with one small API change (adding an `assigneeId` filter). The header badge is driven from the dashboard layout, the popover tasks are fetched when a conversation opens, and the `/task` command intercepts the existing `handleSend` flow.

**Tech Stack:** Next.js 15, React 19, Hono API, Drizzle ORM, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-04-17-task-quick-wins-design.md`

---

### Task 1: API — Add `assigneeId` filter to GET /api/tasks

**Files:**
- Modify: `apps/api/src/routes/tasks.ts` (GET handler, ~lines 133-192)
- Modify: `apps/web/src/lib/api-client.ts` (line 143, `api.tasks.list`)

**Context:** The intelligence popover needs to show tasks assigned to a specific contact. Currently `GET /api/tasks` only returns tasks where the authenticated user is the assignee or creator. We need an optional `assigneeId` param that overrides the `role` filter.

- [ ] **Step 1: Update the API GET handler to accept optional `assigneeId`**

In `apps/api/src/routes/tasks.ts`, modify the GET handler. After the existing `role` and `status` parsing (line 137-138), read the new param. When `assigneeId` is provided, use it as the filter instead of the `role`-based filter.

Replace the block from `const roleFilter` through the `conditions` array construction (lines 158-165) with:

```typescript
  const assigneeIdParam = c.req.query("assigneeId");

  let roleFilter;
  if (assigneeIdParam) {
    // When assigneeId is provided, show tasks assigned to that user
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
```

- [ ] **Step 2: Update the api-client to accept optional `assigneeId`**

In `apps/web/src/lib/api-client.ts`, update the `tasks.list` method signature and URL construction.

Replace line 143-144:
```typescript
    list: (workspaceId: string, role: string, status: string) =>
      request<{ tasks: Record<string, unknown>[] }>(`/api/tasks?workspaceId=${encodeURIComponent(workspaceId)}&role=${encodeURIComponent(role)}&status=${encodeURIComponent(status)}`),
```

With:
```typescript
    list: (workspaceId: string, role: string, status: string, assigneeId?: string) =>
      request<Record<string, unknown>[]>(`/api/tasks?workspaceId=${encodeURIComponent(workspaceId)}&role=${encodeURIComponent(role)}&status=${encodeURIComponent(status)}${assigneeId ? `&assigneeId=${encodeURIComponent(assigneeId)}` : ""}`),
```

Note: the return type is changed to `Record<string, unknown>[]` (bare array) to match what the API actually returns — the server returns a bare array, not `{ tasks: [...] }`.

- [ ] **Step 3: Type-check both apps**

Run:
```bash
cd apps/api && npx tsc --noEmit
cd apps/web && npx tsc --noEmit
```

Expected: both pass clean.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/tasks.ts apps/web/src/lib/api-client.ts
git commit -m "feat(tasks): add assigneeId filter to GET /api/tasks"
```

---

### Task 2: Header — Task badge showing open task count

**Files:**
- Modify: `apps/web/src/app/dashboard/components/Header.tsx`
- Modify: `apps/web/src/app/dashboard/layout.tsx`

**Context:** The Header component renders tabs as `<Link>` elements in a flex row. We need to add a green pill badge next to the "Tasks" label. The dashboard layout needs to fetch the count and pass it down.

- [ ] **Step 1: Add `taskCount` prop to Header and render badge**

In `apps/web/src/app/dashboard/components/Header.tsx`:

Update the Props type (line 5):
```typescript
type Props = { userName: string; onLogout: () => void; taskCount?: number };
```

Update the destructured props (line 7):
```typescript
export function Header({ userName, onLogout, taskCount }: Props) {
```

Replace the tab rendering (lines 52-62) to add the badge on the Tasks tab:

```typescript
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-sm font-medium text-center transition-colors ${
                isActive
                  ? "bg-green-primary text-white"
                  : "text-gray-500 hover:bg-gray-100"
              }`}
            >
              <span className="relative inline-flex items-center gap-1">
                {tab.label}
                {tab.label === "Tasks" && taskCount != null && taskCount > 0 && (
                  <span className="inline-flex items-center justify-center bg-green-primary text-white text-[10px] font-bold min-w-[18px] h-[18px] rounded-full px-1 leading-none">
                    {taskCount > 99 ? "99+" : taskCount}
                  </span>
                )}
              </span>
            </Link>
```

Note: When the Tasks tab is active (`bg-green-primary text-white`), the badge also needs to be distinguishable. Add a white border:

```typescript
                {tab.label === "Tasks" && taskCount != null && taskCount > 0 && (
                  <span className={`inline-flex items-center justify-center text-[10px] font-bold min-w-[18px] h-[18px] rounded-full px-1 leading-none ${
                    isActive
                      ? "bg-white text-green-primary"
                      : "bg-green-primary text-white"
                  }`}>
                    {taskCount > 99 ? "99+" : taskCount}
                  </span>
                )}
```

- [ ] **Step 2: Fetch open task count in dashboard layout and pass to Header**

In `apps/web/src/app/dashboard/layout.tsx`:

Add imports at the top:
```typescript
import { useWorkspaces } from "../../hooks/useWorkspaces";
import { api } from "../../lib/api-client";
```

Add state and fetch logic inside `DashboardLayout`, after the existing `useAuth` and `useState` calls (after line 11):

```typescript
  const { workspaces } = useWorkspaces();
  const [taskCount, setTaskCount] = useState(0);

  useEffect(() => {
    if (!user || workspaces.length === 0) return;
    let cancelled = false;
    (async () => {
      let total = 0;
      for (const ws of workspaces) {
        try {
          const tasks = await api.tasks.list(ws.id, "assignee", "open") as unknown[];
          total += Array.isArray(tasks) ? tasks.length : 0;
        } catch {}
      }
      if (!cancelled) setTaskCount(total);
    })();
    return () => { cancelled = true; };
  }, [user, workspaces]);
```

Update the Header usage (line 35):
```typescript
        <Header userName={user.name ?? "User"} onLogout={logout} taskCount={taskCount} />
```

- [ ] **Step 3: Type-check**

Run:
```bash
cd apps/web && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/components/Header.tsx apps/web/src/app/dashboard/layout.tsx
git commit -m "feat(tasks): add open task count badge to header Tasks tab"
```

---

### Task 3: Intelligence popover — Show contact's open tasks

**Files:**
- Modify: `apps/web/src/app/dashboard/chat/page.tsx` (IntelligencePopover component ~lines 89-163, and handleSelectContact ~lines 459-476)

**Context:** The `IntelligencePopover` component shows channel intelligence for the selected contact. We need to add a "Tasks" section at the top showing that contact's open tasks. Task data is fetched when the contact is selected (alongside intelligence data).

- [ ] **Step 1: Add task state and fetch logic**

In `apps/web/src/app/dashboard/chat/page.tsx`:

Add a Task type near the top of the file (after the `WeatherInfo` type around line 35):

```typescript
type PopoverTask = {
  id: string;
  title: string;
  dueDate: string;
  status: string;
};
```

Add state for contact tasks, alongside the existing `intelligence` state (after line 191):

```typescript
  const [contactTasks, setContactTasks] = useState<PopoverTask[]>([]);
```

In `handleSelectContact` (around line 459), after the intelligence fetch (lines 473-475), add a task fetch:

```typescript
    // Load open tasks assigned to this contact
    api.tasks.list(contact.workspaceId, "assignee", "open", contact.id)
      .then((data) => setContactTasks(Array.isArray(data) ? (data as PopoverTask[]).slice(0, 5) : []))
      .catch(() => setContactTasks([]));
```

Also clear `contactTasks` when selecting a contact — add `setContactTasks([])` right after `setShowIntelligence(false)` (line 466):

```typescript
    setShowIntelligence(false);
    setContactTasks([]);
```

- [ ] **Step 2: Add tasks section to IntelligencePopover**

Update the `IntelligencePopoverProps` type (line 81-87) to include tasks:

```typescript
type IntelligencePopoverProps = {
  selected: Contact;
  intelligence: ChannelIntelligence;
  onClose: () => void;
  channelsNode: React.ReactNode;
  paused: boolean;
  tasks: PopoverTask[];
};
```

Update the destructured props (line 89):
```typescript
function IntelligencePopover({ selected, intelligence, onClose, channelsNode, paused, tasks }: IntelligencePopoverProps) {
```

Add the tasks section inside the popover, right after the `"Reaches via"` block (after line 110, before the `<p className="text-xs text-gray-400 mb-3">` line):

```typescript
        {/* Open tasks assigned to this contact */}
        {tasks.length > 0 && (
          <div className="mb-3 pb-3 border-b border-gray-100">
            <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-2">Open Tasks</p>
            <div className="space-y-1.5">
              {tasks.map((t) => {
                const due = new Date(t.dueDate + "T00:00:00Z");
                const now = new Date();
                const diffMs = due.getTime() - now.getTime();
                const isOverdue = diffMs < 0;
                const isDueSoon = !isOverdue && diffMs < 86400000;
                const duePillClass = isOverdue
                  ? "bg-red-50 text-red-600"
                  : isDueSoon
                    ? "bg-amber-50 text-amber-700"
                    : "bg-gray-100 text-gray-600";
                return (
                  <div key={t.id} className="flex items-center justify-between gap-2">
                    <span className="text-sm text-gray-700 truncate flex-1">{t.title}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap ${duePillClass}`}>
                      {due.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  </div>
                );
              })}
            </div>
            {tasks.length >= 5 && (
              <a href="/dashboard/tasks" className="text-[10px] text-green-primary font-medium mt-1.5 block">
                View all →
              </a>
            )}
          </div>
        )}
```

- [ ] **Step 3: Pass `contactTasks` to all IntelligencePopover render sites**

Search for `<IntelligencePopover` in the file. There should be one or two render sites (desktop and/or mobile). Add the `tasks` prop to each:

```typescript
<IntelligencePopover
  selected={selected}
  intelligence={intelligence}
  onClose={() => setShowIntelligence(false)}
  channelsNode={<ChannelTags channels={getChannels(selected)} />}
  paused={!selected.notificationsEnabled}
  tasks={contactTasks}
/>
```

- [ ] **Step 4: Type-check**

Run:
```bash
cd apps/web && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/chat/page.tsx
git commit -m "feat(chat): show contact's open tasks in intelligence popover"
```

---

### Task 4: Quick-assign `/task` command from chat composer

**Files:**
- Modify: `apps/web/src/app/dashboard/chat/page.tsx` (state declarations ~line 179-205, handleSend ~line 439-450, and composer JSX ~lines 888-938)

**Context:** When the user types `/task Some title` in the chat composer and hits send, instead of sending a message, show an inline task creation form above the composer. The form has a pre-filled title, the assignee locked to the current contact, and a due date picker. On create, call the existing `api.tasks.create()`.

- [ ] **Step 1: Add state for the inline task form**

In `apps/web/src/app/dashboard/chat/page.tsx`, add new state declarations after the existing state (after `mobileView` state around line 204):

```typescript
  // /task quick-assign state
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskCreating, setTaskCreating] = useState(false);
  const [taskBanner, setTaskBanner] = useState<string | null>(null);
```

- [ ] **Step 2: Add `/task` interception in handleSend**

Modify `handleSend` (lines 439-450). Add the `/task` check at the beginning, right after the early return on line 441:

```typescript
  const handleSend = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!draft.trim() || !selected || sending) return;

    // /task command — open inline task form instead of sending
    if (draft.trim().startsWith("/task")) {
      const titleFromDraft = draft.trim().slice(5).trim();
      setTaskTitle(titleFromDraft);
      setTaskDueDate("");
      setShowTaskForm(true);
      setDraft("");
      return;
    }

    const w = weatherByUser[selected.id];
    const gating = gatingFor(w?.code ?? null);
    if (gating === "block" && !stormConfirmed.has(selected.id)) {
      setShowStormConfirm(true);
      return;
    }
    await sendMessage();
  };
```

- [ ] **Step 3: Add task creation handler and cancel handler**

Add these functions after `handleSend` (around line 450):

```typescript
  const handleTaskCreate = async () => {
    if (!taskTitle.trim() || !taskDueDate || !selected || taskCreating) return;
    setTaskCreating(true);
    try {
      await api.tasks.create({
        workspaceId: selected.workspaceId,
        assigneeId: selected.id,
        title: taskTitle.trim(),
        description: null,
        dueDate: taskDueDate,
      });
      setShowTaskForm(false);
      setTaskTitle("");
      setTaskDueDate("");
      setTaskBanner(`Task assigned to ${selected.name ?? "contact"}`);
      setTimeout(() => setTaskBanner(null), 3000);
    } catch (err) {
      console.error("[chat] task create failed", err);
    } finally {
      setTaskCreating(false);
    }
  };

  const handleTaskCancel = () => {
    setDraft(`/task ${taskTitle}`);
    setShowTaskForm(false);
    setTaskTitle("");
    setTaskDueDate("");
  };
```

- [ ] **Step 4: Add the inline task form JSX**

Add the task form and success banner right before the desktop composer form (before `{/* Input — desktop */}` comment, around line 888). This positions it above both composer variants:

```typescript
      {/* Task quick-assign banner */}
      {taskBanner && (
        <div className="mx-4 md:mx-6 mb-2 px-3 py-2 rounded-xl bg-green-primary/10 text-green-primary text-xs font-medium text-center">
          {taskBanner}
        </div>
      )}

      {/* /task inline form */}
      {showTaskForm && selected && (
        <div className="mx-3 md:mx-6 mb-2 bg-white rounded-2xl shadow-lg border border-gray-100 p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-gray-800">Quick Task</h4>
            <span className="text-xs text-gray-400">for {selected.name ?? "contact"}</span>
          </div>
          <input
            type="text"
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
            placeholder="Task title"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-primary/30 mb-2"
            autoFocus
          />
          <input
            type="date"
            value={taskDueDate}
            onChange={(e) => setTaskDueDate(e.target.value)}
            min={new Date().toISOString().split("T")[0]}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-primary/30 mb-3 text-gray-700"
          />
          <div className="flex items-center justify-between">
            <button
              onClick={handleTaskCancel}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleTaskCreate}
              disabled={!taskTitle.trim() || !taskDueDate || taskCreating}
              className="px-4 py-2 rounded-full bg-green-primary text-white text-sm font-medium disabled:opacity-50 transition-colors"
            >
              {taskCreating ? "Creating..." : "Create"}
            </button>
          </div>
        </div>
      )}
```

- [ ] **Step 5: Hide the task form when leaving the conversation**

In `handleSelectContact` (around line 459), add cleanup when switching contacts. After `setShowIntelligence(false)`:

```typescript
    setShowTaskForm(false);
    setTaskBanner(null);
```

- [ ] **Step 6: Type-check**

Run:
```bash
cd apps/web && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/dashboard/chat/page.tsx
git commit -m "feat(chat): add /task quick-assign command in composer"
```

---

### Task 5: Final verification

**Files:** All modified files from Tasks 1-4.

- [ ] **Step 1: Type-check both apps**

```bash
cd apps/api && npx tsc --noEmit
cd apps/web && npx tsc --noEmit
```

Expected: both pass clean.

- [ ] **Step 2: Verify feature integration**

Manually verify in the browser:

1. **Badge:** Navigate to `/dashboard` — the Tasks tab shows a green pill with the number of open tasks assigned to you. If you have no tasks, no badge shows.
2. **Popover:** Open a conversation, tap ⓘ — if the contact has open tasks, they appear at the top of the popover with due date pills (gray/amber/red).
3. **Quick-assign:** In a conversation, type `/task Test task` and send — the inline form appears with "Test task" pre-filled. Pick a due date, tap Create — success banner shows. Check the Tasks page — the new task appears. Cancel — draft is restored.
4. **Desktop:** All three features work at `md+` breakpoint.
5. **Mobile:** All three features work at mobile viewport.
