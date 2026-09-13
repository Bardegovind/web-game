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

Corner positions, counts, order and the 8s idle window are fixed. She already
knows this sequence; it is the one thing in the project that must never be
redesigned. The corners' *sizes* are not part of it: they were enlarged so a
real thumb lands on them, and `tests/e2e/tapTolerance.e2e.js` keeps them that way.

### What she feels

Every tap on a hidden corner vibrates, and the feeling says what happened to
it, so there is nothing to count:

| Feeling | Meaning |
|---|---|
| short tick | that tap counted |
| two pulses | this corner is done, move to the next |
| one long buzz | that tap did not count — start again at top-left |
| a longer pattern | the door is opening |

Tap each corner until you feel two pulses, then move on. Taps on the game board
never vibrate. iPhones do not support web vibration, so on an iPhone none of
this is felt and the counts have to be done by hand.

## Running it

```bash
cd frontend && npm install && npm run build   # builds the React chamber
cd ../backend && npm install
cp .env.example .env                          # then fill it in
npm start                                     # http://localhost:5000
```

The server serves `frontend/dist` when it exists and falls back to the source
tree otherwise, so a fresh clone still runs the game before anyone has built.

While working on the chamber, `cd frontend && npm run dev` gives hot reload and
proxies the API and the websocket to port 5000.

## Tests

```bash
npm test          # 123 unit tests — no database, no browser, fast
npm run test:e2e  # 32 tests driving real Chrome, including the corner taps
npm run test:int  # 43 tests against a real MongoDB and real socket clients
npm run test:all  # all three
```

`test:e2e` runs against `frontend/dist`, so it exercises exactly what ships.
One of them performs the whole journey — ritual, password, chamber, a live
message from the other person — in a real browser.

The integration tests need a throwaway database, and the scaling test also
wants Redis. Both skip with a clear message if they are not running:

```bash
docker run -d --name wg-test-mongo -p 27018:27017 mongo:7
docker run -d --name wg-test-redis -p 6380:6379 redis:7-alpine
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

The game stays vanilla; only what is behind the password is React. The chamber
mounts into the game's page rather than living at a url of its own, so there is
no address to stumble onto.

```
frontend/
  index.html            one page: the game, and a container the chamber fills
  public/
    js/
      tapSequence.js    pure state machine for the ritual — no DOM, unit tested
      tapZones.js       binds pointerdown on the three corners
      game.js           Tic-Tac-Toe
      auth.js           the password step
      chamber.js        the whole seam between vanilla and React
    css/style.css       the game's styling
  chamber/              React + TypeScript + Tailwind
    app/                shell and the entrance
    features/chat/      conversations, messages, composer
    features/memories/  photos
    stores/             Zustand: auth, chat, presence
    hooks/              TanStack Query: conversations, messages, memories
    socket/             the realtime client and the protocol names
    utils/time.ts       day labels and clock times

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

## What is in it

- **M1** reliability, identity, realtime, security, tests, Docker
- **M2** React + Vite + TypeScript + Tailwind chamber (the game stays vanilla)
- **M3** today, memories, our story, open-when letters, question of the day, shared list
- **M4** reactions, replies, read receipts, optimistic send
- **M5** installable as a PWA; push is wired and waits on keys and HTTPS
- **M6** Redis adapter proven across two instances, security headers, graceful shutdown

### Installing it on a phone

It installs as **Tic Tac Toe**, with the game's icon. That is deliberate: an
app called "Our Place" with a heart on it would hand the secret to anyone
glancing at her home screen, which is the one thing this is built to avoid. The
same goes for notifications — they say your turn, never what is waiting or who
it is from.

Installing needs HTTPS. On localhost the service worker still registers, so
offline behaviour can be tested.

### Running more than one instance

Set `REDIS_URL`. Nothing else changes: the socket layer already addresses
rooms rather than connections, so the adapter is the only moving part.
`tests/integration/scaling.int.js` runs two real instances and proves a message
crosses between them — and includes the control showing it does not without
Redis.

Design notes: `docs/superpowers/specs/`.
