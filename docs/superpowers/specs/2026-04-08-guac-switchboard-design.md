# Guac — Communication Switchboard

**Date:** 2026-04-08
**Status:** Draft
**Scope:** Auth, preferences, workspaces, dashboard, message routing, disambiguation (v1)

## Vision

A communication switchboard branded as Guac. One phone number (Telnyx), one email address (Resend). Messages come in, get routed to the right person via their preferred channel (SMS or email), respecting their working hours and notification preferences. Users manage everything from a single dashboard with quick toggles. Workspaces provide multi-tenant grouping. When ambiguity exists, the system asks the sender to clarify with a simple numbered reply.

## Out of Scope (v1)

- Billing / payments
- File attachments in routed messages
- Real-time WebSocket dashboard updates (polling instead)
- Rich text / HTML in routed messages
- Mobile native app (web-only)
- Workspace-specific Guac numbers/emails (single global entry point)
- Role hierarchy beyond admin/member

---

## 1. Auth & Onboarding

### Magic Link Flow

1. Admin adds a new member by entering their email or phone number
2. System sends a magic link via Resend (email) or Telnyx (SMS)
3. Link is valid for 5 days, single-use (invalidated after first click)
4. Clicking the link lands on an onboarding screen where the user:
   - Sets their display name
   - Chooses preferred communication channel (SMS or email — must provide the other contact method if they signed up with only one)
   - Selects notification timing preferences (2 weeks, 1 week, 3 days, 2 days, day-of — multi-select, all on by default)
   - Sets working hours (start time, end time, timezone, days of week)
5. User is now active in all workspaces they were added to

### Login

No passwords. Every login is a magic link. User requests a link from the login page by entering their email or phone, gets a fresh 5-day link. Session cookies handle the rest (30-day expiry, `HttpOnly`, `Secure`, `SameSite=Strict`).

### Token Structure

Magic links contain a signed, single-use token stored in the database. On click, token is validated, marked as used, and a session is created.

---

## 2. User Preferences

### Communication Channel

- SMS or email — one active at a time
- User must have both a phone number and email on file (collected during onboarding) so the system can always reach them via either channel, but messages route through the preferred one

### Notification Timing

- Applies to task deadlines set within workspaces
- Multi-select from: 2 weeks before, 1 week, 3 days, 2 days, day-of
- All enabled by default
- These are reminders, separate from routed messages — the system sends them proactively based on task due dates

### Working Hours

- Start time, end time, timezone, active days (e.g., Mon-Fri)
- Messages arriving outside working hours are queued and delivered when hours resume
- Sender gets an acknowledgment: "[Name] is outside working hours. They'll receive this at [next available time]."
- Notification reminders also respect working hours — if a "3 days before" reminder falls at 2am, it delivers at the start of the next working window

### Master Toggle

- One switch on the dashboard: notifications on/off
- Off = nothing delivered, everything queued
- When toggled back on, queued messages deliver immediately
- Reminder notifications that have passed their window are skipped (no point getting a "2 weeks before" reminder when the deadline is tomorrow)

---

## 3. Workspaces

### Structure

- A workspace is a named group of members (e.g., "w3 Consulting", "Isotropic")
- Each workspace has one or more admins and one or more members
- The person who creates a workspace is automatically its first admin

### Admin Capabilities (v1)

- Add members (by email or phone number — triggers magic link if they don't have an account yet)
- Remove members
- View member list with their online/working-hours status

### Multi-Workspace

- Users belong to all workspaces they've been added to simultaneously
- No "active workspace" concept — all workspaces are always active
- Dashboard shows all workspaces with their members

### Workspace Creation

- Any authenticated user can create a new workspace
- Just a name is required — no billing, no limits for v1

---

## 4. Dashboard

### Layout

A single-page dashboard after login. Cream background (#FFFDF7), green accents throughout. Top to bottom:

- **Header** — Guac avocado logo, user's name, logout
- **Quick toggles panel** — Master notifications on/off, preferred channel (SMS/email toggle), working hours on/off. All flippable in one tap, changes take effect immediately.
- **Workspaces list** — Cards for each workspace the user belongs to. Each card shows workspace name, member count, and admin badge if applicable. Tap a card to expand and see members. Admins see "Add member" and "Remove" controls inline.
- **Notification preferences** — Checkboxes for timing preferences (2 weeks, 1 week, 3 days, 2 days, day-of). Working hours editor (start/end time, timezone, active days).
- **Recent activity** — Simple feed showing recent routed messages (last 20). Who sent it, when, which workspace, delivery status (delivered, queued, pending).

No separate pages for v1. Everything lives on one dashboard. Workspace admin actions (add/remove member) happen inline via modals or expandable sections, not separate routes.

---

## 5. Message Routing Engine

### Inbound Flow

1. Someone sends a text to the Guac Telnyx number or an email to the Guac Resend address
2. Telnyx/Resend fires a webhook to `POST /api/webhooks/telnyx` or `POST /api/webhooks/resend`
3. System identifies the sender by phone number or email address
4. **If sender is not in the system** — reply with "This number/address isn't registered with Guac" and discard
5. **If sender shares exactly one workspace with exactly one other member** — route directly, no disambiguation needed
6. **If ambiguity exists** (multiple shared workspaces, or multiple members) — enter disambiguation flow

### Routing Resolution

- Look up all workspaces the sender belongs to
- Look up all other members across those workspaces
- If one workspace + one recipient = direct route
- Otherwise, ask sender to clarify

### Delivery

- Resolve recipient's preferred channel
- Check recipient's working hours
- **Inside working hours** — deliver immediately via Telnyx (SMS) or Resend (email). Message includes: sender name, workspace name, message body, and a reply prompt
- **Outside working hours** — queue the message, acknowledge to sender with expected delivery time: "[Name] is outside working hours. They'll receive this at [next available time]."

### Reply Routing

- Every outbound message includes a conversation thread ID (embedded in the reply-to email header, or tracked by Telnyx phone number mapping)
- When recipient replies, the system matches it to the active thread and routes back to the original sender via their channel
- Thread stays active for 24 hours of inactivity, then expires. New messages start a new thread.

### Conversation Tracking

- Each thread is a row in a `conversations` table linking sender, recipient, workspace, and channel state
- Individual messages stored in a `messages` table linked to the conversation
- **Broadcasts** ("All members" in disambiguation): one conversation per recipient, one message row per recipient for independent delivery tracking. The original message body is shared but each delivery is tracked separately (different channels, different working hours).

---

## 6. Workspace Disambiguation

### When It Triggers

- Sender belongs to multiple workspaces, and the message could be for someone in more than one of them
- Or, the sender doesn't specify a recipient and the workspace has multiple members

### Flow

1. Sender texts/emails the Guac number: "Can we push the deadline to next week?"
2. System detects ambiguity — sender is in 3 workspaces
3. System replies (via sender's inbound channel) with a numbered list:
   ```
   Which workspace is this for?
   1. w3 Consulting
   2. Isotropic
   3. Side Project
   Reply with the number.
   ```
4. Sender replies "2"
5. If that workspace has only one other member — deliver immediately
6. If that workspace has multiple members, follow up:
   ```
   Who in Isotropic?
   1. Sarah
   2. Mike
   3. All members
   Reply with the number.
   ```
7. Sender replies "1" — message routes to Sarah

### Timeout

If the sender doesn't reply within 15 minutes, the system sends a reminder. After 1 hour with no response, the message is dropped and the sender is notified: "Message expired. Send again when ready."

### Shortcut

If the sender has only had conversations with one person recently (within 24 hours), skip disambiguation and route to that person. The sender can always force disambiguation by starting a message with "?" (e.g., "? Can we push the deadline").

---

## 7. Data Model

### Tables

**users**
- `id` (uuid, PK), `name`, `email` (unique, nullable), `phone` (unique, nullable), `preferred_channel` (enum: sms/email), `notification_timings` (jsonb — array of selected intervals), `working_hours_enabled` (boolean), `working_hours_start` (time), `working_hours_end` (time), `working_hours_timezone` (varchar), `working_hours_days` (jsonb — array of day numbers), `notifications_enabled` (boolean), `onboarded` (boolean, default false), `created_at`, `updated_at`

**workspaces**
- `id` (uuid, PK), `name` (varchar), `created_by` (FK users), `created_at`

**workspace_members**
- `id` (uuid, PK), `workspace_id` (FK workspaces), `user_id` (FK users), `role` (enum: admin/member), `added_at`
- Unique constraint on (`workspace_id`, `user_id`)

**magic_links**
- `id` (uuid, PK), `token` (varchar, unique, indexed), `user_id` (FK users, nullable — null for new user invites), `email` (nullable), `phone` (nullable), `workspace_id` (FK workspaces, nullable — which workspace triggered the invite), `used` (boolean, default false), `expires_at` (timestamp), `created_at`

**conversations**
- `id` (uuid, PK), `workspace_id` (FK workspaces), `sender_id` (FK users), `recipient_id` (FK users, nullable — null for "all members" broadcasts), `status` (enum: active/expired), `last_activity_at` (timestamp), `created_at`

**messages**
- `id` (uuid, PK), `conversation_id` (FK conversations), `sender_id` (FK users), `body` (text), `direction` (enum: inbound/outbound), `channel` (enum: sms/email), `delivery_status` (enum: delivered/queued/pending/failed), `deliver_at` (timestamp, nullable — set when queued for working hours), `delivered_at` (timestamp, nullable), `created_at`

**tasks**
- `id` (uuid, PK), `workspace_id` (FK workspaces), `title` (varchar), `due_date` (date), `created_by` (FK users), `created_at`

**task_notifications**
- `id` (uuid, PK), `task_id` (FK tasks), `user_id` (FK users), `timing` (varchar — e.g., "2_weeks", "1_week", "3_days", "2_days", "day_of"), `scheduled_for` (timestamp), `sent` (boolean, default false), `created_at`

**disambiguation_sessions**
- `id` (uuid, PK), `sender_id` (FK users), `original_message` (text), `step` (enum: workspace/recipient), `options` (jsonb — numbered list sent to user), `resolved_workspace_id` (FK workspaces, nullable), `resolved_recipient_id` (FK users, nullable), `status` (enum: pending/resolved/expired), `expires_at` (timestamp), `created_at`

---

## 8. API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/auth/magic-link` | POST | Request a magic link (email or phone) |
| `/api/auth/verify` | GET | Verify magic link token, create session |
| `/api/auth/logout` | POST | Destroy session |
| `/api/auth/session` | GET | Current user |
| `/api/onboarding` | POST | Set name, preferred channel, notification prefs, working hours |
| `/api/preferences` | GET | Get current preferences |
| `/api/preferences` | PATCH | Update any preference (channel, timings, working hours, master toggle) |
| `/api/workspaces` | GET | List user's workspaces |
| `/api/workspaces` | POST | Create workspace |
| `/api/workspaces/:id/members` | GET | List members |
| `/api/workspaces/:id/members` | POST | Add member (admin only, triggers magic link for new users) |
| `/api/workspaces/:id/members/:userId` | DELETE | Remove member (admin only) |
| `/api/messages/recent` | GET | Recent activity feed |
| `/api/webhooks/telnyx` | POST | Inbound SMS from Telnyx |
| `/api/webhooks/resend` | POST | Inbound email from Resend |
| `/api/deliver/sms` | POST | Send SMS via Telnyx (internal) |
| `/api/deliver/email` | POST | Send email via Resend (internal) |
| `/api/cron/deliver-queued` | POST | Deliver queued messages when working hours resume |
| `/api/cron/send-reminders` | POST | Send task deadline reminders |
| `/api/cron/expire-conversations` | POST | Expire inactive threads (24h) |
| `/api/cron/expire-disambiguation` | POST | Expire unresolved disambiguation sessions (1h) |

---

## 9. Project Structure

```
guac/
  apps/
    web/                              — Next.js frontend
      src/app/
        page.tsx                      — redirect to /dashboard
        login/page.tsx                — magic link request
        onboarding/page.tsx           — first-time setup
        dashboard/
          page.tsx                    — main dashboard
          components/
            Header.tsx
            QuickToggles.tsx
            WorkspaceList.tsx
            WorkspaceCard.tsx
            AddMemberModal.tsx
            NotificationPrefs.tsx
            WorkingHoursEditor.tsx
            RecentActivity.tsx
      hooks/
        useAuth.ts
        usePreferences.ts
        useWorkspaces.ts
        useActivity.ts
      lib/
        api-client.ts
        types.ts
    api/                              — Hono API
      src/
        index.ts
        routes/
          auth.ts
          onboarding.ts
          preferences.ts
          workspaces.ts
          messages.ts
          webhooks/
            telnyx.ts
            resend.ts
        services/
          routing.ts                  — core routing engine
          disambiguation.ts           — multi-workspace resolution
          delivery.ts                 — send via Telnyx or Resend
          queue.ts                    — working hours queue logic
          reminders.ts                — task deadline notifications
        cron/
          deliver-queued.ts
          send-reminders.ts
          expire-conversations.ts
          expire-disambiguation.ts
        middleware/
          auth.ts                     — session validation
          webhook-verify.ts           — Telnyx/Resend signature verification
  packages/
    db/                               — Drizzle schema + migrations
      src/
        schema.ts
        migrations/
  turbo.json
  package.json
  tsconfig.base.json
```

---

## 10. Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, React, Tailwind CSS v4 |
| Backend API | Hono |
| Database | PostgreSQL |
| ORM | Drizzle |
| SMS | Telnyx |
| Email | Resend |
| Monorepo | Turborepo |
| Auth | Magic links, session cookies |
| Deployment | TBD |

---

## 11. Branding

- **Background:** Cream/off-white (#FFFDF7)
- **Primary accent:** Forest green (#4A7C59)
- **Secondary accent:** Leaf green (#6B9F5B)
- **Logo:** Avocado icon
- **Typography:** Clean sans-serif (Inter or similar)
- **Feel:** Warm, approachable, minimal
