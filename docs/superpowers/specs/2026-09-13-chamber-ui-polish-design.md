# Chamber UI polish — design

Date: 2026-09-13
Status: approved by the user in chat

## Why

Reported from using it on a phone: switching between screens feels jumpy,
six tabs across the top feel cluttered, the chat does not feel like a real
messaging app, and the overall look is uneven. The user also wants to be told,
live, when the other person comes into the chamber.

## Decisions already made

| Question | Decision |
|---|---|
| Component approach | shadcn/ui (Radix + Tailwind, copied into the repo) and Sonner for toasts |
| Visual direction | Keep the warm amber-on-dark look and polish it (question left blank; the recommended default was taken) |
| Live alert | Toast on arrival and on leaving, plus the online dot |
| Firebase | Not used. Presence already travels over Socket.IO in real time; Firebase is only needed for notifying a closed app, which also needs HTTPS |

## Out of scope — unchanged

- The Tic-Tac-Toe screen and the 16 / 3 / 7 ritual, including haptics
- The backend and the Socket.IO protocol
- PWA and service worker behaviour

## Delivery in three slices

Each slice is built, tested and committed on its own.

### Slice 1 — navigation, transitions, live presence

**Bottom navigation.** Replaces the six sideways-scrolling text tabs with a
bottom bar: `Today · Chat · Moments · Letters · More`. Story and List live
under More. Unread and unopened counts show as badges on the bar.

**Screen transitions.** Screens slide and fade with Framer Motion instead of
swapping instantly. On entering the chamber, the data for every tab is
prefetched through TanStack Query, and cached data is kept while revalidating,
so opening a tab never flashes a skeleton.

**Live presence toasts.** Driven by the existing `presence:update` event,
rendered with Sonner.

- "radhe is here" when the other person goes from offline to online.
- "radhe left" when they go from online to offline — shown only if they are
  still offline after a 5 second grace period, so a quick app switch or a
  dropped connection does not flash "left" then "here".
- No toast for your own presence events, which the server also broadcasts.
- No duplicate toast when the other person opens a second tab: the server
  emits `presence:update` on every connection, so the client compares against
  the last known state and only toasts on a real change. Known state is seeded
  from the conversations list, so someone already online when you enter does
  not trigger "is here" on their next tab.

### Slice 2 — chat that feels like a real app

- Conversation header: avatar, name, and online / last seen / typing.
- Bubbles grouped by sender, with the tail only on the last in a run.
- A date chip that sticks to the top while scrolling through that day.
- An "N unread" divider at the first unread message when opening.
- A jump-to-latest button when scrolled up, showing how many new messages
  arrived.
- The view only auto-scrolls on new messages when already near the bottom.
- An auto-growing composer.
- **Bug fix:** reactions and reply currently appear on hover only, which a
  phone does not have. Long-press opens reactions; swipe right replies.

### Slice 3 — overall look

- One spacing scale, one radius scale, one type scale, used everywhere.
- Today, Moments, Letters, Story and List rebuilt from the same shadcn
  primitives (Card, Button, Input, Dialog, Sheet) restyled to the palette.

## Integration risks, designed for

**Tailwind preflight.** shadcn components assume Tailwind's base reset.
Preflight is deliberately not loaded globally because it would restyle the
game (see the cascade-layer note in `chamber/index.css`). The chamber keeps a
scoped reset under `.chamber-root`, extended to cover what the new components
rely on.

**Portals.** Radix dialogs, sheets and tooltips, and Sonner's toaster, render
into `document.body` by default — outside `.chamber-root`, where the chamber's
theme and reset do not apply. They are mounted into a container inside the
chamber root instead.

**Content security policy.** The server allows inline styles and same-origin
scripts only. Radix and Sonner inject inline styles, which is permitted, and
no inline scripts.

## Testing

- Existing chamber browser tests select the current tabs and are updated
  alongside the slice that changes them, keeping aria labels stable where
  possible.
- Slice 1 adds browser tests with a second real socket client: the arrival
  toast appears; a second tab does not duplicate it; a disconnect followed by
  a reconnect inside the grace period shows no "left"; a real departure shows
  "left" after the grace period; your own arrival shows nothing.
- Slice 2 adds tests for long-press reactions and swipe-to-reply on a touch
  device, the unread divider, and jump-to-latest.
- The full suite — unit, browser and integration — passes before each commit.
