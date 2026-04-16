# Mobile Chat iMessage Redesign — Design Spec

**Date:** 2026-04-16
**Project:** New Sky / Guac
**Scope:** `apps/web/src/app/dashboard/chat/page.tsx` — mobile breakpoint only

## Goal

Re-skin the mobile chat experience to match Apple Messages (iMessage) conventions. Replace the current full-width "Send one message to your entire workspace" pill with a proper pill FAB for the Broadcast feature. Desktop is explicitly untouched.

## Non-Goals

- **Desktop layout changes.** The existing `hidden md:flex` branch is not touched.
- **No new backend or API work.** All data fetching, polling, and side effects remain identical.
- **No new interaction patterns.** Specifically excluded from this pass:
  - Swipe-to-reply
  - Long-press message actions / reactions
  - Haptic feedback
  - Typing indicators
  - Read receipts (distinct from the existing "Delivered" indicator)
- **No file split / refactor.** `chat/page.tsx` stays as a single file despite its size. Mobile edits are localized with comment markers.

## Architecture

The existing mobile navigation model already matches iMessage's mental model and is preserved as-is:

- **Contact list** (home) → tap a contact → **full-screen conversation overlay**
- **Back chevron** returns to list
- **Broadcast FAB** opens full-screen broadcast composer overlay
- **Scheduled chip** opens full-screen scheduled panel overlay

All state still lives in `ChatPageInner`. View switching continues to use the existing `mobileView`, `showNewChat`, `showBroadcast`, `showScheduledPanel` state. No new state machine.

## Design Decisions (locked in during brainstorming)

| Question | Decision |
|---|---|
| Which breakpoint changes? | **Mobile only.** Desktop unchanged. |
| Broadcast button style? | **Pill FAB** with "Broadcast" text label + icon, bottom-right. |
| Keep channel tags / delivery status / weather emoji? | **Keep identity stuff; collapse delivery status to the last outbound message only.** Channel tags move into the intelligence popover. |
| When does the FAB show? | **Contact list + scheduled panel only.** Hidden inside a conversation, new-chat picker, broadcast composer itself, and the storm modal. |
| Chat header style? | **Full iMessage header:** back chevron + label (left), centered tiny-avatar-over-name (with weather emoji), ⓘ info button (right). Channel tags + "Paused" badge move into the intelligence popover. |

## Component-Level Design

### 1. Contact List Screen

**Header:**
- Large iOS-style title: **"Messages"** (`text-2xl md:text-3xl font-bold`). Replaces the current `text-base font-bold` title.
- Right side, inline: scheduled chip (`bg-amber-50 text-amber-700 rounded-full`, small) shown only when `scheduled.length > 0`, tap opens scheduled panel. Followed by the existing circular **+** button for new chat.
- Container: `px-4 pt-4 pb-3` (slightly taller than today to fit the bigger title), `border-b border-gray-100`.

**Search bar:**
- iOS-pill input (`bg-gray-100 rounded-full`), leading magnifying-glass icon inside the pill, placeholder "Search".
- Kept in its current position directly below the header.

**Contact rows:**
- Leading: avatar circle (~44px, unchanged).
- Title row: name (15px semibold) + weather emoji right-adjacent to name + right-aligned muted timestamp of the latest message (format: relative "2m", "1h", "Tue", "4/12").
- Subtitle row: last-message preview, single line, truncated. Muted gray when read; near-black when unread.
- Leading unread indicator: 8px filled green dot to the left of the avatar, shown only when unread.
- Divider: `border-t border-gray-100` inset to start after the avatar (standard iOS inset divider).
- Full-row tap target.

**Bottom:**
- Broadcast FAB floats `fixed bottom-4 right-4` with `env(safe-area-inset-bottom)` padding.
- The current wide "Send one message to your entire workspace" pill is removed entirely.

### 2. Conversation Screen

**Header (centered iMessage style):**
- Left: `‹ Messages` text-button (chevron + plain text), 44pt min hit area. Returns to contact list.
- Center: stacked vertically
  - Tiny avatar circle (~32px), centered
  - Below: `{name} {weatherEmoji}` (13px semibold, emoji inline)
  - Both avatar + name region are a single tap target → opens intelligence popover
- Right: circular ⓘ info button (36px tap target) → also opens intelligence popover
- Channel tags (Email/SMS/Discord) and "Paused" badge are **not** rendered in the header.

**Intelligence popover (updated content):**
- Adds a new "Reaches via" row at the top listing the recipient's channel tags (the same pills that used to be in the header).
- Adds a "Paused" indicator if `!selected.notificationsEnabled`.
- Existing content — average response time per channel, totals, fastest badge — unchanged.

**Messages area:**
- Background: `bg-[#F2F2F7]` (iOS messages background gray, applied via Tailwind arbitrary value — no theme extension required).
- Bubbles:
  - Mine: `bg-green-primary text-white`, `rounded-3xl` (22px equivalent). Grouped-bubble corner flattening preserved — last in group keeps the pointed corner (`rounded-br-md`).
  - Theirs: `bg-white text-gray-900 shadow-sm rounded-3xl`. Last in group → `rounded-bl-md`.
  - `max-w-[75%]` on mobile. Desktop retains its own width.
  - Padding: `px-3.5 py-2` (unchanged).
  - Font: `text-[15px] leading-relaxed` (unchanged).
- **Delivery status:** rendered only under the single most-recent outbound message. Right-aligned, 10px, muted. States: "Delivered", "Sending…", "Queued", "Failed". Tap "Failed" to retry (behavior unchanged).
- Time separators: centered muted labels, shown only when gap since previous message > 5 minutes (unchanged threshold, re-styled to `text-[11px] text-gray-400`).
- Scheduled ghost rows: kept as-is — semi-transparent green bubble + "Queued — sends when ☀️ · Cancel".

**Composer (iMessage pill):**
- Rounded pill container (`rounded-full border border-gray-200 bg-white`), full-width minus 16px horizontal inset, pinned above safe-area using `env(safe-area-inset-bottom)`.
- Inside:
  - Textarea that auto-grows up to ~5 lines (max-height; scroll beyond).
  - Placeholder: `Message {name}`.
- Trailing: circular send button (36px).
  - Enabled state: `bg-green-primary text-white`, up-arrow icon.
  - Disabled state: `bg-gray-200 text-gray-400`, same icon, `cursor-not-allowed`.
- No leading "+" / camera / attachment affordance. The product has no attachment concept (YAGNI).
- Submit on Enter (Shift+Enter for newline) — behavior unchanged.
- When mobile keyboard opens, composer stays pinned above it (existing `100dvh` layout handles this).

**Storm modal:** behavior unchanged. Visually re-skinned to `rounded-3xl`, iOS-modal-style padding. Still has the "Send when ☀️" option for ⛈️ recipients.

### 3. Broadcast FAB

- Shape: pill (auto-width, ~48px tall), horizontal padding for the label.
- Icon: existing megaphone SVG, 18px, inline before the label.
- Label: **"Broadcast"** (14px, medium weight).
- Color: `bg-green-primary text-white shadow-lg shadow-green-primary/30`.
- Position: `fixed bottom-4 right-4` with `paddingBottom: env(safe-area-inset-bottom)` added to the container (or inline style on the button).
- Tap → sets `showBroadcast = true` and `mobileView = "chat"` (opens broadcast composer as a full-screen overlay, same as today).

**Visibility logic** (mobile only, single conditional):
- Shown when: on the contact-list view **or** viewing the scheduled panel.
- Hidden when: inside a conversation (`selected !== null && mobileView === "chat"` and none of the other overlays are open), new-chat picker is open, broadcast composer is open, storm modal is open.

### 4. Broadcast Composer View (re-skin only)

- Full-screen overlay (existing behavior).
- Header row:
  - Left: **"Cancel"** (plain text button, `text-gray-500`). Tap → closes composer, resets draft.
  - Center: **"Broadcast"** title (17px semibold).
  - Right: **"Send"** (bold green text, disabled when draft is empty or no workspace selected). Replaces the current SVG send button inside a form row.
- Body:
  - Workspace picker styled as an iOS grouped-list cell (`bg-white rounded-2xl shadow-sm`, rows with trailing chevron). If only one workspace, auto-selected and shown as a read-only cell.
  - Large textarea: placeholder `Type your broadcast message…`. Grows with content.
  - Bottom hint row (unchanged content): `Delivering to {N} member(s) via their preferred channels`.
- Post-send confirmation: same green-tinted card, re-skinned `rounded-2xl`, unchanged copy.

### 5. Scheduled Panel (re-skin only)

- Header row follows the same iOS modal header pattern used by the broadcast composer: **"Back"** (left) + **"Scheduled"** title (center) + no right action.
- List rows styled as iOS grouped-list cells. Row content (recipient name + weather + queued body + Cancel / Send now actions) is unchanged.

## Visibility Matrix (Mobile)

| View | Top header | Contact list visible | Conversation visible | Broadcast FAB | Composer pill |
|---|---|---|---|---|---|
| Contact list | Large "Messages" title | ✅ | — | ✅ | — |
| Inside conversation | iMessage header | — | ✅ | — | ✅ |
| New chat picker | Picker header | — | picker | — | — |
| Broadcast composer | iOS modal ("Cancel"/"Send") | — | — | — | — |
| Scheduled panel | iOS modal ("Back") | — | — | ✅ | — |
| Storm modal | (overlaid on conversation) | — | ✅ (dimmed) | — | ✅ (dimmed) |

## Data Flow

Unchanged. All hooks, API calls, polling intervals, demo-mode guards, and side effects are preserved exactly as they are today. This pass is purely presentational.

## Files Touched

| File | Change |
|---|---|
| `apps/web/src/app/dashboard/chat/page.tsx` | Mobile branches re-structured in-place. Desktop branches untouched. Comment markers (`/* Mobile: ... */`) added for navigability. |

No new files. No CSS/theme changes required beyond Tailwind utilities already available.

## Testing Strategy

- **Manual:** walk the full mobile flow in Chrome DevTools device emulation (iPhone 15 Pro viewport) and on a real iPhone if available.
  1. Contact list → large title, FAB visible, scheduled chip appears when scheduled > 0.
  2. Tap a contact → conversation opens with centered header. Weather emoji next to name. ⓘ button right. FAB hidden. Composer pill at bottom, survives keyboard open.
  3. Send a message → only the latest sent bubble shows delivery status.
  4. Send to a ⛈️ teammate → storm modal looks iOS-y, "Send when ☀️" still works.
  5. Back to list → FAB reappears. Tap FAB → broadcast composer (Cancel/Send header). Send → confirmation. Cancel → list.
  6. Tap scheduled chip → scheduled panel. FAB still visible. Cancel one → unchanged behavior.
  7. Demo mode (`?demo=1`): all three demo teammates render correctly, rotate weather still works, queued-for-sunny on ⛈️ recipient flushes when weather flips.
- **Regression:** desktop layout at `md+` breakpoint unchanged. Existing intelligence popover still opens, content is the same plus the new "Reaches via" section.
- **Type-check:** `cd apps/api && npx tsc --noEmit` clean. `cd apps/web && npx tsc --noEmit` clean.

## Open Questions

None — all decisions locked during brainstorming.
