# Mobile Chat iMessage Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin the mobile chat UI to match iMessage conventions and replace the existing wide Broadcast pill with a pill FAB. Desktop layout is unchanged.

**Architecture:** All changes are localized to the mobile branches of `apps/web/src/app/dashboard/chat/page.tsx`. The existing `hidden md:flex` (desktop) and `md:hidden` (mobile) branches already split the code — we only modify the mobile branches. No new files, no new state machines, no backend changes. The plan ships as a sequence of independent visual commits; each produces a working build.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind CSS. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-04-16-mobile-chat-imessage-design.md`

**Testing strategy for this plan:** This is a pure visual re-skin of an existing UI — there is no automated UI test harness in the repo for this page, and adding one just for these changes is out of scope (YAGNI). Each task verifies via (a) TypeScript compilation and (b) a manual visual smoke check. Behavior is preserved by leaving all hooks, handlers, and data shapes untouched.

**Commit style:** Conventional commits with `chat(mobile)` scope. Example: `chat(mobile): replace wide broadcast pill with floating pill FAB`.

---

## File Map

Only one file is modified:

- **`apps/web/src/app/dashboard/chat/page.tsx`** — the entire chat UI. The file has two distinct top-level render branches (desktop `hidden md:flex` and mobile `md:hidden` / `md:hidden fixed`); we edit only the mobile branches and the shared `chatArea` JSX (with mobile-specific conditionals inside). Desktop branches are preserved verbatim.

No new files are created. No other files in the repo are modified.

---

## Task Order & Rationale

Each task is a self-contained visual commit. Tasks can technically be done in any order, but the order below minimizes merge conflicts within the file and makes each commit visually coherent:

1. **Task 1** — Broadcast FAB (most self-contained: remove old, add new).
2. **Task 2** — Mobile contact list header & rows.
3. **Task 3** — Mobile conversation header + intelligence popover update.
4. **Task 4** — Mobile conversation bubbles, delivery status, background, and composer.
5. **Task 5** — Broadcast composer & scheduled panel iOS-modal re-skin.
6. **Task 6** — Final typecheck + manual smoke test checklist.

---

### Task 1: Replace wide Broadcast pill with pill FAB

**Files:**
- Modify: `apps/web/src/app/dashboard/chat/page.tsx`

**Context for implementer:** The current mobile contact list (`md:hidden` block starting around line 1104) ends with a wide `absolute bottom-4 left-4 right-4` button labeled "Send one message to your entire workspace". We replace it with a compact pill FAB fixed to the bottom-right, labeled "Broadcast", and we conditionally render it based on current view state. The FAB must be visible on the contact list AND the scheduled panel view, but hidden everywhere else.

- [ ] **Step 1: Locate the wide broadcast pill in the mobile contact list branch**

Open `apps/web/src/app/dashboard/chat/page.tsx` and find the block that starts with the comment `{/* Floating broadcast button */}`. It should be immediately below `<div className="flex-1 overflow-y-auto pb-16">{contactList}</div>` in the `md:hidden` container. The current JSX looks like:

```tsx
{/* Floating broadcast button */}
<button
  onClick={() => { setShowBroadcast(true); setMobileView("chat"); }}
  className="absolute bottom-4 left-4 right-4 py-3 bg-green-primary/10 text-green-primary rounded-2xl text-sm font-medium flex items-center justify-center gap-2 hover:bg-green-primary/15 active:bg-green-primary/20 transition-colors border border-green-primary/20 backdrop-blur-sm shadow-sm"
>
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 1 1 0-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 0 1-1.44-4.282m3.102.069a18.03 18.03 0 0 1-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 0 1 8.835 2.535M10.34 6.66a23.847 23.847 0 0 0 8.835-2.535m0 0A23.74 23.74 0 0 0 18.795 3m.38 1.125a23.91 23.91 0 0 1 1.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 0 0 1.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 0 1 0 3.46" />
  </svg>
  Send one message to your entire workspace
</button>
```

Keep the exact `<svg>…</svg>` megaphone markup — we'll reuse it verbatim in the FAB. Delete this entire `<button>…</button>` block (including the `{/* Floating broadcast button */}` comment). Also change the parent `<div className="flex-1 overflow-y-auto pb-16">{contactList}</div>` to `<div className="flex-1 overflow-y-auto">{contactList}</div>` — no more `pb-16` since we no longer have a wide pill to reserve space for.

- [ ] **Step 2: Add the pill FAB as a sibling of both mobile branches**

The FAB needs to render on the contact list view AND the scheduled panel view (per spec visibility matrix). Both views are mobile-only. The simplest place is inside the existing mobile overlay container — or as a new `md:hidden` fragment.

Find the very end of the component's top-level `return (…)` block. It currently ends:

```tsx
      {/* Mobile: full-screen overlay for conversation / new chat / broadcast / scheduled */}
      {mobileShowOverlay && (
        <div className="md:hidden fixed inset-0 z-50 bg-white flex flex-col" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
          {showScheduledPanel ? scheduledPanel : showBroadcast ? broadcastPanel : showNewChat ? newChatPicker : chatArea ?? emptyState}
        </div>
      )}
    </>
  );
```

Immediately before the closing `</>`, insert the FAB:

```tsx
      {/* Mobile: Broadcast FAB. Shown on contact list OR scheduled panel only. */}
      {(() => {
        const onContactList = !mobileShowOverlay;
        const onScheduledPanel = showScheduledPanel;
        const fabVisible = onContactList || onScheduledPanel;
        if (!fabVisible) return null;
        return (
          <button
            onClick={() => { setShowBroadcast(true); setMobileView("chat"); }}
            className="md:hidden fixed right-4 z-[60] flex items-center gap-2 px-4 h-12 rounded-full bg-green-primary text-white text-sm font-medium shadow-lg shadow-green-primary/30 active:scale-95 transition-transform"
            style={{ bottom: `calc(1rem + env(safe-area-inset-bottom))` }}
          >
            <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 1 1 0-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 0 1-1.44-4.282m3.102.069a18.03 18.03 0 0 1-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 0 1 8.835 2.535M10.34 6.66a23.847 23.847 0 0 0 8.835-2.535m0 0A23.74 23.74 0 0 0 18.795 3m.38 1.125a23.91 23.91 0 0 1 1.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 0 0 1.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 0 1 0 3.46" />
            </svg>
            Broadcast
          </button>
        );
      })()}
```

Why this works:
- `!mobileShowOverlay` means we're on the contact list (no overlay open). The FAB shows.
- `showScheduledPanel` is also true when the scheduled overlay is open. The FAB shows.
- If the user is in a conversation (`mobileView === "chat"`), new-chat picker, or broadcast composer: `!mobileShowOverlay` is false AND `showScheduledPanel` is false → FAB hidden.
- `z-[60]` sits above the `z-50` mobile overlay so that on the scheduled panel it remains tappable.
- `md:hidden` ensures desktop never sees this FAB.

- [ ] **Step 3: Type-check**

Run: `cd /Users/ryanhaugland/guac/apps/web && npx tsc --noEmit`

Expected: exits with no output, exit code 0.

- [ ] **Step 4: Manual smoke check**

Start the dev server and open the app in a mobile viewport (Chrome DevTools → iPhone 15 Pro):
- On the contact list: green "Broadcast" pill visible bottom-right. Tap it → broadcast composer opens.
- Tap a contact → conversation opens. FAB should NOT be visible.
- Back to list, tap "Scheduled (n)" (if any scheduled exist; if not, skip) → scheduled panel opens. FAB still visible.
- Tap FAB → broadcast composer opens over scheduled panel. FAB hidden while broadcast composer open.

If no scheduled messages exist, the scheduled-panel visibility test can be skipped; the code path is trivial (same condition as the existing `showScheduledPanel` state).

- [ ] **Step 5: Commit**

```bash
cd /Users/ryanhaugland/guac
git add apps/web/src/app/dashboard/chat/page.tsx
git commit -m "chat(mobile): replace wide broadcast pill with floating pill FAB"
```

---

### Task 2: Mobile contact list header + row polish

**Files:**
- Modify: `apps/web/src/app/dashboard/chat/page.tsx`

**Context for implementer:** The mobile contact-list header currently has a small `text-base font-bold` "Messages" label with the scheduled button and a `+` icon. We upgrade to an iOS large-title header. The contact rows themselves are rendered by the `contactList` variable — we polish row styling there (unread dot, inset dividers, relative timestamp). Do NOT touch the desktop header.

- [ ] **Step 1: Update the mobile top header**

Find the mobile top header in the `md:hidden` contact-list container (current opening: `<h2 className="text-base font-bold text-gray-900">Messages</h2>`). Replace the whole header `<div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">…</div>` block with:

```tsx
<div className="px-4 pt-4 pb-3 border-b border-gray-100 flex items-end justify-between">
  <h2 className="text-[28px] leading-none font-bold text-gray-900">Messages</h2>
  <div className="flex items-center gap-2">
    {scheduled.length > 0 && (
      <button
        onClick={() => { setShowScheduledPanel(true); setMobileView("chat"); }}
        className="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
      >
        ⏳ {scheduled.length} scheduled
      </button>
    )}
    <button
      onClick={() => { setShowNewChat(true); setMobileView("chat"); }}
      className="w-8 h-8 bg-green-primary text-white rounded-full flex items-center justify-center active:scale-95 transition-transform"
      aria-label="New chat"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
      </svg>
    </button>
  </div>
</div>
```

Preserves behavior: the scheduled chip opens the scheduled panel, the `+` opens new chat. Only the visual is changed — bigger title, chip has an hourglass glyph and pill shape.

- [ ] **Step 2: Update mobile contact rows**

Locate the `contactList` variable declaration inside `ChatPageInner`. It maps `filteredContacts` into row JSX. Two changes:

**2a. Inset divider:** the row's outer container currently uses `border-b border-gray-100` on the whole row. Move the border so it's inset to start after the avatar. Replace the row-wrapper class like `border-b border-gray-100` with `relative`, and wrap the row's inner content area (the part to the right of the avatar) with `border-b border-gray-100` so the divider starts after the avatar.

**2b. Unread dot + relative timestamp:**

If the `contactList` rendering currently uses a single row structure like:

```tsx
<button key={c.id} onClick={() => handleSelectContact(c)} className="w-full border-b border-gray-100 hover:bg-gray-50 transition-colors">
  <div className="px-4 py-3 flex items-center gap-3">
    <div className="w-11 h-11 rounded-full …">…avatar…</div>
    <div className="flex-1 min-w-0 text-left">
      <div className="flex items-center justify-between">
        <p className="text-[15px] font-semibold text-gray-900 truncate">{c.name}</p>
        …
      </div>
      …
    </div>
  </div>
</button>
```

Restructure it to:

```tsx
<button key={c.id} onClick={() => handleSelectContact(c)} className="w-full hover:bg-gray-50 active:bg-gray-100 transition-colors">
  <div className="pl-4 pr-4 py-3 flex items-center gap-3">
    {/* Unread dot: takes fixed 12px lane so names align across read/unread rows */}
    <div className="w-3 flex-shrink-0 flex justify-center">
      {isUnread(c) && <span className="w-2 h-2 rounded-full bg-green-primary" />}
    </div>
    <div className="w-11 h-11 rounded-full … flex-shrink-0">…avatar…</div>
    <div className="flex-1 min-w-0 text-left border-b border-gray-100 pb-3 -mb-3">
      <div className="flex items-center gap-1.5">
        <p className={`text-[15px] truncate ${isUnread(c) ? "font-semibold text-gray-900" : "font-semibold text-gray-900"}`}>
          {c.name ?? c.email ?? "Unknown"}
        </p>
        {weatherByUser[c.id]?.emoji && (
          <span className="text-sm leading-none">{weatherByUser[c.id]?.emoji}</span>
        )}
        <span className="ml-auto text-xs text-gray-400 flex-shrink-0">{formatRelative(c.lastActivityAt)}</span>
      </div>
      <p className={`mt-0.5 text-sm truncate ${isUnread(c) ? "text-gray-800" : "text-gray-500"}`}>
        {c.lastMessage ?? "—"}
      </p>
    </div>
  </div>
</button>
```

The `isUnread` check should reuse the existing unread-detection logic already in the file. Look for how the current row renders an unread indicator (there is likely an `unreadCounts` lookup) and reuse it — don't introduce a new helper. If the existing logic is `unreadCounts.find(u => u.contactId === c.id)?.count`, define `const isUnread = (c) => (unreadCounts.find(u => u.contactId === c.id)?.count ?? 0) > 0` as a const at the top of the `contactList` memo/definition.

`formatRelative` helper — add this at the bottom of the file (just above the closing `}` of the module) if it doesn't already exist:

```tsx
function formatRelative(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) {
    return date.toLocaleDateString([], { weekday: "short" });
  }
  return date.toLocaleDateString([], { month: "numeric", day: "numeric" });
}
```

If the `contactList` rows don't currently source `lastActivityAt` or `lastMessage` per-contact, leave the timestamp and subtitle blank when missing (`formatRelative(undefined)` returns `""`). The goal of this task is cosmetic — do not refactor data plumbing.

**Important:** if any of the property names here (e.g. `c.lastActivityAt`, `c.lastMessage`) don't match what's actually on the `Contact` type, adapt to whatever fields already exist on the row. Do not add new API calls.

- [ ] **Step 3: Type-check**

Run: `cd /Users/ryanhaugland/guac/apps/web && npx tsc --noEmit`

Expected: exits with no output, exit code 0.

- [ ] **Step 4: Manual smoke check**

In mobile viewport:
- Large "Messages" title at top.
- Scheduled chip is a soft amber pill with "⏳ N scheduled" (only when scheduled > 0).
- `+` button is a small green circle.
- Contact rows: small green dot on left for unread rows, avatar, name, weather emoji, timestamp far-right. Divider line starts after the avatar, not at the left edge.
- Tap a contact → opens conversation (behavior unchanged).

- [ ] **Step 5: Commit**

```bash
cd /Users/ryanhaugland/guac
git add apps/web/src/app/dashboard/chat/page.tsx
git commit -m "chat(mobile): iOS-style contact list header and row polish"
```

---

### Task 3: Centered iMessage conversation header + move channel tags into popover

**Files:**
- Modify: `apps/web/src/app/dashboard/chat/page.tsx`

**Context for implementer:** The conversation header is inside the `chatArea` JSX (the `selected ?` block starting around line 625). It's shared between desktop and mobile — desktop uses `md:` modifiers, mobile uses the base classes. We need to keep the desktop layout working. The cleanest way is to split the header into two siblings with `hidden md:flex` for the desktop version and `md:hidden` for the mobile version. Channel tags, weather emoji, and the "Paused" badge on mobile move into the intelligence popover; desktop keeps them in the header.

- [ ] **Step 1: Split the shared header into desktop-only and mobile-only branches**

Find the `<div className="px-2 md:px-6 py-2.5 md:py-3 border-b border-gray-100 flex items-center gap-1.5 md:gap-3 relative bg-white/95 backdrop-blur-sm">` block at the top of `chatArea`. Currently it contains a back button (mobile-only), avatar button, name/tags/emoji region, and the intelligence popover rendered inline.

Keep the **desktop header** exactly as-is but add `hidden md:flex` to its container and remove mobile-only classes. Add a new **mobile header** as a sibling.

Replace the current header block with:

```tsx
{/* Desktop header (unchanged layout, md+ only) */}
<div className="hidden md:flex px-6 py-3 border-b border-gray-100 items-center gap-3 relative bg-white/95 backdrop-blur-sm">
  <button
    onClick={() => setShowIntelligence(!showIntelligence)}
    className="w-9 h-9 rounded-full bg-green-primary/10 flex items-center justify-center text-green-primary text-sm font-semibold flex-shrink-0 hover:bg-green-primary/20 transition-colors"
  >
    {(selected.name ?? "?")[0].toUpperCase()}
  </button>
  <button onClick={() => setShowIntelligence(!showIntelligence)} className="flex-1 min-w-0 text-left hover:opacity-80 transition-opacity">
    <div className="flex items-center gap-1.5">
      <p className="text-[15px] font-semibold text-gray-900 truncate">{selected.name ?? "Pending"}</p>
      {weatherByUser[selected.id]?.emoji && (
        <span className="text-base leading-none" aria-label={weatherByUser[selected.id]?.label ?? ""}>
          {weatherByUser[selected.id]?.emoji}
        </span>
      )}
    </div>
    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
      <ChannelTags channels={getChannels(selected)} />
      {!selected.notificationsEnabled && (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-red-100 text-red-600">Paused</span>
      )}
    </div>
  </button>
  {/* Intelligence popup (shared — desktop + mobile both open it) */}
  {showIntelligence && intelligence && (
    <IntelligencePopover selected={selected} intelligence={intelligence} onClose={() => setShowIntelligence(false)} channelsNode={<ChannelTags channels={getChannels(selected)} />} paused={!selected.notificationsEnabled} />
  )}
</div>

{/* Mobile header (centered iMessage style) */}
<div className="md:hidden relative px-2 py-2 border-b border-gray-100 bg-white/95 backdrop-blur-sm flex items-center">
  {/* Left: back */}
  <button onClick={handleBack} className="text-green-primary flex items-center gap-0.5 min-w-[64px]" aria-label="Back to messages">
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
    <span className="text-[15px]">Messages</span>
  </button>
  {/* Center: avatar over name */}
  <button
    onClick={() => setShowIntelligence(!showIntelligence)}
    className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center hover:opacity-80 transition-opacity"
  >
    <div className="w-7 h-7 rounded-full bg-green-primary/10 flex items-center justify-center text-green-primary text-xs font-semibold">
      {(selected.name ?? "?")[0].toUpperCase()}
    </div>
    <div className="flex items-center gap-1 mt-0.5 max-w-[180px]">
      <p className="text-[13px] font-semibold text-gray-900 truncate">{selected.name ?? "Pending"}</p>
      {weatherByUser[selected.id]?.emoji && (
        <span className="text-xs leading-none">{weatherByUser[selected.id]?.emoji}</span>
      )}
    </div>
  </button>
  {/* Right: info button */}
  <button
    onClick={() => setShowIntelligence(!showIntelligence)}
    className="ml-auto w-9 h-9 rounded-full flex items-center justify-center text-green-primary hover:bg-green-primary/10 transition-colors"
    aria-label="Contact info"
  >
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8h.01M11 12h1v5h1" />
    </svg>
  </button>
</div>
```

- [ ] **Step 2: Extract the intelligence popover into a small internal component**

The popover JSX is currently inlined in the header. Because both the desktop and mobile headers now open it, extract it into a component inside the same file (above `export default function ChatPage() { … }` in the top-level module, but below the type declarations). This avoids duplicating the popover JSX in two headers.

Define this new component near the top of the file, next to the existing helper components (search for where `ChannelTags` or other small components live):

```tsx
type IntelligencePopoverProps = {
  selected: Contact;
  intelligence: ChannelIntelligence;
  onClose: () => void;
  channelsNode: React.ReactNode;
  paused: boolean;
};

function IntelligencePopover({ selected, intelligence, onClose, channelsNode, paused }: IntelligencePopoverProps) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute top-full left-4 right-4 md:left-16 md:right-auto md:w-80 mt-1 bg-white rounded-xl shadow-lg border border-gray-100 z-50 p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-gray-800">Channel Intelligence</h4>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* NEW: Reaches via + Paused indicator (mobile folds header badges into the popover) */}
        <div className="mb-3 flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] uppercase tracking-wide text-gray-400 mr-1">Reaches via</span>
          {channelsNode}
          {paused && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-red-100 text-red-600">Paused</span>
          )}
        </div>

        <p className="text-xs text-gray-400 mb-3">
          Avg response time for {selected.name} by channel
        </p>

        <div className="space-y-2">
          {intelligence.channels.map((ch, i) => {
            const info = CHANNEL_LABELS[ch.channel];
            const maxMs = intelligence.channels[intelligence.channels.length - 1]?.avgResponseMs ?? 1;
            const pct = Math.max(8, Math.round((ch.avgResponseMs / maxMs) * 100));
            const label = formatMs(ch.avgResponseMs);
            return (
              <div key={ch.channel}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${info?.color ?? "bg-gray-100 text-gray-600"}`}>
                      {info?.label ?? ch.channel}
                    </span>
                    {i === 0 && <span className="text-[10px] text-green-primary font-medium">Fastest</span>}
                  </div>
                  <span className="text-xs text-gray-500 font-medium">~{label}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-all ${i === 0 ? "bg-green-primary" : "bg-gray-300"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
          <div className="text-center flex-1">
            <p className="text-lg font-bold text-gray-800">{intelligence.totalMessages}</p>
            <p className="text-[10px] text-gray-400">Messages</p>
          </div>
          <div className="w-px h-8 bg-gray-100" />
          <div className="text-center flex-1">
            <p className="text-lg font-bold text-gray-800">{intelligence.deliveryRate}%</p>
            <p className="text-[10px] text-gray-400">Delivered</p>
          </div>
          <div className="w-px h-8 bg-gray-100" />
          <div className="text-center flex-1">
            <p className="text-lg font-bold text-green-primary">{intelligence.channels.length}</p>
            <p className="text-[10px] text-gray-400">Channels</p>
          </div>
        </div>
      </div>
    </>
  );
}
```

Note: The `formatMs` function, `CHANNEL_LABELS`, and `ChannelTags` must already exist in this file — reuse them. If any of them are declared *inside* the `ChatPageInner` component rather than at module scope, move them to module scope first so `IntelligencePopover` (which is also at module scope) can use them. Do not duplicate their code.

Delete the old inlined popover JSX from the original desktop header block (we already removed it when replacing the header in Step 1 — verify no duplicate popover exists).

- [ ] **Step 3: Render the popover once, after both header branches**

Because we now have two header branches (desktop + mobile) but the popover should render for whichever opened it, render the popover once at the `chatArea` level, not inside either header. Move the `{showIntelligence && intelligence && <IntelligencePopover … />}` line out of the desktop header and place it immediately after the mobile header `</div>` (still within `chatArea`, still positioned by the nearest `relative` ancestor — the desktop and mobile header containers both have `relative`, but since only one is visible at a time, either one anchors the popover correctly). Actually the simplest fix: wrap **both** headers in a single `relative` container:

```tsx
<div className="relative">
  {/* Desktop header */} …
  {/* Mobile header */} …
  {showIntelligence && intelligence && (
    <IntelligencePopover
      selected={selected}
      intelligence={intelligence}
      onClose={() => setShowIntelligence(false)}
      channelsNode={<ChannelTags channels={getChannels(selected)} />}
      paused={!selected.notificationsEnabled}
    />
  )}
</div>
```

Remove `relative` from each individual header so the outer wrapper is the positioning context. Also remove the inline popover reference from the desktop header JSX introduced in Step 1.

- [ ] **Step 4: Type-check**

Run: `cd /Users/ryanhaugland/guac/apps/web && npx tsc --noEmit`

Expected: exits with no output, exit code 0.

- [ ] **Step 5: Manual smoke check**

- **Mobile viewport**: conversation header is centered with tiny avatar over name + weather emoji. `‹ Messages` text on the left, ⓘ button on the right. Tapping the name, avatar, or ⓘ opens the intelligence popover. Popover now has a "Reaches via" row at the top with the channel tags.
- **Desktop viewport (resize or `md:` breakpoint in DevTools)**: header is unchanged (left-aligned avatar + name + tags). Tap the avatar or name → same popover (also now with the new "Reaches via" row, which is fine — it's extra info, not regression).
- **Paused recipient** (toggle notifications off for a contact in Settings): red "Paused" badge is visible only inside the popover on mobile. On desktop it's still visible in the header — leave as-is.

- [ ] **Step 6: Commit**

```bash
cd /Users/ryanhaugland/guac
git add apps/web/src/app/dashboard/chat/page.tsx
git commit -m "chat(mobile): centered iMessage header, move channel tags to popover"
```

---

### Task 4: Messages background, bubble radius, delivery status on last-only, iMessage pill composer

**Files:**
- Modify: `apps/web/src/app/dashboard/chat/page.tsx`

**Context for implementer:** All changes live inside the `chatArea` JSX. The messages `<div>` starts with `bg-gray-50/50` today. Bubbles live inside the `messages.map(...)` block. The composer is the `<form>` at the bottom of `chatArea` (search for the textarea with `placeholder="Message..."` or similar). Delivery status is currently rendered inside *every* outbound bubble — we lift it out and render once at the bottom of the messages list.

- [ ] **Step 1: Update messages background and bubble radius (mobile only)**

Find the `<div className="flex-1 overflow-y-auto px-3 md:px-6 py-4 space-y-1 bg-gray-50/50">` — the messages container. Replace its classes with responsive mobile/desktop backgrounds:

```tsx
<div className="flex-1 overflow-y-auto px-3 md:px-6 py-4 space-y-1 bg-[#F2F2F7] md:bg-gray-50/50">
```

Desktop keeps its current background; mobile gets the iOS-gray.

For the bubble classes, find the block:

```tsx
<div className={`max-w-[80%] md:max-w-[65%] px-3.5 py-2 ${
  isMine
    ? `bg-green-primary text-white ${sameSender && !showTime ? "rounded-2xl rounded-br-md" : "rounded-2xl"}`
    : `bg-white text-gray-900 shadow-sm ${sameSender && !showTime ? "rounded-2xl rounded-bl-md" : "rounded-2xl"}`
}`}>
```

Replace with:

```tsx
<div className={`max-w-[75%] md:max-w-[65%] px-3.5 py-2 ${
  isMine
    ? `bg-green-primary text-white ${sameSender && !showTime ? "rounded-[22px] rounded-br-md" : "rounded-[22px]"}`
    : `bg-white text-gray-900 shadow-sm ${sameSender && !showTime ? "rounded-[22px] rounded-bl-md" : "rounded-[22px]"}`
}`}>
```

Two changes: `max-w-[80%]` → `max-w-[75%]` (mobile only; desktop override stays), and `rounded-2xl` (16px) → `rounded-[22px]` to match iMessage.

- [ ] **Step 2: Remove per-bubble delivery status rendering**

In the same `messages.map(...)` block, find and **delete** the per-bubble status sub-block (currently rendered inside the outbound bubble):

```tsx
{isMine && (
  <div className="flex justify-end mt-0.5">
    <span className={`text-[9px] ${
      msg.deliveryStatus === "delivered" ? "text-white/60" :
      msg.deliveryStatus === "queued" ? "text-yellow-200/80" :
      msg.deliveryStatus === "failed" ? "text-red-200/80" : "text-white/40"
    }`}>
      {msg.deliveryStatus === "delivered" ? "Delivered" : msg.deliveryStatus === "queued" ? "Queued" : msg.deliveryStatus === "failed" ? "Failed" : "Sending"}
    </span>
  </div>
)}
```

Delete that entire `{isMine && (…)}` block. The outbound bubble's inner contents should now just be the `<p>…</p>` body.

- [ ] **Step 3: Render delivery status once, under the last outbound message**

After the `messages.map(...)` closes but *before* the scheduled-ghost-rows block (`{scheduled.filter(...).map(...)}`), insert this new block:

```tsx
{/* Delivery status line — shown only under the most recent outbound message */}
{(() => {
  const lastMine = [...messages].reverse().find((m) => m.senderId === user.id || m.senderId === DEMO_OUTBOUND_SENDER);
  if (!lastMine) return null;
  const status = lastMine.deliveryStatus;
  const label =
    status === "delivered" ? "Delivered" :
    status === "queued" ? "Queued" :
    status === "failed" ? "Failed" :
    "Sending…";
  const color =
    status === "failed" ? "text-red-500" :
    status === "queued" ? "text-amber-600" :
    "text-gray-400";
  return (
    <div className={`flex justify-end pr-1 ${color} text-[10px] mt-0.5`}>
      {label}
    </div>
  );
})()}
```

This shows the label once, right-aligned, under the latest outbound bubble, in an iOS-muted style. For "Failed" it's red; otherwise muted gray/amber.

- [ ] **Step 4: Re-skin the composer to an iMessage pill (mobile-only)**

Find the composer `<form>` block at the bottom of `chatArea` (it contains the textarea and send button). Its current outer form has classes like `px-3 md:px-6 py-2 md:py-3 border-t border-gray-100 bg-white`.

Split it into a mobile-only and desktop-only version. Replace the entire existing composer form with:

```tsx
{/* Desktop composer (unchanged) */}
<form onSubmit={handleSend} className="hidden md:block px-6 py-3 border-t border-gray-100 bg-white">
  <div className="flex items-end gap-2">
    <textarea
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(e); } }}
      placeholder={`Message ${selected.name ?? "..."}`}
      rows={1}
      className="flex-1 resize-none px-4 py-2 bg-gray-100 rounded-2xl text-[15px] focus:outline-none focus:ring-2 focus:ring-green-primary/30 max-h-32"
    />
    <button
      type="submit"
      disabled={!draft.trim() || sending}
      className="w-10 h-10 rounded-full bg-green-primary text-white flex items-center justify-center disabled:bg-gray-200 disabled:text-gray-400 transition-colors"
      aria-label="Send"
    >
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 12l14 0m0 0l-6 -6m6 6l-6 6" />
      </svg>
    </button>
  </div>
</form>

{/* Mobile composer (iMessage pill) */}
<form
  onSubmit={handleSend}
  className="md:hidden px-3 pt-2 bg-white"
  style={{ paddingBottom: `calc(0.5rem + env(safe-area-inset-bottom))` }}
>
  <div className="flex items-end gap-2 rounded-full border border-gray-200 bg-white pl-4 pr-1 py-1">
    <textarea
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(e); } }}
      placeholder={`Message ${selected.name ?? "..."}`}
      rows={1}
      className="flex-1 resize-none bg-transparent text-[15px] leading-snug py-2 focus:outline-none max-h-32"
    />
    <button
      type="submit"
      disabled={!draft.trim() || sending}
      className="w-9 h-9 rounded-full bg-green-primary text-white flex items-center justify-center disabled:bg-gray-200 disabled:text-gray-400 transition-colors flex-shrink-0 mb-0.5"
      aria-label="Send"
    >
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m0 0l-6 6m6-6l6 6" />
      </svg>
    </button>
  </div>
</form>
```

Adapt field names: `draft` / `setDraft` / `handleSend` / `sending` are the existing variable names used in the current composer — reuse them verbatim. If the existing composer uses different names (e.g. `message` instead of `draft`), substitute accordingly. Do **not** introduce new state.

Note: desktop composer uses the `→` horizontal-arrow send icon, mobile uses the `↑` up-arrow (iMessage style). Desktop is kept identical to today to satisfy the "no desktop changes" constraint — the only thing that changed for desktop is that it's now explicitly `hidden md:block` instead of implicit. That's a no-op visually.

- [ ] **Step 5: Type-check**

Run: `cd /Users/ryanhaugland/guac/apps/web && npx tsc --noEmit`

Expected: exits with no output, exit code 0.

- [ ] **Step 6: Manual smoke check**

- **Mobile**: open a conversation. Background is iOS-gray. Bubbles are visibly more rounded (22px corners). Send 3 messages → only the last one has "Delivered" (or "Sending…" while in flight) underneath. Previous sent messages have no status label.
- **Mobile composer**: pill shape with border and up-arrow send button. When input is empty, button is gray-disabled; when typing, button turns green. Enter sends, Shift+Enter newlines. Virtual keyboard opening should not cover the composer.
- **Desktop** (`md:` breakpoint): background, bubbles, composer unchanged visually (same corners, same `→` send icon).
- **Scheduled ghost row** (trigger a "Send when ☀️" to a ⛈️ teammate in demo mode): still renders correctly below the real messages with its "Queued — sends when ☀️ · Cancel" caption.

- [ ] **Step 7: Commit**

```bash
cd /Users/ryanhaugland/guac
git add apps/web/src/app/dashboard/chat/page.tsx
git commit -m "chat(mobile): iMessage bubble radius, last-only delivery status, pill composer"
```

---

### Task 5: iOS-modal re-skin for broadcast composer & scheduled panel (mobile)

**Files:**
- Modify: `apps/web/src/app/dashboard/chat/page.tsx`

**Context for implementer:** Both `broadcastPanel` and `scheduledPanel` are rendered as full-screen overlays on mobile via the `mobileShowOverlay` container. They're also used in desktop's side-by-side layout. We only re-skin the mobile rendering by adjusting the top header row of each panel and introducing iOS conventions (Cancel / Send buttons, larger title). We keep desktop untouched.

Strategy: both panels already render a header row with a "Cancel" or back button. On mobile they currently use text buttons — we just restyle them to be a consistent iOS modal header, and add explicit mobile-only header markup where needed.

- [ ] **Step 1: Broadcast panel — mobile header row**

Find the `broadcastPanel` JSX. Locate the top header row (currently something like):

```tsx
<div className="flex items-center gap-3 px-3 md:px-6 py-2.5 md:py-3 border-b border-gray-100">
  <button onClick={handleBack} className="md:hidden text-green-primary p-1.5 -ml-0.5 flex items-center gap-0.5">…</button>
  <h3 className="flex-1 text-[15px] font-semibold text-gray-900">Broadcast</h3>
  <button onClick={() => { setShowBroadcast(false); setMobileView("list"); }} className="text-sm text-gray-400 hover:text-gray-600 hidden md:block">Cancel</button>
</div>
```

Replace with a split desktop/mobile header:

```tsx
{/* Desktop header (unchanged) */}
<div className="hidden md:flex items-center gap-3 px-6 py-3 border-b border-gray-100">
  <h3 className="flex-1 text-[15px] font-semibold text-gray-900">Broadcast</h3>
  <button onClick={() => { setShowBroadcast(false); setMobileView("list"); }} className="text-sm text-gray-400 hover:text-gray-600">Cancel</button>
</div>

{/* Mobile header (iOS modal) */}
<div className="md:hidden grid grid-cols-3 items-center px-3 py-3 border-b border-gray-100 bg-white">
  <button
    onClick={() => { setShowBroadcast(false); setBroadcastDraft(""); setBroadcastResult(null); setMobileView("list"); }}
    className="justify-self-start text-[15px] text-gray-500 active:opacity-60"
  >
    Cancel
  </button>
  <h3 className="justify-self-center text-[17px] font-semibold text-gray-900">Broadcast</h3>
  <button
    type="submit"
    form="broadcast-form"
    disabled={broadcastSending || !broadcastDraft.trim() || !broadcastWorkspace}
    className="justify-self-end text-[15px] font-semibold text-green-primary disabled:text-gray-300 active:opacity-60"
  >
    {broadcastSending ? "Sending…" : "Send"}
  </button>
</div>
```

Then, update the existing `<form onSubmit={handleBroadcast} …>` inside `broadcastPanel`: add `id="broadcast-form"` to its `<form>` tag so the header's Send button can submit it via the `form="broadcast-form"` attribute.

Also hide the existing inline send button on mobile (inside the form) since we now submit from the header. Find the inline submit button inside the form and add `hidden md:flex` (or `md:inline-flex`) to its existing `className` so it's desktop-only. Keep it as-is on desktop.

- [ ] **Step 2: Scheduled panel — mobile header row**

Find the `scheduledPanel` JSX. Locate its header row (structure is similar to the broadcast panel). Apply the same treatment:

```tsx
{/* Desktop header (unchanged) */}
<div className="hidden md:flex items-center gap-3 px-6 py-3 border-b border-gray-100">
  <h3 className="flex-1 text-[15px] font-semibold text-gray-900">Scheduled</h3>
  <button onClick={() => { setShowScheduledPanel(false); setMobileView("list"); }} className="text-sm text-gray-400 hover:text-gray-600">Close</button>
</div>

{/* Mobile header (iOS modal — Back + title, no right action) */}
<div className="md:hidden grid grid-cols-3 items-center px-3 py-3 border-b border-gray-100 bg-white">
  <button
    onClick={() => { setShowScheduledPanel(false); setMobileView("list"); }}
    className="justify-self-start text-[15px] text-green-primary flex items-center gap-0.5 active:opacity-60"
  >
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
    Messages
  </button>
  <h3 className="justify-self-center text-[17px] font-semibold text-gray-900">Scheduled</h3>
  <div />
</div>
```

The existing scheduled panel header block should be deleted (the pre-existing mobile header is replaced by the above). If the original structure varies, the implementer should preserve the close-behavior (`setShowScheduledPanel(false); setMobileView("list");`) wiring.

- [ ] **Step 3: Type-check**

Run: `cd /Users/ryanhaugland/guac/apps/web && npx tsc --noEmit`

Expected: exits with no output, exit code 0.

- [ ] **Step 4: Manual smoke check**

- **Mobile**: tap the Broadcast FAB → composer opens. Header shows "Cancel" (left, muted) / "Broadcast" (center, bold) / "Send" (right, green, disabled until there's a draft + workspace). Tapping Send fires the existing broadcast path. After success, the green confirmation card renders as before.
- **Mobile**: tap the scheduled chip → scheduled panel opens. Header shows `‹ Messages` (left, green) / "Scheduled" (center, bold). The rest of the panel content is unchanged.
- **Desktop**: both panels look identical to pre-change.

- [ ] **Step 5: Commit**

```bash
cd /Users/ryanhaugland/guac
git add apps/web/src/app/dashboard/chat/page.tsx
git commit -m "chat(mobile): iOS-modal headers for broadcast composer and scheduled panel"
```

---

### Task 6: Final verification

**Files:**
- No code changes. Verification only.

**Context for implementer:** A final pass to confirm the redesign is complete and nothing regressed. This task does not produce a commit — it's a verification gate before we call the work done.

- [ ] **Step 1: Full type-check across all apps**

```bash
cd /Users/ryanhaugland/guac/apps/web && npx tsc --noEmit
cd /Users/ryanhaugland/guac/apps/api && npx tsc --noEmit
```

Expected: both exit cleanly with no output.

- [ ] **Step 2: Full mobile smoke test (real device or Chrome DevTools iPhone 15 Pro viewport)**

Walk through every scenario below and confirm each item visually:

- Contact list
  - [ ] Large bold "Messages" title at top.
  - [ ] If scheduled > 0: amber pill "⏳ N scheduled" visible in the header.
  - [ ] Green `+` circle button on the right.
  - [ ] Contact rows have inset dividers (starting after the avatar).
  - [ ] Unread rows show a small green dot on the far left.
  - [ ] Weather emoji appears right of the contact name.
  - [ ] Relative timestamp appears right-aligned on each row.
  - [ ] Green pill FAB labeled "Broadcast" visible at bottom-right.
- Conversation
  - [ ] Tapping a contact opens the conversation. FAB is hidden.
  - [ ] Header: `‹ Messages` left, centered tiny-avatar-over-name in the middle, weather emoji next to the name, ⓘ on the right.
  - [ ] No channel tags in the header.
  - [ ] Tapping the name or ⓘ opens the Channel Intelligence popover.
  - [ ] Popover now shows a "Reaches via" row with the channel tags.
  - [ ] Background is iOS-gray.
  - [ ] Bubbles have deeply-rounded corners.
  - [ ] Only the most recent outbound message shows "Delivered"/"Sending…"/"Queued"/"Failed" beneath it.
  - [ ] Composer is an iOS pill with an up-arrow send button that grays out when empty.
- Storm flow (demo Marcus ⛈️ or a real ⛈️ teammate)
  - [ ] Storm modal still opens when sending.
  - [ ] "Send when ☀️" option still works; ghost row renders in the conversation.
- Broadcast
  - [ ] FAB → composer. Header: Cancel / Broadcast / Send.
  - [ ] Send disabled until draft + workspace are set.
  - [ ] After send: green success card renders.
  - [ ] Cancel returns to contact list.
- Scheduled panel (if any scheduled exist)
  - [ ] Scheduled chip opens panel. FAB still visible bottom-right.
  - [ ] Header: `‹ Messages` / Scheduled / (no right action).
- Desktop (`md:` breakpoint) regression
  - [ ] Contact list sidebar, conversation, broadcast composer, scheduled panel all look identical to pre-change.
  - [ ] Intelligence popover has the new "Reaches via" row (this is intentional and acceptable on desktop).

- [ ] **Step 3: Confirm done**

If all above items pass, the plan is complete. If any item fails, open a new targeted fix commit referencing the specific check that failed. No bulk rewrites.
