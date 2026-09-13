# Chamber UI Slice 1 — Navigation, Transitions, Live Presence — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the chamber a bottom navigation bar, smooth screen transitions with no loading flashes, and live "radhe is here" / "radhe left" toasts, built on shadcn/ui primitives and Sonner.

**Architecture:** The React chamber in `frontend/chamber` gains shadcn/ui's foundation (a `cn()` helper, theme tokens mapped onto the existing warm palette, a scoped reset instead of global preflight) plus Sonner for toasts and a Radix-based bottom Sheet for the "More" menu. Presence toasts are decided by a pure, unit-tested notifier fed by the existing Socket.IO `presence:update` event. Screens become a small navigation model rendered through Framer Motion, with every screen's data prefetched on entry through shared TanStack Query options.

**Tech Stack:** React 19.3, Vite 8.3, Tailwind CSS 4.3, TypeScript 7, Framer Motion 13, TanStack Query 5, Zustand 5, Socket.IO client 4.8, shadcn/ui (copied components), Sonner 2, Radix Dialog, Node 24 `node:test`, Playwright-core with system Chrome.

**Spec:** `docs/superpowers/specs/2026-09-13-chamber-ui-polish-design.md` (Slice 1 section)

## Global Constraints

- The Tic-Tac-Toe screen, the three hidden corners and the 16 → 3 → 7 ritual must not change. `tests/e2e/tapZones.e2e.js`, `tapTolerance.e2e.js` and `tapHaptics.e2e.js` must stay green.
- No Firebase. Presence uses the existing Socket.IO `presence:update` event.
- No global Tailwind preflight — it would restyle the game. Chamber base styles stay scoped under `.chamber-root`.
- Anything Radix portals (Sheet) renders into a container inside the chamber root; Sonner's `<Toaster />` is mounted inside the chamber root.
- Presence copy is exactly `<name> is here` and `<name> left`. The "left" toast waits a 5000 ms grace period.
- Bottom navigation labels are exactly `Today`, `Chat`, `Moments`, `Letters`, `More`. `More` opens a sheet containing `Story` and `List`.
- New frontend dependencies, exact floors: `sonner@^2.0.8`, `@radix-ui/react-dialog@^1.1.23`, `@radix-ui/react-slot@^1.3.3`, `class-variance-authority@^0.7.1`, `clsx@^2.1.1`, `tailwind-merge@^3.7.0`, `tw-animate-css@^1.4.0`.
- Pure logic modules that unit tests import (`chamber/presence/presenceNotifier.ts`, `chamber/app/navigation.ts`, `chamber/lib/utils.ts`) use relative imports only and contain no JSX. Node 24 runs `.ts` directly for the tests but does not understand the `@/` alias.
- Game CSS custom properties are all prefixed `--game-` so no Tailwind or shadcn theme variable can override them.
- A build is checked by its exit status. Never `vite build | tail && …` — the pipe hides a failed build.
- Tests use a throwaway MongoDB at `127.0.0.1:27018` and Redis at `127.0.0.1:6380`, never the Atlas URI in `backend/.env`.
- The full suite passes before every commit. Commit messages end with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

## Commands used throughout

Run from `backend/` unless noted.

```bash
# test databases (once per session)
docker run -d --name wg-test-mongo -p 27018:27017 mongo:7 2>/dev/null || docker start wg-test-mongo
docker run -d --name wg-test-redis -p 6380:6379 redis:7-alpine 2>/dev/null || docker start wg-test-redis

# one unit test file
node --test tests/<name>.test.js

# one browser test file (needs a current build)
node --test tests/e2e/<name>.e2e.js

# whole suites
npm test && npm run test:e2e && npm run test:int

# build (from frontend/) — exit status checked, not piped
cd ../frontend && npx tsc --noEmit && npx vite build > /tmp/wg-build.log 2>&1; echo "BUILD EXIT $?"; cd ../backend
```

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `frontend/public/css/style.css` | modify | Game stylesheet; every custom property renamed to `--game-*` |
| `backend/tests/gameStylesheet.test.js` | create | Guards that game CSS variables are namespaced and all resolve |
| `frontend/vite.config.ts` | modify | `@` → `chamber/` import alias |
| `frontend/tsconfig.json` | modify | `@/*` path mapping for the alias |
| `frontend/components.json` | create | shadcn/ui configuration, so the CLI can add components later |
| `frontend/chamber/lib/utils.ts` | create | `cn()` — merges class names, resolving Tailwind conflicts |
| `backend/tests/cn.test.js` | create | Proves `cn()` resolves Tailwind conflicts |
| `frontend/chamber/index.css` | modify | shadcn tokens mapped to the palette, tw-animate-css, scoped border reset |
| `frontend/chamber/components/ui/sonner.tsx` | create | Themed `<Toaster />` |
| `frontend/chamber/components/ui/sheet.tsx` | create | Bottom Sheet built on Radix Dialog, portaled into a given container |
| `frontend/chamber/presence/presenceNotifier.ts` | create | Pure: decides when to announce arrivals and departures |
| `backend/tests/presenceNotifier.test.js` | create | Unit tests for the notifier with a fake clock |
| `frontend/chamber/socket/socketClient.ts` | modify | Forwards `presence:update` to an `onPresence` callback |
| `frontend/chamber/features/chat/ConversationList.tsx` | modify | Online dot turns green |
| `backend/tests/e2e/support/chamberSession.js` | create | Shared browser-test helpers: server, ritual, sign-in, peer socket |
| `backend/tests/e2e/presence.e2e.js` | create | Live toast behaviour with a real second person |
| `frontend/chamber/app/navigation.ts` | create | Pure: screens, which bottom tab each belongs to, slide direction |
| `backend/tests/navigation.test.js` | create | Unit tests for the navigation model |
| `frontend/chamber/app/BottomNav.tsx` | create | The five-item bottom bar with badges |
| `frontend/chamber/app/MoreSheet.tsx` | create | Sheet offering Story and List |
| `frontend/chamber/hooks/useChamber.ts` | modify | Export shared query options |
| `frontend/chamber/hooks/useConversations.ts` | modify | Export shared query options |
| `frontend/chamber/hooks/useMemories.ts` | modify | Export shared query options |
| `frontend/chamber/app/prefetch.ts` | create | Prefetches every screen's data on entry |
| `frontend/chamber/app/ScreenStage.tsx` | create | Slides and fades between screens |
| `frontend/chamber/components/Skeleton.tsx` | modify | Marks skeletons with `data-skeleton` so tests can see them |
| `frontend/chamber/app/App.tsx` | modify | Composes nav, sheet, transitions, toasts, prefetch |
| `backend/tests/e2e/chamber.e2e.js` | modify | Selectors move from top tabs to the bottom bar and More sheet |
| `backend/tests/e2e/screens.e2e.js` | create | No skeleton flashes when switching screens |
| `README.md` | modify | Layout section lists the new folders |

---

### Task 1: Namespace the game's CSS variables

Why this comes first: `chamber/index.css` orders cascade layers `game, theme, base, components, utilities`. Tailwind declares theme variables such as `--radius-md` and `--font-mono` on `:root` in the `theme` layer, which outranks the game's `:root` in the `game` layer. Of the game's 32 custom properties, 18 sit in Tailwind theme namespaces (`--radius-*`, `--font-*`, `--color-*`, `--shadow-*`, `--text-*`), and shadcn adds more (`--radius-*`, `--color-*`). Any shared name silently changes how the game looks. Prefixing every game variable with `--game-` makes a collision impossible. Nothing outside `style.css` references these variables (verified: no `var(--` in `index.html` or `public/js/`).

**Files:**
- Create: `backend/tests/gameStylesheet.test.js`
- Modify: `frontend/public/css/style.css` (all 32 custom property declarations and every `var()` use)

**Interfaces:**
- Consumes: nothing
- Produces: every game custom property is named `--game-` + its old name without the leading `--`. Examples: `--radius-md` → `--game-radius-md`, `--font-mono` → `--game-font-mono`, `--color-x` → `--game-color-x`. Later tasks may declare Tailwind and shadcn theme variables freely.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/gameStylesheet.test.js`:

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const STYLESHEET = path.join(__dirname, '..', '..', 'frontend', 'public', 'css', 'style.css');
const css = fs.readFileSync(STYLESHEET, 'utf8');

const declared = [...new Set([...css.matchAll(/(?<![\w-])(--[a-zA-Z0-9-]+)\s*:/g)].map((m) => m[1]))];
const used = [...new Set([...css.matchAll(/var\((--[a-zA-Z0-9-]+)/g)].map((m) => m[1]))];

/**
 * The chamber's Tailwind and shadcn theme variables are declared on :root in a
 * cascade layer that outranks the game's stylesheet. Any game variable sharing
 * a name — --radius-md, --font-mono — is silently replaced and the game changes
 * appearance. A prefix makes that collision impossible.
 */
test('every custom property the game declares is namespaced', () => {
    assert.ok(declared.length > 0, 'the stylesheet should declare its variables');

    const bare = declared.filter((name) => !name.startsWith('--game-'));
    assert.deepEqual(bare, [], `rename these to --game-*: ${bare.join(', ')}`);
});

test('every custom property the game uses is one it declares', () => {
    const missing = used.filter((name) => !declared.includes(name));
    assert.deepEqual(missing, [], `these would resolve to nothing: ${missing.join(', ')}`);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/gameStylesheet.test.js`
Expected: `every custom property the game declares is namespaced` FAILS listing 32 names such as `--radius-md, --font-mono`. The second test passes.

- [ ] **Step 3: Rename every game custom property**

Run from the repository root:

```bash
cd /home/govind/Desktop/web-game
python3 - <<'PY'
import re
p = 'frontend/public/css/style.css'
s = open(p).read()
# Longest first, and matched on whole names, so --color-x never eats --color-x-glow.
names = sorted(set(re.findall(r'(?<![\w-])(--[a-zA-Z0-9-]+)\s*:', s)), key=len, reverse=True)
renamed = 0
for name in names:
    if name.startswith('--game-'):
        continue
    s = re.sub(r'(?<![\w-])' + re.escape(name) + r'(?![\w-])', '--game-' + name[2:], s)
    renamed += 1
open(p, 'w').write(s)
print(f'renamed {renamed} custom properties')
PY
```

Expected output: `renamed 32 custom properties`

- [ ] **Step 4: Confirm nothing outside the stylesheet used the old names**

Run: `cd /home/govind/Desktop/web-game/frontend && (grep -rnE "var\(--" index.html public/js/ || echo none)`
Expected: `none`

- [ ] **Step 5: Run the test to verify it passes**

Run (from `backend/`): `node --test tests/gameStylesheet.test.js`
Expected: both tests PASS.

- [ ] **Step 6: Build and prove the game still lays out exactly as before**

Run (from `backend/`):

```bash
cd ../frontend && npx vite build > /tmp/wg-build.log 2>&1; echo "BUILD EXIT $?"; cd ../backend
node --test tests/e2e/tapTolerance.e2e.js tests/e2e/tapZones.e2e.js tests/e2e/tapHaptics.e2e.js
```

Expected: `BUILD EXIT 0`, and every test PASSES. `tapTolerance` asserts the game fits without scrolling, every control is reachable and the corners keep their size on three phone sizes; `tapHaptics` asserts the ritual still opens.

- [ ] **Step 7: Commit**

```bash
cd /home/govind/Desktop/web-game
git add frontend/public/css/style.css backend/tests/gameStylesheet.test.js
git commit -m "refactor(game): namespace the game's CSS variables

Tailwind declares theme variables on :root in a cascade layer that outranks
the game's stylesheet, and 18 of the game's 32 variables shared names with
Tailwind theme namespaces. Every one is now prefixed --game- so no chamber
theme variable can change how the game looks.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

### Task 2: shadcn/ui foundation — alias, `cn()`, tokens, Toaster and Sheet

Verified before writing this task: TypeScript 7.0.2 resolves `paths` without `baseUrl`; Sonner 2.0.8 exports only `Toaster`, `toast` and `useSonner` (there is no exported `ToasterProps` type) and injects an **unlayered** stylesheet at runtime, which outranks every layered Tailwind utility; Radix Dialog 1.1.23's `Portal` accepts `container?: Element | DocumentFragment | null`; tw-animate-css 1.4.0 provides `animate-in`, `animate-out`, `fade-in`, `fade-out`, `slide-in-from-bottom` and `slide-out-to-bottom` and imports as `@import "tw-animate-css"`.

The shadcn radius scale is deliberately **not** mapped in this slice: redefining `--radius-lg`/`--radius-xl` would round every existing corner in the chamber, and look changes belong to Slice 3.

**Files:**
- Create: `backend/tests/cn.test.js`
- Create: `frontend/chamber/lib/utils.ts`
- Create: `frontend/components.json`
- Create: `frontend/chamber/components/ui/sonner.tsx`
- Create: `frontend/chamber/components/ui/sheet.tsx`
- Modify: `frontend/vite.config.ts` (add `resolve.alias`)
- Modify: `frontend/tsconfig.json` (add `paths`)
- Modify: `frontend/chamber/index.css` (tw-animate-css import, `@theme inline`, scoped tokens and border colour)
- Modify: `frontend/package.json`, `frontend/package-lock.json` (via `npm install`)

**Interfaces:**
- Consumes: Task 1 (game variables are `--game-*`, so theme variables may be declared freely)
- Produces:
  - `cn(...inputs: ClassValue[]): string` exported from `frontend/chamber/lib/utils.ts` (import as `@/lib/utils` in components, `../lib/utils` from pure modules)
  - `Toaster(props: ComponentProps<typeof Sonner>)` exported from `@/components/ui/sonner`
  - `Sheet`, `SheetTrigger`, `SheetClose`, `SheetContent`, `SheetTitle`, `SheetDescription` exported from `@/components/ui/sheet`. `SheetContent` requires `container: HTMLElement | null`, renders only as a bottom sheet, and includes a close button labelled `aria-label="Close menu"`
  - Tailwind colour utilities: `bg-background`, `text-foreground`, `bg-popover`, `text-popover-foreground`, `bg-primary`, `text-primary-foreground`, `bg-muted`, `text-muted-foreground`, `border-border`, `ring-ring`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/cn.test.js`:

```js
'use strict';

const { test, before } = require('node:test');
const assert = require('node:assert/strict');

// cn() is TypeScript in the chamber; Node 24 runs it directly.
let cn;

before(async () => {
    ({ cn } = await import('../../frontend/chamber/lib/utils.ts'));
});

test('a later Tailwind class wins over a conflicting earlier one', () => {
    assert.equal(cn('px-2 py-1', 'px-4'), 'py-1 px-4');
});

test('falsy values are dropped', () => {
    assert.equal(cn('a', false, null, undefined, 'b'), 'a b');
});

test('conditional objects are honoured', () => {
    assert.equal(cn('base', { active: true, hidden: false }), 'base active');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `backend/`): `node --test tests/cn.test.js`
Expected: FAIL with `Cannot find module` for `frontend/chamber/lib/utils.ts`.

- [ ] **Step 3: Install the dependencies and write `cn()`**

```bash
cd /home/govind/Desktop/web-game/frontend
npm install sonner@^2.0.8 @radix-ui/react-dialog@^1.1.23 @radix-ui/react-slot@^1.3.3 class-variance-authority@^0.7.1 clsx@^2.1.1 tailwind-merge@^3.7.0 tw-animate-css@^1.4.0
```

Expected: `added … packages` and no `ERESOLVE` error.

Create `frontend/chamber/lib/utils.ts`:

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Joins class names, and lets the later Tailwind class win when two conflict. */
export function cn(...inputs: ClassValue[]): string {
    return twMerge(clsx(inputs));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run (from `backend/`): `node --test tests/cn.test.js`
Expected: all 3 tests PASS.

- [ ] **Step 5: Add the `@` alias to Vite and TypeScript**

In `frontend/vite.config.ts`, add a `resolve` block directly after the `publicDir` line:

```ts
    publicDir: resolve(here, 'public'),
    // shadcn/ui components import from "@/…"; "@" is the chamber source root.
    resolve: {
        alias: { '@': resolve(here, 'chamber') },
    },
```

In `frontend/tsconfig.json`, add this entry inside `compilerOptions` (after `"types": ["vite/client"]`, adding a comma to that line):

```json
    "paths": { "@/*": ["./chamber/*"] }
```

- [ ] **Step 6: Record the shadcn/ui configuration**

Create `frontend/components.json`, so `npx shadcn add <component>` places files correctly in later slices:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "chamber/index.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@/components",
    "ui": "@/components/ui",
    "utils": "@/lib/utils",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

- [ ] **Step 7: Map shadcn's colour tokens onto the chamber palette**

In `frontend/chamber/index.css`, add the animation import directly after the existing utilities import:

```css
@import "tailwindcss/utilities.css" layer(utilities);
@import "tw-animate-css";
```

Directly after the closing `}` of the existing `@theme { … }` block, add:

```css
/**
 * shadcn/ui's colour names, pointed at the chamber's own palette. The values
 * live on .chamber-root (below), so they exist only inside the chamber.
 * The radius scale is left alone on purpose: remapping it would round every
 * existing corner, and the look is Slice 3's job.
 */
@theme inline {
    --color-background: var(--background);
    --color-foreground: var(--foreground);
    --color-popover: var(--popover);
    --color-popover-foreground: var(--popover-foreground);
    --color-primary: var(--primary);
    --color-primary-foreground: var(--primary-foreground);
    --color-muted: var(--muted);
    --color-muted-foreground: var(--muted-foreground);
    --color-border: var(--border);
    --color-ring: var(--ring);
}
```

Inside the existing `@layer base { … }` block, add these two rules before its closing `}`:

```css
    .chamber-root {
        --background: var(--color-ink);
        --foreground: var(--color-chalk);
        --popover: var(--color-velvet);
        --popover-foreground: var(--color-chalk);
        --primary: var(--color-lamp);
        --primary-foreground: var(--color-ink);
        --muted: var(--color-velvet-lifted);
        --muted-foreground: var(--color-dust);
        --border: var(--color-hairline);
        --ring: var(--color-lamp);
    }

    /* Preflight would give every border this colour; it is not loaded
       globally, so the chamber sets it for itself. */
    .chamber-root *,
    .chamber-root ::before,
    .chamber-root ::after {
        border-color: var(--border);
    }
```

- [ ] **Step 8: Add the themed Toaster**

Create `frontend/chamber/components/ui/sonner.tsx`:

```tsx
import type { CSSProperties, ComponentProps } from 'react';
import { Toaster as Sonner } from 'sonner';

/**
 * Toasts, in the chamber's palette.
 *
 * Mount this inside .chamber-root. Sonner ships an unlayered stylesheet, which
 * outranks every layered Tailwind utility, so the colours are set through
 * Sonner's own CSS variables rather than through class names.
 */
export function Toaster(props: ComponentProps<typeof Sonner>) {
    return (
        <Sonner
            theme="dark"
            position="top-center"
            style={
                {
                    fontFamily: 'var(--font-ui)',
                    '--normal-bg': 'var(--popover)',
                    '--normal-text': 'var(--popover-foreground)',
                    '--normal-border': 'var(--border)',
                    '--border-radius': '1rem',
                } as CSSProperties
            }
            {...props}
        />
    );
}
```

- [ ] **Step 9: Add the bottom Sheet**

Create `frontend/chamber/components/ui/sheet.tsx`:

```tsx
import type { ComponentProps } from 'react';
import * as SheetPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * A bottom sheet built on Radix Dialog.
 *
 * Only the bottom side exists, because only the bottom side is used. Content
 * is portaled into `container`, which must be an element inside .chamber-root:
 * portaled to the body it would sit outside the chamber's theme and reset.
 */
export const Sheet = SheetPrimitive.Root;
export const SheetTrigger = SheetPrimitive.Trigger;
export const SheetClose = SheetPrimitive.Close;

export function SheetContent({
    className,
    children,
    container,
    ...props
}: ComponentProps<typeof SheetPrimitive.Content> & { container: HTMLElement | null }) {
    return (
        <SheetPrimitive.Portal container={container}>
            <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=open]:fade-in data-[state=closed]:animate-out data-[state=closed]:fade-out" />
            <SheetPrimitive.Content
                className={cn(
                    'fixed inset-x-0 bottom-0 z-50 flex flex-col gap-2 rounded-t-3xl border-t border-border bg-popover px-4 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-popover-foreground shadow-2xl',
                    'data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom data-[state=open]:duration-300',
                    'data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=closed]:duration-200',
                    className
                )}
                {...props}
            >
                {children}
                <SheetPrimitive.Close
                    aria-label="Close menu"
                    className="absolute top-4 right-4 rounded-full p-1.5 text-muted-foreground transition-colors hover:text-foreground"
                >
                    <X size={16} />
                </SheetPrimitive.Close>
            </SheetPrimitive.Content>
        </SheetPrimitive.Portal>
    );
}

export function SheetTitle({ className, ...props }: ComponentProps<typeof SheetPrimitive.Title>) {
    return <SheetPrimitive.Title className={cn('font-display text-lg text-foreground', className)} {...props} />;
}

export function SheetDescription({ className, ...props }: ComponentProps<typeof SheetPrimitive.Description>) {
    return <SheetPrimitive.Description className={cn('text-sm text-muted-foreground', className)} {...props} />;
}
```

- [ ] **Step 10: Typecheck, build, and prove nothing visible changed**

Start the test databases (see "Commands used throughout"), then run from `backend/`:

```bash
cd ../frontend && npx tsc --noEmit; echo "TSC EXIT $?"
npx vite build > /tmp/wg-build.log 2>&1; echo "BUILD EXIT $?"; cd ../backend
npm test
node --test tests/e2e/tapTolerance.e2e.js tests/e2e/tapZones.e2e.js tests/e2e/tapHaptics.e2e.js tests/e2e/chamber.e2e.js
```

Expected: `TSC EXIT 0`, `BUILD EXIT 0`, all unit tests PASS, and every browser test PASSES. Nothing imports the new components yet, so the game and the chamber must behave exactly as before.

- [ ] **Step 11: Commit**

```bash
cd /home/govind/Desktop/web-game
git add frontend/package.json frontend/package-lock.json frontend/vite.config.ts frontend/tsconfig.json \
  frontend/components.json frontend/chamber/lib/utils.ts frontend/chamber/index.css \
  frontend/chamber/components/ui/sonner.tsx frontend/chamber/components/ui/sheet.tsx backend/tests/cn.test.js
git commit -m "feat(chamber): shadcn/ui foundation — alias, cn, tokens, Toaster, Sheet

Adds the pieces the new navigation and presence toasts are built from, with
nothing visible changing yet. shadcn colour tokens are mapped onto the
chamber's palette and scoped to .chamber-root. Sonner is themed through its
own variables because its stylesheet is unlayered and outranks Tailwind
classes. The Sheet portals into a container inside the chamber so the theme
and scoped reset apply to it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

### Task 3: Presence notifier — decide when to announce arrivals and departures

The server emits `presence:update` `{ username, isOnline, at }` to everyone, including the person who connected, and it emits `isOnline: true` on **every** new connection — a second tab produces a second `true`. It emits `isOnline: false` only when a person's last connection closes. This task turns that raw stream into the two announcements the spec asks for, as pure logic with no DOM, no Socket.IO and no timers of its own, so every rule is unit-testable with a fake clock.

Rules, from the spec:

1. Your own presence events are never announced (names compared case-insensitively).
2. Unknown or offline → online announces `arrived`.
3. Online → online (a second tab) announces nothing.
4. Online → offline announces `left` only after a 5000 ms grace period; coming back online during the grace period cancels it and announces nothing at all.
5. Unknown or offline → offline announces nothing — nobody "leaves" who was never seen here.
6. `seed()` fills in people from the conversations list, but never overrides what a live event already said.
7. `dispose()` cancels any pending `left`.

**Files:**
- Create: `frontend/chamber/presence/presenceNotifier.ts`
- Create: `backend/tests/presenceNotifier.test.js`

**Interfaces:**
- Consumes: nothing
- Produces, from `frontend/chamber/presence/presenceNotifier.ts`:

```ts
export const LEFT_GRACE_MS = 5000;
export type PresenceNotice = { kind: 'arrived' | 'left'; username: string }; // username lowercased
export interface PresenceEntry { username: string; isOnline: boolean }
export interface PresenceNotifierOptions {
    me: string;
    notify: (notice: PresenceNotice) => void;
    graceMs?: number;                                          // defaults to LEFT_GRACE_MS
    schedule?: (callback: () => void, ms: number) => unknown;  // defaults to setTimeout
    cancel?: (handle: unknown) => void;                        // defaults to clearTimeout
}
export interface PresenceNotifier {
    seed(entries: PresenceEntry[]): void;
    handle(update: PresenceEntry): void;
    dispose(): void;
}
export function createPresenceNotifier(options: PresenceNotifierOptions): PresenceNotifier;
```

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/presenceNotifier.test.js`:

```js
'use strict';

const { test, before } = require('node:test');
const assert = require('node:assert/strict');

let createPresenceNotifier;
let LEFT_GRACE_MS;

before(async () => {
    ({ createPresenceNotifier, LEFT_GRACE_MS } = await import('../../frontend/chamber/presence/presenceNotifier.ts'));
});

/** A clock the test moves by hand, so a five second grace costs no real time. */
function fakeClock() {
    let now = 0;
    let nextId = 1;
    const timers = new Map();
    return {
        schedule: (callback, ms) => {
            const id = nextId++;
            timers.set(id, { at: now + ms, callback });
            return id;
        },
        cancel: (id) => {
            timers.delete(id);
        },
        advance(ms) {
            now += ms;
            for (const [id, timer] of [...timers]) {
                if (timer.at <= now) {
                    timers.delete(id);
                    timer.callback();
                }
            }
        },
    };
}

function setup() {
    const clock = fakeClock();
    const notices = [];
    const notifier = createPresenceNotifier({
        me: 'govind',
        notify: (notice) => notices.push(notice),
        schedule: clock.schedule,
        cancel: clock.cancel,
    });
    return { clock, notices, notifier };
}

const online = (username) => ({ username, isOnline: true });
const offline = (username) => ({ username, isOnline: false });

test('the grace period before announcing a departure is five seconds', () => {
    assert.equal(LEFT_GRACE_MS, 5000);
});

test('someone arriving is announced', () => {
    const { notifier, notices } = setup();

    notifier.handle(online('radhe'));

    assert.deepEqual(notices, [{ kind: 'arrived', username: 'radhe' }]);
});

test('your own arrival is never announced, however it is capitalised', () => {
    const { notifier, notices } = setup();

    notifier.handle(online('govind'));
    notifier.handle(online('Govind'));

    assert.deepEqual(notices, []);
});

test('a second tab does not announce them twice', () => {
    const { notifier, notices } = setup();

    notifier.handle(online('radhe'));
    notifier.handle(online('radhe'));

    assert.equal(notices.length, 1, 'the server sends "online" once per connection');
});

test('someone already here when you entered is not announced when they open another tab', () => {
    const { notifier, notices } = setup();

    notifier.seed([online('radhe')]);
    notifier.handle(online('radhe'));

    assert.deepEqual(notices, []);
});

test('leaving is announced only once the grace period has passed', () => {
    const { notifier, notices, clock } = setup();

    notifier.seed([online('radhe')]);
    notifier.handle(offline('radhe'));

    clock.advance(4999);
    assert.deepEqual(notices, [], 'not before five seconds');

    clock.advance(1);
    assert.deepEqual(notices, [{ kind: 'left', username: 'radhe' }]);
});

test('coming back inside the grace period announces nothing at all', () => {
    const { notifier, notices, clock } = setup();

    notifier.seed([online('radhe')]);
    notifier.handle(offline('radhe'));
    clock.advance(2000);
    notifier.handle(online('radhe'));
    clock.advance(10000);

    assert.deepEqual(notices, [], 'a quick app switch must not flash "left" then "is here"');
});

test('coming back after being announced as gone is announced again', () => {
    const { notifier, notices, clock } = setup();

    notifier.seed([online('radhe')]);
    notifier.handle(offline('radhe'));
    clock.advance(5000);
    notifier.handle(online('radhe'));

    assert.deepEqual(notices, [
        { kind: 'left', username: 'radhe' },
        { kind: 'arrived', username: 'radhe' },
    ]);
});

test('someone never seen online going offline is not announced', () => {
    const { notifier, notices, clock } = setup();

    notifier.handle(offline('radhe'));
    clock.advance(10000);

    assert.deepEqual(notices, []);
});

test('a repeated offline during the grace period does not announce twice', () => {
    const { notifier, notices, clock } = setup();

    notifier.seed([online('radhe')]);
    notifier.handle(offline('radhe'));
    notifier.handle(offline('radhe'));
    clock.advance(10000);

    assert.equal(notices.length, 1);
});

test('seeding never overrides what a live event already said', () => {
    const { notifier, notices } = setup();

    notifier.handle(offline('radhe'));       // live: she is offline
    notifier.seed([online('radhe')]);        // a stale list says online
    notifier.handle(online('radhe'));        // she really arrives

    assert.deepEqual(notices, [{ kind: 'arrived', username: 'radhe' }]);
});

test('dispose cancels a departure that was still waiting', () => {
    const { notifier, notices, clock } = setup();

    notifier.seed([online('radhe')]);
    notifier.handle(offline('radhe'));
    notifier.dispose();
    clock.advance(10000);

    assert.deepEqual(notices, []);
});

test('names are compared without regard to capitals', () => {
    const { notifier, notices } = setup();

    notifier.handle(online('Radhe'));
    notifier.handle(online('radhe'));

    assert.deepEqual(notices, [{ kind: 'arrived', username: 'radhe' }]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `backend/`): `node --test tests/presenceNotifier.test.js`
Expected: FAIL with `Cannot find module` for `presenceNotifier.ts`.

- [ ] **Step 3: Write the notifier**

Create `frontend/chamber/presence/presenceNotifier.ts`:

```ts
/**
 * Decides when to tell you that the other person has come in or gone.
 *
 * The server's presence stream is noisier than what a person wants to hear:
 * it reports your own arrival, it reports "online" again for every extra tab,
 * and a phone switching apps for a second reports "offline" then "online".
 * This keeps only the real changes. Pure logic — the caller supplies the
 * timers and decides how a notice is shown.
 */

export const LEFT_GRACE_MS = 5000;

export type PresenceNotice = { kind: 'arrived' | 'left'; username: string };

export interface PresenceEntry {
    username: string;
    isOnline: boolean;
}

export interface PresenceNotifierOptions {
    me: string;
    notify: (notice: PresenceNotice) => void;
    graceMs?: number;
    schedule?: (callback: () => void, ms: number) => unknown;
    cancel?: (handle: unknown) => void;
}

export interface PresenceNotifier {
    seed(entries: PresenceEntry[]): void;
    handle(update: PresenceEntry): void;
    dispose(): void;
}

export function createPresenceNotifier(options: PresenceNotifierOptions): PresenceNotifier {
    const me = options.me.toLowerCase();
    const graceMs = options.graceMs ?? LEFT_GRACE_MS;
    const schedule = options.schedule ?? ((callback: () => void, ms: number) => setTimeout(callback, ms));
    const cancel = options.cancel ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));

    /** Last settled state per person: true online, false offline. */
    const known = new Map<string, boolean>();

    /** A departure waiting out its grace period. */
    const pendingLeave = new Map<string, unknown>();

    function seed(entries: PresenceEntry[]): void {
        for (const entry of entries) {
            const name = entry.username.toLowerCase();
            // A live event is fresher than any list, so it is never overridden.
            if (name === me || known.has(name)) continue;
            known.set(name, entry.isOnline);
        }
    }

    function handle(update: PresenceEntry): void {
        const name = update.username.toLowerCase();
        if (name === me) return;

        if (update.isOnline) {
            // Back within the grace period: the departure never happened.
            if (pendingLeave.has(name)) {
                cancel(pendingLeave.get(name));
                pendingLeave.delete(name);
                known.set(name, true);
                return;
            }

            // Already here — this is another tab, not an arrival.
            if (known.get(name) === true) return;

            known.set(name, true);
            options.notify({ kind: 'arrived', username: name });
            return;
        }

        // Nobody leaves who was never seen here.
        if (known.get(name) !== true) {
            known.set(name, false);
            return;
        }

        if (pendingLeave.has(name)) return;

        pendingLeave.set(
            name,
            schedule(() => {
                pendingLeave.delete(name);
                known.set(name, false);
                options.notify({ kind: 'left', username: name });
            }, graceMs)
        );
    }

    function dispose(): void {
        for (const handleId of pendingLeave.values()) cancel(handleId);
        pendingLeave.clear();
    }

    return { seed, handle, dispose };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `backend/`): `node --test tests/presenceNotifier.test.js`
Expected: all 13 tests PASS.

- [ ] **Step 5: Typecheck the chamber**

Run: `cd ../frontend && npx tsc --noEmit; echo "TSC EXIT $?"; cd ../backend`
Expected: `TSC EXIT 0`

- [ ] **Step 6: Commit**

```bash
cd /home/govind/Desktop/web-game
git add frontend/chamber/presence/presenceNotifier.ts backend/tests/presenceNotifier.test.js
git commit -m "feat(chamber): decide when to announce arrivals and departures

The server's presence stream reports your own arrival, repeats 'online' for
every extra tab, and reports a phone's quick app switch as offline then
online. The notifier keeps only real changes: an arrival, and a departure
that lasts past a five second grace period. Pure and unit tested with a fake
clock; the caller supplies timers and presentation.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

### Task 4: Live presence toasts — "radhe is here" / "radhe left"

Verified before writing this task: Sonner renders each toast as `[data-sonner-toast]` with its text in `[data-title]`, and a toast lives 4000 ms by default. The browser test therefore records every toast the moment it appears (a toast can vanish before a later check) instead of looking afterwards.

**Files:**
- Create: `backend/tests/e2e/support/chamberSession.js`
- Create: `backend/tests/e2e/presence.e2e.js`
- Modify: `frontend/chamber/socket/socketClient.ts` (add `onPresence` callback)
- Modify: `frontend/chamber/app/App.tsx` (create the notifier, seed it, mount `<Toaster />`)
- Modify: `frontend/chamber/features/chat/ConversationList.tsx` (online dot `bg-rose` → `bg-emerald-400`)

**Interfaces:**
- Consumes: `createPresenceNotifier`, `PresenceNotifier` from Task 3; `Toaster` from Task 2
- Produces:
  - `SocketCallbacks.onPresence?: (update: PresencePayload) => void` in `frontend/chamber/socket/socketClient.ts`
  - `createChamberSession({ port, mongoUri, jwtSecret })` exported from `backend/tests/e2e/support/chamberSession.js`, returning `{ BASE, HER, HER_PASSWORD, HIM, HIS_PASSWORD, resetDatabase(), startServer(), stopServer(), enterChamber(page, username, password), connectPerson(username, password) }` — used again by Task 6

- [ ] **Step 1: Create the shared browser-test helper**

The existing `chamber.e2e.js` keeps its own copies of these helpers; this task does not refactor it. Create `backend/tests/e2e/support/chamberSession.js`:

```js
'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const mongoose = require('mongoose');
const { io: connect } = require('socket.io-client');

const HER = 'radhe';
const HER_PASSWORD = 'her-secret-password';
const HIM = 'govind';
const HIS_PASSWORD = 'his-different-password';

/**
 * A real server on its own port and database, plus the steps a person takes to
 * reach the chamber. Each browser test file creates one with a distinct port.
 */
function createChamberSession({ port, mongoUri, jwtSecret }) {
    const BASE = `http://127.0.0.1:${port}`;
    let child = null;

    const env = {
        ...process.env,
        MONGO_URI: mongoUri,
        PORT: String(port),
        JWT_SECRET: jwtSecret,
        MASTER_PASSWORD: 'legacy-master',
        USER_A_NAME: HER,
        USER_A_PASSWORD: HER_PASSWORD,
        USER_B_NAME: HIM,
        USER_B_PASSWORD: HIS_PASSWORD,
        CLOUDINARY_CLOUD_NAME: 'unused',
        CLOUDINARY_API_KEY: 'unused',
        CLOUDINARY_API_SECRET: 'unused',
    };

    async function resetDatabase() {
        await mongoose.connect(mongoUri);
        await mongoose.connection.db.dropDatabase();
        await mongoose.disconnect();
    }

    async function startServer() {
        child = spawn('node', ['server.js'], {
            cwd: path.join(__dirname, '..', '..', '..'),
            env,
            stdio: ['ignore', 'ignore', 'pipe'],
        });
        child.stderr.on('data', (d) => process.stderr.write(`[server:${port}] ${d}`));

        const deadline = Date.now() + 20000;
        while (Date.now() < deadline) {
            try {
                if ((await fetch(`${BASE}/api/health`)).ok) return;
            } catch { /* not up yet */ }
            await new Promise((r) => setTimeout(r, 200));
        }
        throw new Error(`server on ${port} did not become healthy`);
    }

    function stopServer() {
        if (child) child.kill('SIGKILL');
        child = null;
    }

    /** The frozen ritual with real pointer input, the password, and the entrance. */
    async function enterChamber(page, username, password) {
        await page.goto(BASE);
        await page.waitForSelector('#board .cell');

        for (const [zone, times] of [[1, 16], [2, 3], [3, 7]]) {
            const box = await page.locator(`[data-tap="${zone}"]`).boundingBox();
            assert.ok(box, `corner ${zone} should be laid out`);
            for (let i = 0; i < times; i++) {
                await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { delay: 4 });
                await page.waitForTimeout(35);
            }
        }

        await page.waitForSelector('#password-modal.show', { timeout: 4000 });
        await page.fill('#input-username', username);
        await page.fill('#input-password', password);
        await page.click('#btn-submit-password');

        await page.waitForSelector('text=ours', { timeout: 8000 });
        await page.waitForTimeout(1600); // the entrance plays once
    }

    /** Another person, connected over a real socket. */
    async function connectPerson(username, password) {
        const res = await fetch(`${BASE}/api/auth/verify-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });
        const { token } = await res.json();

        const socket = connect(BASE, { auth: { token }, transports: ['websocket'], forceNew: true });
        await new Promise((resolve, reject) => {
            socket.on('connect', resolve);
            socket.on('connect_error', reject);
        });
        return socket;
    }

    return {
        BASE, HER, HER_PASSWORD, HIM, HIS_PASSWORD,
        resetDatabase, startServer, stopServer, enterChamber, connectPerson,
    };
}

module.exports = { createChamberSession };
```

- [ ] **Step 2: Write the failing browser test**

Create `backend/tests/e2e/presence.e2e.js`:

```js
'use strict';

/**
 * Being told, live, when the other person comes into the chamber.
 *
 * The browser is govind; radhe arrives and leaves over real sockets. Every
 * toast is recorded the instant it appears, because a toast lives only four
 * seconds and a later look would miss one.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright-core');

const { isReachable, SKIP_MESSAGE } = require('../integration/requireMongo');
const { createChamberSession } = require('./support/chamberSession');

const CHROME = '/usr/bin/google-chrome';
const DIST = path.join(__dirname, '..', '..', '..', 'frontend', 'dist', 'index.html');
const MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27018/wg_presence_e2e';

const session = createChamberSession({ port: 5085, mongoUri: MONGO_URI, jwtSecret: 'presence-e2e-secret' });
const { HER, HER_PASSWORD, HIM, HIS_PASSWORD } = session;

const ARRIVED = `${HER} is here`;
const LEFT = `${HER} left`;

/** Records the title of every toast as it appears, from the first paint. */
async function openRecordingPage(browser) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();

    await page.addInitScript(() => {
        window.__toasts = [];
        const seen = new WeakSet();
        new MutationObserver(() => {
            document.querySelectorAll('[data-sonner-toast]').forEach((toast) => {
                const title = toast.querySelector('[data-title]');
                if (!title || seen.has(toast)) return;
                seen.add(toast);
                window.__toasts.push(title.textContent.trim());
            });
        }).observe(document, { childList: true, subtree: true, characterData: true });
    });

    return { context, page };
}

const toastsSeen = (page) => page.evaluate(() => window.__toasts.slice());
const countOf = (list, text) => list.filter((t) => t === text).length;

async function waitForToast(page, text, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if ((await toastsSeen(page)).includes(text)) return;
        await page.waitForTimeout(100);
    }
    throw new Error(`no "${text}" toast within ${timeoutMs}ms; saw ${JSON.stringify(await toastsSeen(page))}`);
}

test('live presence toasts', async (t) => {
    if (!(await isReachable(MONGO_URI))) return t.skip(SKIP_MESSAGE);
    if (!fs.existsSync(DIST)) return t.skip('needs a built frontend: cd frontend && npm run build');

    await session.resetDatabase();
    await session.startServer();

    const browser = await chromium.launch({ executablePath: CHROME });
    const sockets = [];
    const pageErrors = [];

    t.after(async () => {
        sockets.forEach((s) => s.close());
        await browser.close();
        session.stopServer();
    });

    const { context, page } = await openRecordingPage(browser);
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await session.enterChamber(page, HIM, HIS_PASSWORD);

    await t.test('your own arrival is never announced', async () => {
        await page.waitForTimeout(1500);
        const seen = await toastsSeen(page);
        assert.ok(!seen.some((text) => text.endsWith('is here')), `saw ${JSON.stringify(seen)}`);
    });

    let firstTab;

    await t.test('someone arriving is announced', async () => {
        firstTab = await session.connectPerson(HER, HER_PASSWORD);
        sockets.push(firstTab);
        await waitForToast(page, ARRIVED, 5000);
        assert.equal(countOf(await toastsSeen(page), ARRIVED), 1);
    });

    await t.test('their online dot turns green', async () => {
        await page.locator('nav button').filter({ hasText: 'messages' }).first().click();
        const dot = page.locator('[aria-label="Online"]').first();
        await dot.waitFor({ timeout: 5000 });
        assert.match(await dot.getAttribute('class'), /bg-emerald-400/);
    });

    let secondTab;

    await t.test('their second tab does not announce them again', async () => {
        secondTab = await session.connectPerson(HER, HER_PASSWORD);
        sockets.push(secondTab);
        await page.waitForTimeout(1500);
        assert.equal(countOf(await toastsSeen(page), ARRIVED), 1, 'the server says "online" once per tab');
    });

    await t.test('closing one of their tabs is not a departure', async () => {
        secondTab.close();
        await page.waitForTimeout(6500);
        assert.equal(countOf(await toastsSeen(page), LEFT), 0);
    });

    await t.test('a quick disconnect and reconnect announces nothing', async () => {
        firstTab.close();
        await page.waitForTimeout(2000);
        firstTab = await session.connectPerson(HER, HER_PASSWORD);
        sockets.push(firstTab);
        await page.waitForTimeout(6500);

        const seen = await toastsSeen(page);
        assert.equal(countOf(seen, LEFT), 0, 'back inside the grace period is not a departure');
        assert.equal(countOf(seen, ARRIVED), 1, 'and not a second arrival either');
    });

    await t.test('leaving is announced, but only after the grace period', async () => {
        firstTab.close();
        await page.waitForTimeout(4000);
        assert.equal(countOf(await toastsSeen(page), LEFT), 0, 'not before five seconds');

        await waitForToast(page, LEFT, 5000);
    });

    await t.test('nothing threw', () => {
        assert.deepEqual(pageErrors, []);
    });

    await context.close();

    await t.test('someone already here when you enter is not announced on their next tab', async () => {
        const alreadyHere = await session.connectPerson(HER, HER_PASSWORD);
        sockets.push(alreadyHere);

        const fresh = await openRecordingPage(browser);
        await session.enterChamber(fresh.page, HIM, HIS_PASSWORD);
        await fresh.page.waitForTimeout(1500); // the conversation list has seeded who is here

        const anotherTab = await session.connectPerson(HER, HER_PASSWORD);
        sockets.push(anotherTab);
        await fresh.page.waitForTimeout(1500);

        assert.equal(countOf(await toastsSeen(fresh.page), ARRIVED), 0);
        await fresh.context.close();
    });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Start the test databases, then run (from `backend/`; the build from Task 2 is current):

Run: `node --test tests/e2e/presence.e2e.js`
Expected: `your own arrival is never announced` PASSES (there are no toasts at all yet); `someone arriving is announced` FAILS with `no "radhe is here" toast within 5000ms`.

- [ ] **Step 4: Forward presence updates from the socket client**

In `frontend/chamber/socket/socketClient.ts`, add the callback to the interface:

```ts
export interface SocketCallbacks {
    onMessage?: (message: Message) => void;
    onRead?: (receipt: ReadReceipt) => void;
    onResync?: () => void;
    onPresence?: (update: PresencePayload) => void;
}
```

and replace the `PRESENCE_UPDATE` handler with:

```ts
    socket.on(EVENTS.PRESENCE_UPDATE, (payload: PresencePayload) => {
        usePresenceStore.getState().setOnline(payload.username, payload.isOnline);
        callbacks.onPresence?.(payload);
    });
```

- [ ] **Step 5: Create the notifier in the chamber and show its notices**

In `frontend/chamber/app/App.tsx`:

Replace the first import line with:

```tsx
import { useEffect, useRef, useState } from 'react';
```

Add these imports after the existing `socketClient` import:

```tsx
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import { createPresenceNotifier, type PresenceNotifier } from '../presence/presenceNotifier';
```

Directly after the line `const { data: today } = useToday();`, add:

```tsx
    const notifierRef = useRef<PresenceNotifier | null>(null);

    // One notifier per visit. It decides; Sonner shows.
    useEffect(() => {
        if (!isInside || !username) return;

        const notifier = createPresenceNotifier({
            me: username,
            notify: ({ kind, username: who }) => {
                if (kind === 'arrived') {
                    toast(`${who} is here`, {
                        icon: <span aria-hidden="true" className="block size-2 rounded-full bg-emerald-400" />,
                    });
                } else {
                    toast(`${who} left`);
                }
            },
        });

        notifierRef.current = notifier;
        return () => {
            notifier.dispose();
            notifierRef.current = null;
        };
    }, [isInside, username]);

    // Whoever is already here when she enters is known, not announced.
    useEffect(() => {
        if (conversations) notifierRef.current?.seed(conversations);
    }, [conversations]);
```

In the existing `setSocketCallbacks({ … })` call, add this entry after `onRead`:

```tsx
            onPresence: (update) => notifierRef.current?.handle(update),
```

Mount the toaster inside the chamber root, directly after `<ConnectionBanner />`:

```tsx
            <ConnectionBanner />
            <Toaster />
```

- [ ] **Step 6: Turn the online dot green**

In `frontend/chamber/features/chat/ConversationList.tsx`, in the element with `aria-label="Online"`, replace `bg-rose` with `bg-emerald-400`.

- [ ] **Step 7: Typecheck, build, and run the presence test**

Run (from `backend/`):

```bash
cd ../frontend && npx tsc --noEmit; echo "TSC EXIT $?"
npx vite build > /tmp/wg-build.log 2>&1; echo "BUILD EXIT $?"; cd ../backend
node --test tests/e2e/presence.e2e.js
```

Expected: `TSC EXIT 0`, `BUILD EXIT 0`, and all 9 subtests PASS.

- [ ] **Step 8: Run the full suite**

Run (from `backend/`): `npm test && npm run test:e2e && npm run test:int`
Expected: every suite passes with 0 failures.

- [ ] **Step 9: Commit**

```bash
cd /home/govind/Desktop/web-game
git add frontend/chamber/socket/socketClient.ts frontend/chamber/app/App.tsx \
  frontend/chamber/features/chat/ConversationList.tsx \
  backend/tests/e2e/support/chamberSession.js backend/tests/e2e/presence.e2e.js
git commit -m "feat(chamber): tell her live when the other person comes in

A toast says 'radhe is here' when the other person arrives and 'radhe left'
when they are still gone after five seconds, and their online dot turns
green. Your own arrival, a second tab, and a quick reconnect all stay quiet.
Proven in a real browser against a real second person over sockets.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

### Task 5: Bottom navigation and the More sheet

Verified before writing this task: lucide-react 1.44.0 exports `House`, `MessageCircle`, `Images`, `Mail`, `Ellipsis`, `BookHeart`, `ListChecks` and the `LucideIcon` type. In `chamber.e2e.js` the string `nav button').filter({ hasText: 'messages' })` occurs twice (lines 168 and 336), so the selector changes below are applied by a script that asserts each exact replacement happens exactly once.

`App.tsx` stops using framer-motion's `motion` in this task (the sliding tab underline goes away). `tsconfig.json` has `noUnusedLocals`, so the import must shrink to `AnimatePresence` here; Task 6 brings `motion` back.

**Files:**
- Create: `frontend/chamber/app/navigation.ts`
- Create: `backend/tests/navigation.test.js`
- Create: `frontend/chamber/app/BottomNav.tsx`
- Create: `frontend/chamber/app/MoreSheet.tsx`
- Modify: `frontend/chamber/app/App.tsx`
- Modify: `backend/tests/e2e/chamber.e2e.js` (lines 167–168, 257, 285, 302, 325, 336, plus one new subtest)
- Modify: `backend/tests/e2e/presence.e2e.js` (the online-dot subtest's navigation step)

**Interfaces:**
- Consumes: `Sheet`, `SheetContent`, `SheetTitle`, `SheetDescription` and `cn` from Task 2; the `presence.e2e.js` file from Task 4
- Produces, from `frontend/chamber/app/navigation.ts`:

```ts
export type Screen = 'today' | 'chat' | 'moments' | 'letters' | 'story' | 'list';
export type Section = 'today' | 'chat' | 'moments' | 'letters' | 'more';
export const SCREENS: ReadonlyArray<Screen>;                                   // today, chat, moments, letters, story, list
export const SECTIONS: ReadonlyArray<{ id: Section; label: string }>;          // labels Today, Chat, Moments, Letters, More
export const MORE_SCREENS: ReadonlyArray<{ id: Screen; label: string }>;       // story → Story, list → List
export function sectionFor(screen: Screen): Section;
export function directionBetween(from: Screen, to: Screen): -1 | 0 | 1;
```

- Produces: `BottomNav({ active: Section; badges: Partial<Record<Section, number>>; onSelect(section: Section): void })` rendering `<nav aria-label="Chamber sections">` with one button per section whose `aria-label` is the section label; `MoreSheet({ open: boolean; onOpenChange(open: boolean): void; container: HTMLElement | null; onSelect(screen: Screen): void })` whose buttons carry `aria-label="Story"` and `aria-label="List"`
- Produces, in `App.tsx`: state `screen: Screen` (replacing `tab`) and `root: HTMLDivElement | null` (the chamber root element) — Task 6 uses both

- [ ] **Step 1: Write the failing unit tests**

Create `backend/tests/navigation.test.js`:

```js
'use strict';

const { test, before } = require('node:test');
const assert = require('node:assert/strict');

let nav;

before(async () => {
    nav = await import('../../frontend/chamber/app/navigation.ts');
});

test('the bottom bar has exactly five sections, in order', () => {
    assert.deepEqual(nav.SECTIONS.map((s) => s.label), ['Today', 'Chat', 'Moments', 'Letters', 'More']);
});

test('More holds Story and List', () => {
    assert.deepEqual(nav.MORE_SCREENS.map((s) => [s.id, s.label]), [['story', 'Story'], ['list', 'List']]);
});

test('the four main screens each light up their own section', () => {
    for (const screen of ['today', 'chat', 'moments', 'letters']) {
        assert.equal(nav.sectionFor(screen), screen);
    }
});

test('Story and List light up More', () => {
    assert.equal(nav.sectionFor('story'), 'more');
    assert.equal(nav.sectionFor('list'), 'more');
});

test('every screen belongs to a section shown in the bar', () => {
    const shown = new Set(nav.SECTIONS.map((s) => s.id));
    for (const screen of nav.SCREENS) {
        assert.ok(shown.has(nav.sectionFor(screen)), `${screen} has nowhere to be highlighted`);
    }
});

test('moving right along the bar slides forward, moving left slides back', () => {
    assert.equal(nav.directionBetween('today', 'chat'), 1);
    assert.equal(nav.directionBetween('letters', 'today'), -1);
    assert.equal(nav.directionBetween('letters', 'story'), 1);
    assert.equal(nav.directionBetween('chat', 'chat'), 0);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `backend/`): `node --test tests/navigation.test.js`
Expected: FAIL with `Cannot find module` for `navigation.ts`.

- [ ] **Step 3: Write the navigation model**

Create `frontend/chamber/app/navigation.ts`:

```ts
/**
 * Where you can be in the chamber, and how that maps onto the bottom bar.
 *
 * Six places, five buttons: Story and List are reached through More, so the
 * bar never scrolls sideways on a phone.
 */

export type Screen = 'today' | 'chat' | 'moments' | 'letters' | 'story' | 'list';
export type Section = 'today' | 'chat' | 'moments' | 'letters' | 'more';

export const SCREENS: ReadonlyArray<Screen> = ['today', 'chat', 'moments', 'letters', 'story', 'list'];

export const SECTIONS: ReadonlyArray<{ id: Section; label: string }> = [
    { id: 'today', label: 'Today' },
    { id: 'chat', label: 'Chat' },
    { id: 'moments', label: 'Moments' },
    { id: 'letters', label: 'Letters' },
    { id: 'more', label: 'More' },
];

export const MORE_SCREENS: ReadonlyArray<{ id: Screen; label: string }> = [
    { id: 'story', label: 'Story' },
    { id: 'list', label: 'List' },
];

export function sectionFor(screen: Screen): Section {
    return screen === 'story' || screen === 'list' ? 'more' : screen;
}

/** Which way the new screen should slide in: by position along the bar. */
export function directionBetween(from: Screen, to: Screen): -1 | 0 | 1 {
    const distance = SCREENS.indexOf(to) - SCREENS.indexOf(from);
    if (distance === 0) return 0;
    return distance > 0 ? 1 : -1;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `backend/`): `node --test tests/navigation.test.js`
Expected: all 6 tests PASS.

- [ ] **Step 5: Point the browser tests at the bottom bar**

Run from the repository root:

```bash
cd /home/govind/Desktop/web-game
python3 - <<'PY'
BAR = "nav[aria-label=\"Chamber sections\"]"

def replace_once(path, old, new):
    s = open(path).read()
    count = s.count(old)
    assert count == 1, f'{path}: expected exactly one match, found {count}:\n{old}'
    open(path, 'w').write(s.replace(old, new))

e2e = 'backend/tests/e2e/chamber.e2e.js'

replace_once(e2e,
"""        // The chamber opens on `today` now, so the conversations live a tab away.
        await page.locator('nav button').filter({ hasText: 'messages' }).first().click();""",
f"""        // The chamber opens on Today, so the conversations are one tap away.
        await page.locator('{BAR} [aria-label="Chat"]').click();""")

replace_once(e2e,
"""        await page.locator('nav button').filter({ hasText: 'today' }).first().click();""",
f"""        await page.locator('{BAR} [aria-label="Today"]').click();""")

replace_once(e2e,
"""        await page.locator('nav button').filter({ hasText: 'letters' }).first().click();""",
f"""        await page.locator('{BAR} [aria-label="Letters"]').click();""")

replace_once(e2e,
"""        await page.locator('nav button').filter({ hasText: 'list' }).first().click();""",
f"""        await page.locator('{BAR} [aria-label="More"]').click();
        await page.locator('[role="dialog"] [aria-label="List"]').click();""")

replace_once(e2e,
"""        await page.locator('nav button').filter({ hasText: 'story' }).first().click();""",
f"""        await page.locator('{BAR} [aria-label="More"]').click();
        await page.locator('[role="dialog"] [aria-label="Story"]').click();""")

replace_once(e2e,
"""    await t.test('leaving puts the game back and re-arms the corners', async () => {
        await page.locator('nav button').filter({ hasText: 'messages' }).first().click();""",
f"""    await t.test('leaving puts the game back and re-arms the corners', async () => {{
        await page.locator('{BAR} [aria-label="Chat"]').click();""")

replace_once(e2e,
"""    await t.test('the other person appears in the conversation list', async () => {""",
f"""    await t.test('the bottom bar offers exactly Today, Chat, Moments, Letters and More', async () => {{
        const labels = await page.locator('{BAR} button').evaluateAll(
            (buttons) => buttons.map((b) => b.getAttribute('aria-label'))
        );
        assert.deepEqual(labels, ['Today', 'Chat', 'Moments', 'Letters', 'More']);
    }});

    await t.test('the other person appears in the conversation list', async () => {{""")

replace_once('backend/tests/e2e/presence.e2e.js',
"""        await page.locator('nav button').filter({ hasText: 'messages' }).first().click();""",
f"""        await page.locator('{BAR} [aria-label="Chat"]').click();""")

print('browser tests now use the bottom bar')
PY
grep -c "nav button" backend/tests/e2e/chamber.e2e.js backend/tests/e2e/presence.e2e.js
```

Expected: `browser tests now use the bottom bar`, then `chamber.e2e.js:0` and `presence.e2e.js:0`.

- [ ] **Step 6: Run the browser test to verify it fails**

Start the test databases, then run (from `backend/`; the build is still the pre-navigation one):

Run: `node --test tests/e2e/chamber.e2e.js`
Expected: `the bottom bar offers exactly Today, Chat, Moments, Letters and More` FAILS (no element matches `nav[aria-label="Chamber sections"]`).

- [ ] **Step 7: Build the bottom bar**

Create `frontend/chamber/app/BottomNav.tsx`:

```tsx
import { motion } from 'framer-motion';
import { Ellipsis, House, Images, Mail, MessageCircle, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { SECTIONS, type Section } from './navigation';

const ICONS: Record<Section, LucideIcon> = {
    today: House,
    chat: MessageCircle,
    moments: Images,
    letters: Mail,
    more: Ellipsis,
};

/**
 * Five places, always in reach of a thumb. Replaces the row of text tabs that
 * scrolled sideways on a phone.
 */
export function BottomNav({
    active,
    badges,
    onSelect,
}: {
    active: Section;
    badges: Partial<Record<Section, number>>;
    onSelect: (section: Section) => void;
}) {
    return (
        <nav
            aria-label="Chamber sections"
            className="shrink-0 border-t border-border bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur"
        >
            <ul className="mx-auto flex max-w-lg">
                {SECTIONS.map(({ id, label }) => {
                    const Icon = ICONS[id];
                    const isActive = active === id;
                    const badge = badges[id] ?? 0;

                    return (
                        <li key={id} className="flex-1">
                            <button
                                type="button"
                                aria-label={label}
                                aria-current={isActive ? 'page' : undefined}
                                onClick={() => onSelect(id)}
                                className={cn(
                                    'relative flex w-full flex-col items-center gap-1 py-2.5 text-[0.68rem] transition-colors',
                                    isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                                )}
                            >
                                {isActive && (
                                    <motion.span
                                        layoutId="bottom-nav-active"
                                        className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-primary"
                                    />
                                )}
                                <span className="relative">
                                    <Icon size={22} strokeWidth={isActive ? 2.2 : 1.8} aria-hidden="true" />
                                    {badge > 0 && (
                                        <span className="absolute -top-1.5 -right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.6rem] font-semibold text-primary-foreground">
                                            {badge}
                                        </span>
                                    )}
                                </span>
                                {label}
                            </button>
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
}
```

- [ ] **Step 8: Build the More sheet**

Create `frontend/chamber/app/MoreSheet.tsx`:

```tsx
import { BookHeart, ListChecks, type LucideIcon } from 'lucide-react';

import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { MORE_SCREENS, type Screen } from './navigation';

const ICONS: Partial<Record<Screen, LucideIcon>> = {
    story: BookHeart,
    list: ListChecks,
};

export function MoreSheet({
    open,
    onOpenChange,
    container,
    onSelect,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    container: HTMLElement | null;
    onSelect: (screen: Screen) => void;
}) {
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent container={container}>
                <SheetTitle>More</SheetTitle>
                <SheetDescription className="sr-only">Other places in the chamber</SheetDescription>

                <ul className="mt-2 flex flex-col gap-1">
                    {MORE_SCREENS.map(({ id, label }) => {
                        const Icon = ICONS[id];

                        return (
                            <li key={id}>
                                <button
                                    type="button"
                                    aria-label={label}
                                    onClick={() => {
                                        onSelect(id);
                                        onOpenChange(false);
                                    }}
                                    className="flex w-full items-center gap-3 rounded-2xl px-3 py-3.5 text-left text-foreground transition-colors hover:bg-muted"
                                >
                                    {Icon && <Icon size={20} className="text-primary" aria-hidden="true" />}
                                    <span className="font-display text-[1.05rem]">{label}</span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </SheetContent>
        </Sheet>
    );
}
```

- [ ] **Step 9: Replace the top tabs with the bottom bar in `App.tsx`**

Apply each replacement to `frontend/chamber/app/App.tsx` (the file as it stands after Task 4):

Replace `import { AnimatePresence, motion } from 'framer-motion';` with:

```tsx
import { AnimatePresence } from 'framer-motion';
```

After the line `import { Bucket } from '../features/bucket/Bucket';` add:

```tsx
import { BottomNav } from './BottomNav';
import { MoreSheet } from './MoreSheet';
import { sectionFor, type Screen, type Section } from './navigation';
```

Delete these two lines:

```tsx
const TABS = ['today', 'messages', 'moments', 'letters', 'story', 'list'] as const;
type Tab = (typeof TABS)[number];
```

Replace `    const [tab, setTab] = useState<Tab>('today');` with:

```tsx
    const [screen, setScreen] = useState<Screen>('today');
    const [moreOpen, setMoreOpen] = useState(false);
    const [root, setRoot] = useState<HTMLDivElement | null>(null);
```

Replace the whole `badgeFor` block:

```tsx
    /** A quiet count beside a word, only when there is something to say. */
    const badgeFor = (name: Tab): number => {
        if (name === 'messages') return today?.unreadMessages ?? 0;
        if (name === 'letters') return today?.unopenedLetters ?? 0;
        return 0;
    };
```

with:

```tsx
    const badges = {
        chat: today?.unreadMessages ?? 0,
        letters: today?.unopenedLetters ?? 0,
    };
```

Replace `        <div className="chamber-root fixed inset-0 z-50 flex flex-col">` with:

```tsx
        <div ref={setRoot} className="chamber-root fixed inset-0 z-50 flex flex-col">
```

Delete the entire top navigation, from the comment `{/* Scrolls sideways on a narrow screen rather than wrapping into a` through its closing `</nav>` (29 lines).

Inside `<main>`, change the screen conditions:

| Before | After |
|---|---|
| `{tab === 'today' && ` | `{screen === 'today' && ` |
| `{tab === 'moments' && ` | `{screen === 'moments' && ` |
| `{tab === 'letters' && ` | `{screen === 'letters' && ` |
| `{tab === 'story' && ` | `{screen === 'story' && ` |
| `{tab === 'list' && ` | `{screen === 'list' && ` |
| `{tab === 'messages' && (` | `{screen === 'chat' && (` |

Directly after `</main>`, add:

```tsx
            <BottomNav
                active={sectionFor(screen)}
                badges={badges}
                onSelect={(section: Section) => {
                    if (section === 'more') {
                        setMoreOpen(true);
                        return;
                    }
                    setScreen(section);
                }}
            />

            <MoreSheet open={moreOpen} onOpenChange={setMoreOpen} container={root} onSelect={setScreen} />
```

- [ ] **Step 10: Typecheck, build, and run the browser tests**

Run (from `backend/`):

```bash
cd ../frontend && npx tsc --noEmit; echo "TSC EXIT $?"
npx vite build > /tmp/wg-build.log 2>&1; echo "BUILD EXIT $?"; cd ../backend
node --test tests/navigation.test.js tests/e2e/chamber.e2e.js tests/e2e/presence.e2e.js
```

Expected: `TSC EXIT 0`, `BUILD EXIT 0`, and every test PASSES, including `the bottom bar offers exactly Today, Chat, Moments, Letters and More` and the List and Story steps that now go through More.

- [ ] **Step 11: Run the full suite**

Run (from `backend/`): `npm test && npm run test:e2e && npm run test:int`
Expected: every suite passes with 0 failures.

- [ ] **Step 12: Commit**

```bash
cd /home/govind/Desktop/web-game
git add frontend/chamber/app/navigation.ts frontend/chamber/app/BottomNav.tsx frontend/chamber/app/MoreSheet.tsx \
  frontend/chamber/app/App.tsx backend/tests/navigation.test.js \
  backend/tests/e2e/chamber.e2e.js backend/tests/e2e/presence.e2e.js
git commit -m "feat(chamber): bottom navigation with a More sheet

Replaces six text tabs that scrolled sideways on a phone with a five-button
bar within reach of a thumb: Today, Chat, Moments, Letters and More, with
Story and List inside More. Unread messages and unopened letters show as
badges. The More sheet portals into the chamber root so it keeps the
chamber's theme.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

### Task 6: Smooth screen changes — slide transitions and prefetched data

Why: every screen fetches its data when it mounts and shows a skeleton until the data arrives, so the first visit to Moments, Letters, Story and List each flashes grey placeholders; and screens swap instantly. Prefetching every screen's data on entry means a tab opened later already has its data, and a Framer Motion stage slides the new screen in from the side of the tab tapped. A conversation's message history is not prefetched: it depends on which person is opened.

Verified before writing this task: `@tanstack/react-query` 5.102.8 exports `queryOptions`; `framer-motion` 13.2.0 exports `AnimatePresence`, `motion`, `useReducedMotion` and the `Variants` type. Screens that render a skeleton while `isLoading`: Today, the Chat conversation list, Moments, Letters, Story, List (and an opened conversation, which is outside this task).

Ordering matters: skeletons get a `data-skeleton` marker **before** the browser test runs, otherwise the test would count zero skeletons because it cannot see them, and pass without proving anything. The test also proves its recorder counts a skeleton before trusting a zero.

**Files:**
- Modify: `frontend/chamber/components/Skeleton.tsx` (add `data-skeleton`)
- Create: `backend/tests/e2e/screens.e2e.js`
- Modify: `frontend/chamber/hooks/useChamber.ts` (export `todayQuery`, `lettersQuery`, `storyQuery`, `bucketQuery`, `questionQuery`)
- Modify: `frontend/chamber/hooks/useConversations.ts` (export `conversationsQuery`)
- Modify: `frontend/chamber/hooks/useMemories.ts` (export `memoriesQuery`)
- Create: `frontend/chamber/app/prefetch.ts`
- Create: `frontend/chamber/app/ScreenStage.tsx`
- Modify: `frontend/chamber/app/App.tsx`

**Interfaces:**
- Consumes: `Screen` and `directionBetween` from Task 5 (`./navigation`); the `screen` / `setScreen` state and `BottomNav` / `MoreSheet` usage in `App.tsx` from Task 5; `createChamberSession` from Task 4
- Produces:
  - `todayQuery()`, `lettersQuery()`, `storyQuery()`, `bucketQuery()`, `questionQuery()` from `hooks/useChamber.ts`; `conversationsQuery()` from `hooks/useConversations.ts`; `memoriesQuery()` from `hooks/useMemories.ts` — each returns `queryOptions({ queryKey, queryFn, staleTime })`
  - `prefetchChamber(queryClient: QueryClient): Promise<void>` from `app/prefetch.ts`
  - `ScreenStage({ screen: Screen; direction: -1 | 0 | 1; children: ReactNode })` from `app/ScreenStage.tsx`

- [ ] **Step 1: Mark skeletons so a test can see them**

In `frontend/chamber/components/Skeleton.tsx`, replace the `Skeleton` function with:

```tsx
export function Skeleton({ className = '' }: { className?: string }) {
    return (
        <div
            data-skeleton=""
            className={`animate-pulse rounded-lg bg-velvet-lifted/70 ${className}`}
            aria-hidden="true"
        />
    );
}
```

- [ ] **Step 2: Write the failing browser test**

Create `backend/tests/e2e/screens.e2e.js`:

```js
'use strict';

/**
 * Moving between screens without anything flashing.
 *
 * Every screen shows a skeleton while its data loads. Each skeleton that
 * appears is counted the instant it is added, because against a local server
 * one lasts only a few milliseconds — far too briefly to catch by looking
 * afterwards.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright-core');

const { isReachable, SKIP_MESSAGE } = require('../integration/requireMongo');
const { createChamberSession } = require('./support/chamberSession');

const CHROME = '/usr/bin/google-chrome';
const DIST = path.join(__dirname, '..', '..', '..', 'frontend', 'dist', 'index.html');
const MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27018/wg_screens_e2e';
const BAR = 'nav[aria-label="Chamber sections"]';

const session = createChamberSession({ port: 5084, mongoUri: MONGO_URI, jwtSecret: 'screens-e2e-secret' });

test('switching screens', async (t) => {
    if (!(await isReachable(MONGO_URI))) return t.skip(SKIP_MESSAGE);
    if (!fs.existsSync(DIST)) return t.skip('needs a built frontend: cd frontend && npm run build');

    await session.resetDatabase();
    await session.startServer();

    const browser = await chromium.launch({ executablePath: CHROME });
    t.after(async () => {
        await browser.close();
        session.stopServer();
    });

    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.addInitScript(() => {
        window.__recording = false;
        window.__skeletons = 0;
        new MutationObserver((mutations) => {
            if (!window.__recording) return;
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType !== 1) continue;
                    if (node.matches('[data-skeleton]')) window.__skeletons += 1;
                    window.__skeletons += node.querySelectorAll('[data-skeleton]').length;
                }
            }
        }).observe(document, { childList: true, subtree: true });
    });

    await session.enterChamber(page, session.HIM, session.HIS_PASSWORD);
    // Today has loaded; the rest of the entry prefetch lands alongside it.
    await page.waitForSelector("text=Today's question", { timeout: 8000 });
    await page.waitForTimeout(1500);

    await t.test('the recorder counts a skeleton when one appears', async () => {
        const counted = await page.evaluate(() => {
            window.__recording = true;
            const probe = document.createElement('div');
            probe.setAttribute('data-skeleton', '');
            document.body.appendChild(probe);
            return new Promise((resolve) => {
                setTimeout(() => {
                    probe.remove();
                    const seen = window.__skeletons;
                    window.__skeletons = 0;
                    resolve(seen);
                }, 50);
            });
        });
        assert.equal(counted, 1, 'without this, the next test could pass by seeing nothing at all');
    });

    await t.test('opening every screen for the first time shows no loading placeholder', async () => {
        const steps = [['Chat'], ['Moments'], ['Letters'], ['More', 'Story'], ['More', 'List'], ['Today']];

        for (const [section, insideMore] of steps) {
            await page.locator(`${BAR} [aria-label="${section}"]`).click();
            if (insideMore) await page.locator(`[role="dialog"] [aria-label="${insideMore}"]`).click();
            await page.waitForTimeout(450); // longer than the slide and the sheet closing
        }

        assert.equal(
            await page.evaluate(() => window.__skeletons),
            0,
            'every screen\'s data should already be there when it opens'
        );
    });

    await t.test('the bar highlights where you are, including inside More', async () => {
        await page.locator(`${BAR} [aria-label="More"]`).click();
        await page.locator('[role="dialog"] [aria-label="Story"]').click();
        await page.waitForTimeout(300);

        assert.equal(await page.locator(`${BAR} [aria-current="page"]`).getAttribute('aria-label'), 'More');
    });

    await t.test('nothing threw', () => {
        assert.deepEqual(pageErrors, []);
    });
});
```

- [ ] **Step 3: Build and run the test to verify it fails**

Start the test databases, then run (from `backend/`):

```bash
cd ../frontend && npx vite build > /tmp/wg-build.log 2>&1; echo "BUILD EXIT $?"; cd ../backend
node --test tests/e2e/screens.e2e.js
```

Expected: `BUILD EXIT 0`; `the recorder counts a skeleton when one appears` PASSES; `opening every screen for the first time shows no loading placeholder` FAILS with a count above 0 (Moments, Letters, Story and List each fetch on first open).

- [ ] **Step 4: Share each screen's query definition**

In `frontend/chamber/hooks/useChamber.ts`, change the first import to:

```ts
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
```

Replace the `useToday`, `useLetters`, `useStory`, `useBucket` and `useQuestion` functions with:

```ts
/**
 * Each screen's query, defined once, so a hook and the entry prefetch fetch
 * exactly the same thing into the same cache entry.
 */
export const todayQuery = () =>
    queryOptions({
        queryKey: todayKey,
        queryFn: () => api.get<{ today: Today }>('/chamber/today').then((r) => r.today),
        staleTime: 30_000,
    });

export const lettersQuery = () =>
    queryOptions({
        queryKey: lettersKey,
        queryFn: () => api.get<{ letters: Letter[]; prompts: string[] }>('/chamber/letters'),
        staleTime: 30_000,
    });

export const storyQuery = () =>
    queryOptions({
        queryKey: storyKey,
        queryFn: () => api.get<{ entries: StoryEntry[] }>('/chamber/story').then((r) => r.entries),
        staleTime: 60_000,
    });

export const bucketQuery = () =>
    queryOptions({
        queryKey: bucketKey,
        queryFn: () => api.get<{ items: BucketItem[] }>('/chamber/bucket').then((r) => r.items),
        staleTime: 30_000,
    });

export const questionQuery = () =>
    queryOptions({
        queryKey: questionKey,
        queryFn: () => api.get<{ question: DailyQuestion }>('/chamber/question').then((r) => r.question),
        staleTime: 60_000,
    });

export function useToday() {
    return useQuery({ ...todayQuery(), enabled: useInside(), refetchOnWindowFocus: true });
}

export function useLetters() {
    return useQuery({ ...lettersQuery(), enabled: useInside() });
}

export function useStory() {
    return useQuery({ ...storyQuery(), enabled: useInside() });
}

export function useBucket() {
    return useQuery({ ...bucketQuery(), enabled: useInside() });
}

export function useQuestion() {
    return useQuery({ ...questionQuery(), enabled: useInside() });
}
```

Leave every `use…` mutation hook in the file unchanged.

In `frontend/chamber/hooks/useConversations.ts`, change the first import to:

```ts
import { queryOptions, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
```

and replace the `useConversations` function with:

```ts
export const conversationsQuery = () =>
    queryOptions({
        queryKey: conversationsKey,
        queryFn: () => api.get<{ conversations: Conversation[] }>('/chat/conversations').then((r) => r.conversations),
        staleTime: 10_000,
    });

export function useConversations() {
    // Hooks run before App's early return, so without `enabled` the chamber
    // would call the API while she is still on the game screen.
    const isInside = useAuthStore((s) => s.isInside);

    // Unread counts come from the server, so refetching on focus keeps them
    // honest when she comes back to the tab.
    return useQuery({ ...conversationsQuery(), enabled: isInside, refetchOnWindowFocus: true });
}
```

In `frontend/chamber/hooks/useMemories.ts`, change the first import to:

```ts
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
```

and replace the `useMemories` function with:

```ts
export const memoriesQuery = () =>
    queryOptions({
        queryKey: memoriesKey,
        queryFn: () => api.get<{ images: Memory[] }>('/gallery').then((r) => r.images),
        staleTime: 30_000,
    });

export function useMemories() {
    const isInside = useAuthStore((s) => s.isInside);
    return useQuery({ ...memoriesQuery(), enabled: isInside });
}
```

- [ ] **Step 5: Prefetch every screen on entry**

Create `frontend/chamber/app/prefetch.ts`:

```ts
import type { QueryClient } from '@tanstack/react-query';

import { bucketQuery, lettersQuery, questionQuery, storyQuery, todayQuery } from '../hooks/useChamber';
import { conversationsQuery } from '../hooks/useConversations';
import { memoriesQuery } from '../hooks/useMemories';

/**
 * Loads every screen's data the moment she enters, so a tab opened later
 * already has something to show instead of a placeholder.
 *
 * A conversation's messages are not included: they depend on which person is
 * opened. prefetchQuery never throws — a screen whose prefetch failed simply
 * fetches again when it is opened.
 */
export async function prefetchChamber(queryClient: QueryClient): Promise<void> {
    await Promise.all([
        queryClient.prefetchQuery(todayQuery()),
        queryClient.prefetchQuery(questionQuery()),
        queryClient.prefetchQuery(conversationsQuery()),
        queryClient.prefetchQuery(memoriesQuery()),
        queryClient.prefetchQuery(lettersQuery()),
        queryClient.prefetchQuery(storyQuery()),
        queryClient.prefetchQuery(bucketQuery()),
    ]);
}
```

- [ ] **Step 6: Build the sliding stage**

Create `frontend/chamber/app/ScreenStage.tsx`:

```tsx
import type { ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'framer-motion';

import type { Screen } from './navigation';

/** How far a screen travels as it arrives: a nudge, not a page turn. */
const DISTANCE = 24;

const variants: Variants = {
    enter: (distance: number) => ({ x: distance, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (distance: number) => ({ x: -distance, opacity: 0 }),
};

/**
 * Slides the new screen in from the side of the tab that was tapped, while the
 * old one slides out the other way. `custom` is passed to AnimatePresence as
 * well as the child so the leaving screen uses the new direction, not the one
 * it arrived with. With reduced motion on, screens only fade.
 */
export function ScreenStage({
    screen,
    direction,
    children,
}: {
    screen: Screen;
    direction: -1 | 0 | 1;
    children: ReactNode;
}) {
    const reduceMotion = useReducedMotion();
    const distance = reduceMotion ? 0 : direction * DISTANCE;

    return (
        <AnimatePresence initial={false} custom={distance}>
            <motion.div
                key={screen}
                custom={distance}
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
                className="absolute inset-0 flex min-h-0 flex-col"
            >
                {children}
            </motion.div>
        </AnimatePresence>
    );
}
```

- [ ] **Step 7: Use the stage and the prefetch in `App.tsx`**

Apply each change to `frontend/chamber/app/App.tsx` (the file as it stands after Task 5):

Replace `import { sectionFor, type Screen, type Section } from './navigation';` with:

```tsx
import { directionBetween, sectionFor, type Screen, type Section } from './navigation';
import { ScreenStage } from './ScreenStage';
import { prefetchChamber } from './prefetch';
```

Directly after the line `const [root, setRoot] = useState<HTMLDivElement | null>(null);`, add:

```tsx
    const [direction, setDirection] = useState<-1 | 0 | 1>(0);
```

Directly after the effect that seeds the notifier (the one ending `}, [conversations]);`), add:

```tsx
    // Every screen's data loads on entry, so no tab opens onto a placeholder.
    useEffect(() => {
        if (isInside && token) void prefetchChamber(queryClient);
    }, [isInside, token, queryClient]);
```

Directly after the `badges` object, add:

```tsx
    /** Moves to a screen, sliding from the side of the tab that was tapped. */
    const go = (next: Screen) => {
        setDirection(directionBetween(screen, next));
        setScreen(next);
    };
```

Replace `<main className="flex min-h-0 flex-1 flex-col">` with:

```tsx
            <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
                <ScreenStage screen={screen} direction={direction}>
```

and replace the matching closing `</main>` with:

```tsx
                </ScreenStage>
            </main>
```

In the `<BottomNav … onSelect>` handler, replace `setScreen(section);` with `go(section);`.

In `<MoreSheet … />`, replace `onSelect={setScreen}` with `onSelect={go}`.

- [ ] **Step 8: Typecheck, build, and run the browser tests**

Run (from `backend/`):

```bash
cd ../frontend && npx tsc --noEmit; echo "TSC EXIT $?"
npx vite build > /tmp/wg-build.log 2>&1; echo "BUILD EXIT $?"; cd ../backend
node --test tests/e2e/screens.e2e.js tests/e2e/chamber.e2e.js tests/e2e/presence.e2e.js
```

Expected: `TSC EXIT 0`, `BUILD EXIT 0`, and every test PASSES — `opening every screen for the first time shows no loading placeholder` now counts 0.

- [ ] **Step 9: Run the full suite**

Run (from `backend/`): `npm test && npm run test:e2e && npm run test:int`
Expected: every suite passes with 0 failures.

- [ ] **Step 10: Commit**

```bash
cd /home/govind/Desktop/web-game
git add frontend/chamber/components/Skeleton.tsx frontend/chamber/hooks/useChamber.ts \
  frontend/chamber/hooks/useConversations.ts frontend/chamber/hooks/useMemories.ts \
  frontend/chamber/app/prefetch.ts frontend/chamber/app/ScreenStage.tsx frontend/chamber/app/App.tsx \
  backend/tests/e2e/screens.e2e.js
git commit -m "feat(chamber): screens slide in, and never open onto a placeholder

Every screen's data is prefetched the moment she enters, from the same query
definitions the screens use, so opening Moments, Letters, Story or List no
longer flashes a loading skeleton. Screens slide in from the side of the tab
tapped, and only fade when reduced motion is on. A browser test counts every
skeleton as it appears and first proves it can see one.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

### Task 7: Final verification and README

Why: each earlier task ran the suite, but only on its own change. This task checks the whole slice together by looking at it on a phone-sized screen. A test cannot tell whether the bar hides content, whether a toast lands under the bar, or whether the sheet lost the chamber's colours. It also checks that the game screen still looks exactly as it did, because Task 1 renamed every game CSS variable.

**Files:**
- Modify: `README.md` (the `chamber/` part of the Layout block)
- Create (not committed): `/tmp/wg-shots.js`

**Interfaces:**
- Consumes: `createChamberSession` from Task 4 (`backend/tests/e2e/support/chamberSession.js`); the bar `nav[aria-label="Chamber sections"]` and the sheet `[role="dialog"]` from Task 5
- Produces: nothing new in code

- [ ] **Step 1: Update the README layout**

In `README.md`, replace these lines of the Layout block:

```
  chamber/              React + TypeScript + Tailwind
    app/                shell and the entrance
    features/chat/      conversations, messages, composer
    features/memories/  photos
    stores/             Zustand: auth, chat, presence
    hooks/              TanStack Query: conversations, messages, memories
    socket/             the realtime client and the protocol names
    utils/time.ts       day labels and clock times
```

with:

```
  chamber/              React + TypeScript + Tailwind + shadcn/ui
    app/                shell, entrance, bottom bar, More sheet
      navigation.ts     pure: screens, their bar section, slide direction
      ScreenStage.tsx   slides and fades between screens
      prefetch.ts       loads every screen's data on entry
    components/ui/      shadcn/ui components, themed to the chamber
    lib/utils.ts        cn(): merges Tailwind classes
    presence/           pure: when to say "is here" and "left"
    features/           chat, memories, today, letters, story, bucket
    stores/             Zustand: auth, chat, presence
    hooks/              TanStack Query: every screen's data
    socket/             the realtime client and the protocol names
    utils/time.ts       day labels and clock times
```

- [ ] **Step 2: Capture the slice on a phone-sized screen**

Start the test databases, then build (from `frontend/`):

```bash
npx vite build > /tmp/wg-build.log 2>&1; echo "BUILD EXIT $?"
```

Expected: `BUILD EXIT 0`.

Create `/tmp/wg-shots.js`:

```js
'use strict';

// One-off: photographs the slice so a person can look at it. Not a test.
const path = require('node:path');
const backend = '/home/govind/Desktop/web-game/backend';
const { chromium } = require(path.join(backend, 'node_modules', 'playwright-core'));
const { createChamberSession } = require(path.join(backend, 'tests/e2e/support/chamberSession'));

const session = createChamberSession({
    port: 5086,
    mongoUri: 'mongodb://127.0.0.1:27018/wg_shots',
    jwtSecret: 'shots-secret',
});
const BAR = 'nav[aria-label="Chamber sections"]';

(async () => {
    await session.resetDatabase();
    await session.startServer();
    const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })).newPage();

    await page.goto(session.BASE);
    await page.waitForSelector('#board .cell');
    await page.waitForTimeout(800);
    await page.screenshot({ path: '/tmp/wg-shot-1-game.png' });

    await session.enterChamber(page, session.HIM, session.HIS_PASSWORD);
    await page.waitForSelector("text=Today's question", { timeout: 8000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: '/tmp/wg-shot-2-today.png' });

    await session.connectPerson(session.HER, session.HER_PASSWORD);
    await page.waitForSelector('[data-sonner-toast]', { timeout: 5000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: '/tmp/wg-shot-3-toast.png' });

    await page.locator(`${BAR} [aria-label="Chat"]`).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: '/tmp/wg-shot-4-chat.png' });

    await page.locator(`${BAR} [aria-label="More"]`).click();
    await page.waitForSelector('[role="dialog"]');
    await page.waitForTimeout(500);
    await page.screenshot({ path: '/tmp/wg-shot-5-more.png' });

    await browser.close();
    session.stopServer();
    process.exit(0);
})().catch((error) => {
    console.error(error);
    session.stopServer();
    process.exit(1);
});
```

Run: `node /tmp/wg-shots.js; echo "SHOTS EXIT $?"`
Expected: `SHOTS EXIT 0`, and five files `/tmp/wg-shot-1-game.png` … `/tmp/wg-shot-5-more.png`.

- [ ] **Step 3: Look at every screenshot**

Open each image and check each point. Fix anything that fails and go back to Step 2.

| Shot | Must be true |
|---|---|
| 1 game | Identical to before the slice: same colours, board, buttons; no white or unstyled areas (a missed variable rename shows up here) |
| 2 today | Five labelled buttons along the bottom, Today highlighted; the last card is not hidden behind the bar; no top tab row |
| 3 toast | A toast reading "radhe is here" (or the seeded peer's name) with a green dot, in the chamber's dark colours, not covering the bar |
| 4 chat | Conversation list fills the space above the bar; the online dot next to her name is green |
| 5 more | A dark sheet rising from the bottom with Story and List; the chamber is dimmed behind it, not white |

- [ ] **Step 4: Run the full suite one last time**

Run (from `backend/`): `npm test && npm run test:e2e && npm run test:int`
Expected: every suite passes with 0 failures. The count is higher than the 238 before this slice. It includes `tapHaptics.e2e.js` and `tapTolerance.e2e.js` unchanged and passing, which proves the ritual still works.

- [ ] **Step 5: Commit**

```bash
cd /home/govind/Desktop/web-game
git add README.md
git commit -m "docs: layout for the chamber's navigation, presence and ui components

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```
