# Secret Chamber

A Tic-Tac-Toe game with a private space hidden behind it.

## The ritual — frozen, never change it

```
Tic-Tac-Toe
    ↓
top-left corner    × 16
top-right corner   × 3
bottom-right corner × 7
    ↓
password
    ↓
Secret Chamber
```

Corner positions, sizes, counts, order and the 8s idle window are fixed. She
already knows this sequence; it is the one thing in the project that must never
be redesigned.

## Running it

```bash
cd backend
npm install
cp .env.example .env      # then fill it in
npm start                 # http://localhost:5000
```

## Tests

```bash
npm test          # 63 unit tests — no database, no browser, fast
npm run test:e2e  # 11 tests driving real Chrome, including the corner taps
npm run test:int  # 21 tests against a real MongoDB and real socket clients
```

The integration tests need a throwaway database. They skip with a clear message
if it is not running:

```bash
docker run -d --name wg-test-mongo -p 27018:27017 mongo:7
```

**Never point the tests, or a dev server, at the production `MONGO_URI`.**
Startup writes to the database (password seeding, the conversation-key
backfill), so an accidental run touches real data.

## Turning on per-person accounts

The app ships in **legacy mode**: one shared password, and whoever knows it can
sign in under any name — including the other person's. Closing that requires
four environment variables:

```bash
USER_A_NAME=radhe
USER_A_PASSWORD=<the current MASTER_PASSWORD value>
USER_B_NAME=govind
USER_B_PASSWORD=<a different password, yours>
```

Set `USER_A_PASSWORD` to whatever `MASTER_PASSWORD` is today and her login is
completely unchanged — same screen, same password, same everything. Yours
becomes separate.

Until these are set, nothing changes. That is deliberate: deploying this code
cannot lock anyone out.

## Layout

```
frontend/
  index.html
  js/
    tapSequence.js   pure state machine for the ritual — no DOM, unit tested
    tapZones.js      binds pointerdown on the three corners
    game.js          Tic-Tac-Toe
    chat.js  gallery.js  auth.js  chamber.js  api.js

backend/
  server.js          bootstrap only
  app.js             Express wiring
  routes/            HTTP routing
  controllers/       requests → services
  services/          business logic — auth, chat, presence, typing, seeding
  models/            Mongoose schemas
  socket/
    events.js        the realtime protocol, in one place
    chat.handlers.js  presence.handlers.js  typing.handlers.js
  config/            db, cloudinary, optional redis adapter
  tests/             unit · e2e (real Chrome) · integration (real Mongo)
```

## Realtime protocol

Event names live in `backend/socket/events.js`. Everything is addressed to
rooms named `user:<id>`, so every tab and device a person has open receives it,
and adding the Redis adapter for a second server instance needs no application
changes.

```
message:send → message:sent (to sender's tabs) + message:new (to the peer)
message:read → message:read:ack
typing:start / typing:stop   (server expires typing after ~3s)
presence:update
```

Messages carry a `clientId` that the server echoes, so a message rendered
before the round trip can be reconciled instead of appearing twice.

## Where this is going

- **M1 — foundation** ✅ reliability, identity, realtime, security, tests, Docker
- **M2** React + Vite + TypeScript + Tailwind chamber (the game stays vanilla)
- **M3** Memories, Our Story, Open When, Surprises
- **M4** reactions, replies, read-receipt UI, optimistic send
- **M5** PWA + push notifications
- **M6** Redis adapter and multiple instances, only when deployment needs it

Design notes: `docs/superpowers/specs/`.
