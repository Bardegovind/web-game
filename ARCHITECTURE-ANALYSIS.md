# Web Game — Architecture & Infrastructure Analysis

Analysed 2026-09-11 against commit `d2b5d5f` plus uncommitted changes
(`Dockerfile`, `backend/.dockerignore`, `jsdom` added to `backend/package.json`).

---

## 1. What this actually is

A **Tic Tac Toe game used as a cover** for a hidden private app. The real product is the
"Secret Chamber" — a shared photo gallery plus 1:1 realtime chat — reached through a hidden
tap sequence followed by a master password.

**Unlock flow** (`frontend/js/tapTracker.js:11`): three invisible 100x100px corner zones.

| Order | Zone         | Taps required |
|-------|--------------|---------------|
| 1     | top-left     | 16            |
| 2     | top-right    | 3             |
| 3     | bottom-right | 7             |

Taps must be in sequence; a wrong zone resets progress; 8s of inactivity resets
(`TIMEOUT_MS`). Completing the pattern calls `auth.open()` (`frontend/js/chamber.js:37`),
which posts to `/api/auth/verify-password` and, on success, stores a JWT and swaps to the
chamber view.

---

## 2. Architecture

One Express process serves the API, the websocket, and the static frontend from a single
origin. No build step, no framework, no bundler.

```
Browser — vanilla JS globals, loaded in script-tag order
  api.js -> tapTracker.js -> game.js -> auth.js -> gallery.js -> chat.js -> chamber.js
     |                                          |
     | fetch /api/*  (Authorization: Bearer)    | socket.io (JWT in handshake.auth)
     v                                          v
  Express 5 ---------------------------------- Socket.IO 4
    routes/ -> controllers/ -> models/           handlers inline in server.js:84-168
     |
     +-- MongoDB (Mongoose 9)
     |     MasterPassword  (singleton)
     |     ChamberUser     (username, isOnline, socketId, lastSeen)
     |     Message         (sender, receiver, text, type, fileUrl)
     |     GalleryItem     (url, publicId, caption, uploadedBy)
     |
     +-- Cloudinary (multer-storage-cloudinary — files never touch local disk)
```

### Layers

| Layer      | Location                    | Notes                                              |
|------------|-----------------------------|----------------------------------------------------|
| Routing    | `backend/routes/*.js`       | Thin; `router.use(authMiddleware)` guards chat+gallery |
| Logic      | `backend/controllers/*.js`  | auth / chat / gallery                              |
| Data       | `backend/models/*.js`       | 4 Mongoose schemas, all with timestamps            |
| Realtime   | `backend/server.js:84-168`  | Not extracted — lives inline in the entrypoint     |
| Uploads    | `backend/utils/upload.js`   | multer -> Cloudinary, 10MB cap, format allowlist   |
| Static/SPA | `backend/server.js:44,59`   | `express.static` then `app.get('{*path}')` fallback |

### Auth model

One shared master password for everyone. `backend/controllers/auth.controller.js:50` signs a
24h JWT for **whatever username the client typed**. The password proves you may enter; the
username is self-asserted and never verified against anything.

The plaintext master password lives in `.env` and is re-hashed into MongoDB on every boot
(`backend/server.js:173-207`), rotating the stored hash whenever `.env` changes.

### Realtime routing

Each user's current `socketId` is written onto their `ChamberUser` document on connect.
DMs are delivered with `io.to(receiverUser.socketId).emit(...)` (`backend/server.js:129`).
Messages are persisted to Mongo first, then pushed to the receiver if online, then echoed
back to the sender as `message:sent`.

---

## 3. Infrastructure

```dockerfile
FROM node:18
WORKDIR /app
COPY backend/package.json ./
RUN npm install
COPY backend ./backend
COPY frontend ./frontend
WORKDIR /app/backend
EXPOSE 5000
CMD ["node", "server.js"]
```

* **Config:** entirely environment-driven — `MONGO_URI`, `MASTER_PASSWORD`, `JWT_SECRET`,
  `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET`, `PORT`.
* **Secrets hygiene:** `.env` is correctly gitignored *and* dockerignored. `git ls-files`
  confirms no env file has ever been committed. Env must be supplied at `docker run`
  (`--env-file`), since it is deliberately excluded from the image.
* **State:** all state is external (MongoDB + Cloudinary) *except* `socketId`, which couples
  the process to the DB in a way that prevents replicas — see finding #8.
* **Health:** `/api/health` exists (`backend/server.js:54`) but nothing consumes it.

**Absent:** CI, tests (`npm test` exits 1), reverse proxy config, `.env.example`, README,
compose/orchestration file, logging or error tracking, backup strategy.

---

## 4. Findings

### Security — critical

**1. Trivial impersonation.**
`backend/controllers/auth.controller.js:50` — the master password is the only gate and the
username is free-form. Anyone with the password can log in as `alice`, then
`GET /api/chat/messages/bob` returns her entire private history, and `message:send` posts as
her. Every participant can become every other participant.
*Fix:* bind usernames to their own credential, or at minimum reject a username already
registered in `ChamberUser` and hold a per-user secret.

**2. Stored XSS -> token theft.**
- `frontend/js/chat.js:323` — `msg.text` goes into `innerHTML` with only `\n` -> `<br>`.
- `frontend/js/chat.js:321` — builds `onclick="gallery.openLightbox('${msg.fileUrl}')"`;
  a single quote in the URL escapes the handler.
- `frontend/js/gallery.js:80-84` — `img.url` and `img.caption` interpolated into attributes.

Messages persist in Mongo, so one crafted message runs in the recipient's page and can read
`chamber_token` out of `localStorage` (`frontend/js/api.js:11`).
*Fix:* use `textContent` for message text and captions; set `img.src` as a property; attach
listeners instead of inline `onclick`. Add a server-side length cap on `text`.

**3. No rate limiting on `/api/auth/verify-password`.**
This one endpoint guards the entire application. bcrypt cost 12 slows a brute force but
nothing stops it. *Fix:* `express-rate-limit` keyed by IP, plus a lockout window.

**4. CORS wide open.**
`app.use(cors())` (`backend/server.js:39`) and Socket.IO `origin: '*'`
(`backend/server.js:31`) — the code comment itself says *"for development"*.

**5. No authorization on gallery delete.**
`backend/routes/gallery.routes.js:17` — any authenticated user can delete any image, and
`uploadedBy` is hardcoded to `"admin"` (`backend/controllers/gallery.controller.js:49`) so
ownership is not even recorded.

### Real bugs

**6. Chat history returns the OLDEST 200 messages, not the newest.**
`backend/controllers/chat.controller.js:19` — `.sort({ createdAt: 1 }).limit(200)` while the
comment claims "last 200". Past message 200, reopening a conversation shows only ancient
history and new messages never appear on reload.
*Fix:* `.sort({ createdAt: -1 }).limit(200)` then reverse the array before responding.

**7. Multi-tab breaks messaging.**
`socketId` is a single scalar field. A second tab overwrites it (the first goes deaf), and
closing *either* tab sets `isOnline:false` and nulls the socketId for the tab still
connected (`backend/server.js:159`). *Fix:* store a set of socket ids, or use Socket.IO
rooms keyed by username and drop `socketId` from the schema entirely.

**8. Cannot scale beyond one instance.**
Same root cause. Two replicas behind a load balancer silently drop cross-instance DMs, since
`io.to(socketId)` only reaches sockets on the local process. *Fix:* `@socket.io/redis-adapter`
plus username rooms.

**9. Dead code that throws.**
`frontend/js/chamber.js:71-104` — `switchMainView` dereferences `.navbar`, which does not
exist in `index.html` (`null.style` throws); `openPasswordModal`/`closePasswordModal` use
`this.passwordModal` (never assigned) and call `auth.clearInputs()` (never defined).
Currently unreachable, but a landmine for the next edit. *Fix:* delete all three methods.

**10. API 404s return HTML.**
The `{*path}` SPA fallback (`backend/server.js:59`) also catches unmatched `/api/*`, so
`res.json()` in `frontend/js/api.js` throws a JSON parse error instead of surfacing the real
failure. *Fix:* mount a JSON 404 handler on `/api` before the fallback.

**11. Username case inconsistency.**
`message:send` lowercases the receiver (`backend/server.js:110`), but `typing:start` and
`typing:stop` do not (`backend/server.js:142,150`), and `getMessages` does not lowercase the
URL param. Works today only because the UI always passes DB-sourced lowercase names.

**12. Unread badge is in-memory only.**
`frontend/js/chat.js:26` — resets on reload, and on every tab switch, because
`visibilitychange` force-exits the chamber (`frontend/js/chamber.js:148`). Messages
themselves survive; the badge is meaningless across sessions. Note `unreadCount` is also
declared twice in the same object literal (lines 13 and 26).

### Infrastructure / ops

**13. Non-reproducible builds.** `package-lock.json` is never copied into the image, so
`npm install` ignores it. *Fix:* `COPY backend/package*.json ./` and `npm ci`.

**14. `node_modules` at `/app` while the app runs from `/app/backend`.** Works only via
Node's parent-directory resolution. It breaks the moment anyone adds a `package.json` under
`backend/`. *Fix:* set `WORKDIR /app/backend` before installing.

**15. Base image problems.** `node:18` is past end-of-life (local runtime is Node 24); the
full image is ~1GB with no multi-stage build; the container runs as **root**; no
`HEALTHCHECK` despite `/api/health` existing.

**16. Master password re-hashed from `.env` on every boot** (`backend/server.js:192`). The
plaintext lives in the environment permanently, and a lost or edited `.env` silently rotates
the credential in the database.

**17. `jsdom` is declared but used nowhere.** Added in the uncommitted `package.json` diff;
`grep` finds zero references in `backend/` or `frontend/`. It pulls ~40 transitive packages
into the image for nothing. *Fix:* `npm uninstall jsdom`.

**18. Debug logging left in.** `console.log("FILE:", req.file)` and `console.log("BODY:", ...)`
at `backend/controllers/gallery.controller.js:42-43`.

**19. Index does not match the query.** `Message` is indexed `{sender, receiver, createdAt}`
(`backend/models/Message.js:27`) but `getMessages` runs an `$or` over both directions, so the
index serves only one branch. `GalleryItem` has no index on `createdAt` despite sorting by it.

---

## 5. Note on the hidden entrance

The tap sequence is pure client-side obfuscation. The entire chamber UI ships inside
`frontend/index.html`, and the pattern is plainly readable in `frontend/js/tapTracker.js`.
Anyone who opens view-source or DevTools finds both immediately.

That is fine as a design — but it means the master password is the *only* real boundary,
which is what makes findings #1 (impersonation) and #3 (no rate limiting) the two that
actually matter.

---

## 6. Suggested order of work

1. #6 — silent data loss in chat history (one-line fix, worst user-visible impact)
2. #2 — XSS, since it leaks the token that guards everything
3. #1 + #3 — impersonation and brute force, the real security boundary
4. #17, #18, #9 — free cleanup (unused dep, debug logs, throwing dead code)
5. #13, #14, #15 — Dockerfile correctness and reproducibility
6. #7 + #8 — socket identity rework, only if multi-tab or multi-instance is needed
