# Weather MVP Features Implementation Plan

**Goal:** Add four features to the New Sky weather CRM: demo teammates for chat preview, manual weather override (#4), schedule-for-sunny send (#1), and onboarding tour (#3).

**Architecture:** Two backend additions (override table + scheduled-messages table, each with manual SQL migration), one new flush hook on weather updates, and four frontend feature components. Demo users are pure-frontend mocks intercepted at the chat/weather data layer.

**Tech Stack:** Next.js 15 (App Router), Hono API, Drizzle ORM + PostgreSQL, Tailwind. Migrations are applied manually via Railway Postgres console — DO NOT add auto-migration steps.

---

## Conventions

- All schema additions in `packages/db/src/schema.ts`
- Migrations as new SQL files: `packages/db/src/migrations/0003_*.sql`, `0004_*.sql`
- API routes in `apps/api/src/routes/`
- API client surface in `apps/web/src/lib/api-client.ts`
- Shared types in `apps/web/src/lib/types.ts`
- Demo workspace ID: `demo-workspace`. Demo user IDs: `demo-adam`, `demo-sarah`, `demo-marcus`. All prefixed `demo-` for runtime detection.
- Tests: this codebase has no Jest/Vitest setup. For each task, "verify" means running `npx tsc --noEmit` from `apps/web/` (and `apps/api/` where applicable) plus a manual smoke check.

---

## Task 1: Manual Weather Override (Feature #4)

**Files:**
- Modify: `packages/db/src/schema.ts` — add `weatherOverrides` table
- Create: `packages/db/src/migrations/0003_weather_overrides.sql`
- Modify: `apps/api/src/routes/weather.ts` — consult overrides in `GET /`, `GET /week`, `GET /team`; add `PUT /override` and `DELETE /override`
- Modify: `apps/web/src/lib/api-client.ts` — add `weather.setOverride`, `weather.clearOverride`
- Modify: `apps/web/src/app/dashboard/page.tsx` — replace inline +/- editor with preset picker; preset rows come from a single `OVERRIDE_PRESETS` constant

### Schema (add to `schema.ts`)

```ts
export const weatherOverrides = pgTable("weather_overrides", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  date: date("date").notNull(),
  code: varchar("code", { length: 32 }).notNull(),    // sunny | partly_cloudy | cloudy | rainy | thunderstorm | ooo
  label: varchar("label", { length: 64 }).notNull(),  // human label for the preset
  emoji: varchar("emoji", { length: 16 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("weather_override_user_date_unique").on(table.userId, table.date),
]);
```

### Migration `0003_weather_overrides.sql`

```sql
CREATE TABLE IF NOT EXISTS "weather_overrides" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "date" date NOT NULL,
  "code" varchar(32) NOT NULL,
  "label" varchar(64) NOT NULL,
  "emoji" varchar(16) NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "weather_override_user_date_unique"
  ON "weather_overrides" ("user_id", "date");
```

### API behavior

In `weather.ts`, define `OVERRIDE_PRESETS` keyed by code:
```ts
const OVERRIDE_PRESETS: Record<string, { code: string; label: string; emoji: string }> = {
  sunny:         { code: "sunny",         label: "Open",        emoji: "☀️" },
  cloudy:        { code: "cloudy",        label: "Heads-down",  emoji: "☁️" },
  thunderstorm:  { code: "thunderstorm",  label: "Slammed",     emoji: "⛈️" },
  ooo:           { code: "ooo",           label: "OOO",         emoji: "🏖️" },
};
```

For `OOO` add a special case in `weatherFromCount`-equivalent override resolver: if override code is `ooo`, return `{ code: "ooo", emoji: "🏖️", label: "Out of office" }` and treat `count` as `null`/`0` for display.

**Resolver helper:**
```ts
async function resolveWeather(userId: string, date: string, count: number) {
  const [override] = await db.select().from(weatherOverrides)
    .where(and(eq(weatherOverrides.userId, userId), eq(weatherOverrides.date, date)));
  if (override) {
    return { weather: { code: override.code, emoji: override.emoji, label: override.label }, override: true };
  }
  return { weather: weatherFromCount(count), override: false };
}
```

Use this resolver inside `GET /`, `GET /week`, and the team endpoint's per-day map. Add `override: boolean` to each weather payload object so the UI can indicate manually-set state.

**New endpoints:**
- `PUT /api/weather/override` — body `{ code: "sunny" | "cloudy" | "thunderstorm" | "ooo" }`. Validate code is in `OVERRIDE_PRESETS`. Upsert the row for `(user, today)`. Return the resolved weather object.
- `DELETE /api/weather/override` — deletes today's override row for the user. Return `{ ok: true }`.

After upsert/delete, the endpoint should also call the scheduled-messages flush helper for this user (`flushScheduledForRecipient`, defined in Task 2) — wrap in try/catch so override always succeeds even if flush fails.

### API client

```ts
weather: {
  // ... existing
  setOverride: (code: string) =>
    request<{ weather: { code: string; emoji: string; label: string }; override: true }>(
      "/api/weather/override",
      { method: "PUT", body: JSON.stringify({ code }) }
    ),
  clearOverride: () => request<{ ok: true }>("/api/weather/override", { method: "DELETE" }),
},
```

Update `weather.get`, `weather.week`, `weather.team` return types to include `override?: boolean` on each weather object.

### UI — replace inline editor in `dashboard/page.tsx`

When `editing && isMe`, show a picker (not the +/- counter):

```
[ ☀️ Open ]   [ ☁️ Heads-down ]
[ ⛈️ Slammed ] [ 🏖️ OOO ]

[ Reset to calendar ]   [ Cancel ]
```

Selecting a preset calls `api.weather.setOverride(code)` and closes the editor. "Reset" calls `api.weather.clearOverride()` then refetches `weather.get()` and `weather.week()`. Show a small "Set manually" badge on the row when `data.override === true`.

The +/- counter is removed entirely (per design choice A).

### Steps

- [ ] Add `weatherOverrides` to `schema.ts`
- [ ] Write `0003_weather_overrides.sql`
- [ ] Add `OVERRIDE_PRESETS`, `resolveWeather`, and `override: boolean` to all three GET responses in `weather.ts`
- [ ] Add `PUT /override` and `DELETE /override` handlers
- [ ] Update API client with `setOverride` / `clearOverride` and add `override?` to existing return types
- [ ] Replace inline +/- editor in `dashboard/page.tsx` with preset grid + Reset button
- [ ] Show "Set manually" indicator when `data.override`
- [ ] Run `npx tsc --noEmit` in `apps/web` and `apps/api`
- [ ] Commit: `feat(weather): manual override presets (Open / Heads-down / Slammed / OOO)`

---

## Task 2: Schedule-for-Sunny Send (Feature #1)

**Files:**
- Modify: `packages/db/src/schema.ts` — add `scheduledMessages` table
- Create: `packages/db/src/migrations/0004_scheduled_messages.sql`
- Create: `apps/api/src/services/scheduled-messages.ts` — `flushScheduledForRecipient(userId)` helper, called from weather mutation paths
- Modify: `apps/api/src/routes/messages.ts` — add `POST /schedule`, `GET /scheduled`, `DELETE /scheduled/:id`
- Modify: `apps/api/src/routes/weather.ts` — call `flushScheduledForRecipient(user.id)` after `PUT /count`, `PUT /override`, `DELETE /override`, and after Google Calendar auto-sync changes the count
- Modify: `apps/api/src/routes/google.ts` — call `flushScheduledForRecipient` after sync writes a new count
- Modify: `apps/web/src/lib/api-client.ts` — add `messages.schedule`, `messages.listScheduled`, `messages.cancelScheduled`
- Modify: `apps/web/src/lib/types.ts` — add `ScheduledMessage` type
- Modify: `apps/web/src/app/dashboard/chat/page.tsx` — third button on storm modal; "Scheduled (n)" chip in sidebar header; inline ghost row in conversation; cancel/send-now controls

### Schema

```ts
export const scheduledMessageStatusEnum = pgEnum("scheduled_message_status", ["pending", "sent", "canceled"]);

export const scheduledMessages = pgTable("scheduled_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").references(() => workspaces.id).notNull(),
  senderId: uuid("sender_id").references(() => users.id).notNull(),
  recipientId: uuid("recipient_id").references(() => users.id).notNull(),
  body: text("body").notNull(),
  condition: varchar("condition", { length: 32 }).notNull(), // "recipient_sunny"
  status: scheduledMessageStatusEnum("status").default("pending").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  sentAt: timestamp("sent_at"),
});
```

### Migration `0004_scheduled_messages.sql`

```sql
DO $$ BEGIN
  CREATE TYPE "scheduled_message_status" AS ENUM ('pending','sent','canceled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "scheduled_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id"),
  "sender_id" uuid NOT NULL REFERENCES "users"("id"),
  "recipient_id" uuid NOT NULL REFERENCES "users"("id"),
  "body" text NOT NULL,
  "condition" varchar(32) NOT NULL,
  "status" scheduled_message_status NOT NULL DEFAULT 'pending',
  "created_at" timestamp DEFAULT now() NOT NULL,
  "sent_at" timestamp
);
CREATE INDEX IF NOT EXISTS "scheduled_messages_recipient_status_idx"
  ON "scheduled_messages" ("recipient_id", "status");
```

### Flush logic (`scheduled-messages.ts`)

```ts
// Definition of "sunny enough" to release a queued send
export const SUNNY_CODES = new Set(["sunny", "partly_cloudy"]);

export async function flushScheduledForRecipient(recipientId: string): Promise<number> {
  // 1. Compute recipient's *current* effective weather (override-aware) for today
  // 2. If code in SUNNY_CODES: select all pending scheduled_messages where recipient_id = X
  // 3. For each: call existing message-send pipeline (reuse the same code path POST /messages/send uses).
  //    Mark scheduled_messages row sent + sent_at = now()
  // 4. Return count of dispatched messages
}
```

The reusable send pipeline must be extracted from the existing `POST /messages/send` handler into a function `dispatchMessage({ workspaceId, senderId, recipientId, body })` that both the route and the flush helper can call. If extraction is too risky, the flush helper can call a small inline duplicate of the conversation-creation + message insert + delivery-trigger code, but extraction is preferred.

### Endpoints

- `POST /api/messages/schedule` — body `{ workspaceId, recipientId, body, condition: "recipient_sunny" }`. Insert pending row, return the new `ScheduledMessage`.
- `GET /api/messages/scheduled` — return all pending scheduled messages where `senderId = currentUser`.
- `DELETE /api/messages/scheduled/:id` — verify sender ownership, set status `canceled`, return `{ ok: true }`.

### Storm-modal UI changes (in `chat/page.tsx`)

Existing modal has "Wait" and "Send anyway." Add a third button between them:

```
[ Wait ]  [ Send when ☀️ ]  [ Send anyway ]
```

"Send when ☀️" calls `api.messages.schedule({ workspaceId, recipientId, body: draft.trim(), condition: "recipient_sunny" })`, clears the draft, closes the modal, refreshes scheduled list.

### "Scheduled (n)" chip

In sidebar header (next to "Broadcast" and "+ New"), if `scheduledCount > 0`:
```
[ Scheduled (3) ] [ Broadcast ] [ + New ]
```
Click opens a panel (analogous to broadcast panel) listing scheduled sends grouped by recipient with "Cancel" and "Send now" per row.

### Inline ghost row

When viewing a conversation, fetch scheduled messages for `(workspace, recipient)` and render them at the bottom of the messages list with reduced opacity and a label "Queued — will send when ☀️" plus a Cancel button. They appear above the input.

### Demo users

Detect `recipientId.startsWith("demo-")` in the schedule UI flow. If true:
- Don't call API; instead push a local-state "scheduled" entry into the demo store (Task 3)
- The demo flush is triggered when the user changes that demo teammate's weather (which Task 3 also handles via a "rotate weather" debug control on the demo teammate row in Settings or via a hidden hotkey — keep simple, use the Settings toggle expansion)

### Steps

- [ ] Add `scheduledMessageStatusEnum` and `scheduledMessages` to `schema.ts`
- [ ] Write `0004_scheduled_messages.sql`
- [ ] Extract send pipeline from `POST /messages/send` into `dispatchMessage(...)` helper
- [ ] Create `services/scheduled-messages.ts` with `flushScheduledForRecipient`
- [ ] Add three new endpoints to `messages.ts` route
- [ ] Wire `flushScheduledForRecipient` calls into `weather.ts` (after count change + override change + auto-sync) and `google.ts` (after manual sync)
- [ ] Add `ScheduledMessage` type and three API client methods
- [ ] Update storm modal with third button
- [ ] Add scheduled chip + scheduled panel
- [ ] Add inline ghost rows in conversation view
- [ ] Demo user branch: schedule writes to local demo store
- [ ] Run `npx tsc --noEmit` in `apps/web` and `apps/api`
- [ ] Commit: `feat(chat): schedule-for-sunny — queue messages until recipient clears storm`

---

## Task 3: Demo Teammates

**Files:**
- Create: `apps/web/src/lib/demo-data.ts` — fake teammates, fake weather, fake conversations, in-memory message store, scheduled-message store
- Create: `apps/web/src/hooks/useDemoMode.ts` — sessionStorage-backed enabled flag, also reads `?demo=1`
- Modify: `apps/web/src/app/dashboard/page.tsx` — merge demo teammates into the team list when demo mode active; also include rotate-weather affordance for each demo teammate
- Modify: `apps/web/src/app/dashboard/chat/page.tsx` — short-circuit `loadConversation`, `sendMessage`, `scheduleMessage`, and `weatherByUser` lookups for `demo-` IDs; auto-reply 2s after demo send
- Modify: `apps/web/src/app/dashboard/settings/page.tsx` — add a "Demo teammates" toggle card (above WorkspaceList)

### `demo-data.ts` shape

```ts
export const DEMO_WORKSPACE_ID = "demo-workspace";
export const DEMO_WORKSPACE_NAME = "Demo Team";

export type DemoTeammate = {
  id: string;          // "demo-adam" | "demo-sarah" | "demo-marcus"
  name: string;
  email: string;
  weatherCode: "sunny" | "rainy" | "thunderstorm";
  count: number;
  emoji: string;
  label: string;
  preferredChannel: "email";
  notificationChannels: string[];
  notificationsEnabled: boolean;
  cannedReply: string;
};

export const DEMO_TEAMMATES: DemoTeammate[] = [
  { id: "demo-adam",   name: "Adam Roozen",  email: "adam@demo.local",   weatherCode: "sunny",        count: 1, emoji: "☀️", label: "Sunny",        preferredChannel: "email", notificationChannels: ["email"], notificationsEnabled: true, cannedReply: "Hey! What's up?" },
  { id: "demo-sarah",  name: "Sarah Chen",   email: "sarah@demo.local",  weatherCode: "rainy",        count: 6, emoji: "🌧️", label: "Rainy",        preferredChannel: "email", notificationChannels: ["email","slack"], notificationsEnabled: true, cannedReply: "Heads down today — can it wait?" },
  { id: "demo-marcus", name: "Marcus Pike",  email: "marcus@demo.local", weatherCode: "thunderstorm", count: 9, emoji: "⛈️", label: "Storm",        preferredChannel: "email", notificationChannels: ["email"], notificationsEnabled: true, cannedReply: "Slammed today, will reply tomorrow." },
];

// In-memory store keyed by demo teammate id. Lost on reload.
export const demoStore = {
  conversations: new Map<string, ChatMessage[]>(),
  scheduled: new Map<string, ScheduledMessage[]>(),
};
```

Provide helpers: `getDemoConversation(id)`, `appendDemoMessage(id, msg)`, `setDemoTeammateWeather(id, code)`.

A small registry-style mutable map for current weather (so the rotate-weather control in dashboard can change `count`/`emoji`/`code` at runtime).

### `useDemoMode` hook

```ts
export function useDemoMode() {
  const [enabled, setEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    if (sessionStorage.getItem("demoMode") === "1") return true;
    if (sessionStorage.getItem("demoMode") === "0") return false;
    return new URLSearchParams(window.location.search).get("demo") === "1";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    sessionStorage.setItem("demoMode", enabled ? "1" : "0");
  }, [enabled]);

  return { enabled, setEnabled };
}
```

### Chat-page integration

In `loadContacts`, if demo mode is on, append synthetic Contacts (built from `DEMO_TEAMMATES` + `DEMO_WORKSPACE_ID/NAME`).

Helpers:
```ts
const isDemoId = (id: string) => id.startsWith("demo-");
```

Patch each path:
- `loadConversation`: if `contact.id` is demo, return `getDemoConversation(contact.id)` as messages
- `sendMessage`: if demo, append a message with `senderId = currentUser.id, deliveryStatus: "delivered"` to the demo store, then 2s later append the canned reply with `senderId = contact.id`
- Storm-modal "Send when ☀️": if demo, push to demo `scheduled` store and refresh; do not call API
- `weatherByUser` map: include demo IDs from the registry
- "Scheduled" chip count: include demo scheduled count

### Weather page integration

When demo mode is on, after fetching real `team`, append synthetic teammates. For each demo teammate, add a small `[ ☀️ 🌧️ ⛈️ ]` row underneath the name in daily mode — clicking changes that teammate's weather in the registry, then re-renders. Make this control compact and labeled "(demo)" so it's obvious.

### Settings card

```
┌─ Demo teammates ──────────────────────────┐
│ Show 3 fake teammates with sample chats   │
│ to preview the experience.                │
│ [ Toggle: On / Off ]                       │
└────────────────────────────────────────────┘
```

Wire to `useDemoMode().setEnabled`.

### Steps

- [ ] Create `lib/demo-data.ts` (constants + in-memory stores + mutators)
- [ ] Create `hooks/useDemoMode.ts`
- [ ] Add a settings card with on/off toggle for demo mode
- [ ] In Weather page: merge demo teammates into team list when enabled; add weather-rotate controls per demo row
- [ ] In Chat page: merge demo contacts; intercept conversation/send/schedule/weather lookups; canned auto-reply after 2s
- [ ] Verify no `demo-` ID ever flows into a real API call
- [ ] Run `npx tsc --noEmit` in `apps/web`
- [ ] Commit: `feat(demo): preview chat + weather UI with 3 fake teammates`

---

## Task 4: Onboarding Tour (Feature #3)

**Files:**
- Create: `apps/web/src/app/dashboard/components/OnboardingTour.tsx` — full-screen modal sequence
- Modify: `apps/web/src/app/dashboard/layout.tsx` (or whichever wraps the dashboard pages) — render the tour when not yet completed
- (No backend changes — use `localStorage.getItem("nsTourCompleted")` to gate it. The existing `users.onboarded` flag is reserved for the legacy setup wizard.)

### Component

```tsx
const STEPS = [
  {
    title: "Your day, as weather",
    body: "Each teammate's day shows as weather based on how busy they are. Sunny means open, storm means slammed.",
    visual: <WeatherLegend />, // small inline list: ☀️ Sunny · ⛅ Partly cloudy · ☁️ Cloudy · 🌧️ Rainy · ⛈️ Storm
    cta: "Next",
  },
  {
    title: "Connect your calendar",
    body: "We auto-update your forecast from your meetings — or set it manually any time.",
    visual: <span className="text-5xl">📅</span>,
    cta: "Connect Google Calendar",
    secondary: "Skip — I'll set it manually",
  },
  {
    title: "Storm-aware messaging",
    body: "When a teammate is rainy or stormed, you'll see a banner before sending. You can also queue messages to send when they're sunny again.",
    visual: <StormBannerPreview />, // a static rendering of the amber storm banner from chat
    cta: "Got it — let's go",
  },
];
```

Layout:
- Fixed full-screen overlay with semi-transparent backdrop
- Centered card, ~360px wide, rounded-3xl, white
- Step header: small dot pagination at top (•○○ → ○•○ → ○○•)
- Visual area in the middle
- Title + body
- Primary CTA at bottom; secondary link (gray) below it
- "Skip tour" link in top-right corner of card on every step

Behavior:
- On primary CTA on step 1 → go to step 2
- On step 2 primary "Connect Google Calendar" → set `localStorage.nsTourCompleted = "1"`, navigate to `/dashboard/settings#google` (anchor support optional — just `/dashboard/settings`)
- On step 2 secondary "Skip" → go to step 3
- On step 3 primary → set `localStorage.nsTourCompleted = "1"`, close modal
- "Skip tour" anywhere → set `localStorage.nsTourCompleted = "1"`, close modal

### Layout integration

In whichever component wraps dashboard pages (likely `apps/web/src/app/dashboard/layout.tsx`):

```tsx
const [showTour, setShowTour] = useState(false);
useEffect(() => {
  if (typeof window === "undefined") return;
  if (localStorage.getItem("nsTourCompleted") !== "1") setShowTour(true);
}, []);
```

Render `<OnboardingTour open={showTour} onClose={() => setShowTour(false)} />` after the children.

If there is no `dashboard/layout.tsx` already, create one that renders existing children and the tour. Verify the existing dashboard layout structure first — do not overwrite an existing layout.

### Steps

- [ ] Inspect the existing `apps/web/src/app/dashboard/layout.tsx` (if any) and decide where to mount the tour
- [ ] Create `OnboardingTour.tsx` with the 3 steps, dot pagination, skip link
- [ ] Mount it in the dashboard layout, gated by `localStorage.nsTourCompleted`
- [ ] Verify the modal blocks pointer events on the underlying app while open
- [ ] Manual smoke: clear localStorage key, reload, see tour appear
- [ ] Run `npx tsc --noEmit` in `apps/web`
- [ ] Commit: `feat(onboarding): 3-step tour explaining the weather metaphor`

---

## Final commit + deploy

After all four tasks pass type-check and have been committed individually:
- `git push origin main`
- Apply migrations on Railway Postgres console manually:
  - `0003_weather_overrides.sql`
  - `0004_scheduled_messages.sql`
- Verify deploy by visiting `/dashboard?demo=1` → demo teammates appear → can chat with each → storm modal shows three buttons → onboarding shows on fresh browser → manual override picker works on own row.
