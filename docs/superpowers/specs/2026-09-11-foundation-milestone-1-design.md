# Milestone 1 — Foundation

Date: 2026-09-11
Branch: `feat/foundation-milestone-1`
Status: approved for implementation

## Goal

Make the existing experience reliable. Almost nothing changes visually. Every line
written here survives the React migration in Milestone 2.

## Frozen constraints

These are not open to change, now or later:

1. **The discovery ritual.** Three hidden corners, tapped `16 → 3 → 7` in order,
   followed by the password screen. Zone positions, zone sizes, tap counts, order,
   and the 8s idle timeout are all unchanged. She already knows this sequence.
2. **Her login.** Same two fields, same password she uses today. If the new identity
   env vars are absent, the app falls back to the existing single-master-password
   behaviour so nothing can lock her out.
3. **No destructive migration.** Nothing in this milestone deletes or rewrites
   existing documents in the production Atlas cluster.

## Non-goals for Milestone 1

React, Tailwind, Zustand, TanStack Query, Framer Motion, PWA, Firebase, Redis,
Open When letters, timeline, surprises, bucket list, stats. All deferred.
The existing vanilla chamber UI is touched only where it is unsafe or broken —
it is not polished, because Milestone 2 replaces it.

---

## 1. Tap detector

Split so the correctness-critical half runs without a browser.

- `frontend/js/tapSequence.js` — pure finite state machine. `(zoneId, timestamp) -> state`.
  No DOM, no timers, fully unit-testable.
- `frontend/js/tapZones.js` — thin DOM adapter. Binds listeners, feeds the FSM,
  owns the timeout timer.

### States

```
IDLE ──z1──▶ Z1(1..16) ──16th──▶ Z2(1..3) ──3rd──▶ Z3(1..7) ──7th──▶ UNLOCKED
               │                    │                 │             (absorbing)
               └── wrong zone / 8s idle ──▶ IDLE ◀────┘
```

### Rules

| Concern | Decision | Rationale |
|---|---|---|
| Event | `pointerdown` only | One event across mouse/touch/pen. Removes the touch→click double-fire that is the likely cause of "sometimes needs 17 taps". |
| Debounce | 70ms between accepted taps | Below sustained human tap rate (~8-10/s), above event jitter. |
| Idle timeout | 8000ms, unchanged | Preserves the rhythm she already has. |
| Wrong corner | Reset to IDLE | Existing behaviour. |
| Stray tap (outside all zones) | **Ignored, not reset** | Deviation from the original request, deliberate. Zones are 100px; a near-miss resetting silently at tap 14 produces exactly the "it's broken" feeling we are removing. Strictly more forgiving; cannot make things worse. |
| Geometry | Unchanged: 100x100, same three corners | Frozen ritual. |
| CSS | Add `touch-action: manipulation` to zones | Removes 300ms tap delay and double-tap zoom. |
| One-shot | Listeners removed on unlock; re-armed on chamber exit | Prevents double-fire. Not "for the whole session" — `visibilitychange` auto-exit would otherwise trap her behind a page reload. |
| Modal open | Tracker disarmed | Stops counting taps behind the password dialog. |

## 2. Identity

New `User` collection replacing the single shared `MasterPassword`.

```
User { username (unique, lowercase), passwordHash, displayName, createdAt }
```

Seeded from environment on boot:

```
USER_A_NAME / USER_A_PASSWORD    <- her password stays the current MASTER_PASSWORD value
USER_B_NAME / USER_B_PASSWORD    <- separate password
```

**Fallback:** if `USER_A_NAME` is unset, the server keeps the legacy
`MASTER_PASSWORD` path exactly as it works today. The new model activates only once
the env vars are set, so deploying this cannot lock anyone out.

`POST /api/auth/verify-password` keeps its request and response shape. It now
resolves the user by username and compares against that user's hash. JWT payload
gains `sub` (userId); all downstream code keys off `userId` rather than a
client-supplied name.

Failed-attempt rate limiting: in-memory, 5 attempts per IP per 15 minutes, generic
failure message that does not reveal whether a username exists. No Redis — two users.

## 3. Chat

- **History order fixed.** `sort({createdAt:-1}).limit(n)` then reverse, so the newest
  messages are returned. Cursor pagination via `?before=<iso>` for later infinite scroll.
- **`conversationKey`** stored on every message: the two user ids sorted and joined.
  Index `{conversationKey:1, createdAt:-1}` replaces the `$or` scan. Primary latency win.
- **Unread via `lastReadAt`** (chosen over stored counters):
  `UserConversation { userId, peerId, lastReadAt }`. Unread = messages from peer with
  `createdAt > lastReadAt`. Survives refresh, close, logout, reconnect, sleep.
- **`GET /api/chat/conversations`** returns per peer: `lastMessage`, `lastMessageAt`,
  `unreadCount`. One request powers both sidebar and badge.
- **`message:read`** socket event updates `lastReadAt`, echoes to the sender (read
  receipt) and to the reader's other tabs.
- **`clientId`** generated per message by the client and echoed in the server ack.
  Enables optimistic send in Milestone 2 and dedupe on reconnect without duplicates.
- **Length cap** on message text, enforced server-side.

## 4. Presence and typing

- `socketId` scalar is removed from `ChamberUser`. Presence uses Socket.IO **rooms**
  keyed `user:<userId>`. Multi-tab stops breaking; Redis adapter can be added later
  without another rewrite.
- Online = room has at least one member. `lastSeen` written only when the last socket
  for that user disconnects.
- Typing events normalized to lowercase and routed to the peer's room, with a
  server-side ~3s auto-expire so a dropped `typing:stop` cannot leave a stuck indicator.

## 5. Security and correctness

- All user-controlled strings rendered with `textContent`; no `innerHTML` with data,
  no inline `onclick` handlers. Closes the stored XSS in chat and gallery.
- CORS restricted to a configured origin instead of `*`, for both Express and Socket.IO.
- JSON 404 handler mounted on `/api` before the SPA fallback.
- `uploadedBy` recorded from the JWT rather than hardcoded `"admin"`.
- Debug `console.log` of request bodies removed.
- Unused `jsdom` dependency removed.

## 6. Structure

```
backend/
  server.js          bootstrap only
  app.js             express wiring
  config/
  models/
  routes/
  controllers/
  services/          auth, chat, presence — testable without HTTP
  socket/
    index.js         io setup + handshake auth
    chat.handlers.js
    presence.handlers.js
    typing.handlers.js
  middleware/
  utils/
```

## 7. Verification

Node's built-in `node:test` runner. `npm test` runs for real.

- Unit: tap FSM (exhaustive — the crown jewel), unread computation, `conversationKey`,
  auth resolution, rate limiter.
- Integration: two socket clients — delivery, unread persistence across reconnect,
  typing auto-expire, multi-tab presence.
- End-to-end: real Chrome via `playwright-core` driving the actual corner taps,
  password, and chamber, against a throwaway Docker MongoDB. Never against Atlas.

## 8. Infrastructure

Dockerfile corrected: `npm ci` against the committed lockfile, Node 22 LTS,
install and run from the same workdir, non-root user, `HEALTHCHECK` against the
existing `/api/health`. Deployment target is localhost for now; TLS, PWA install
and push notifications are Milestone 4 concerns.

## Implementation order

1. Test infrastructure; `npm test` runs.
2. Tap FSM + adapter, TDD, with the existing ritual preserved. Verified in real Chrome.
3. Backend restructure into `app.js` / `services/` / `socket/`, behaviour unchanged.
4. Models: `User`, `UserConversation`, `Message.conversationKey` + backfill.
5. Auth: per-user credentials, `userId` in JWT, rate limiting, legacy fallback.
6. Chat services and endpoints: history order, pagination, conversations, read state.
7. Socket handlers: room presence, typing expiry, read receipts, acks.
8. Frontend: XSS sinks closed, server-driven unread, reconnect states.
9. Dockerfile.
10. Full end-to-end run in real Chrome; report what passes and what does not.
