/**
 * Decides when to tell you that the other person has come in or gone.
 *
 * The server's presence stream is noisier than what a person wants to hear:
 * it reports your own arrival, it reports "online" again for every extra tab,
 * and a phone switching apps for a second reports "offline" then "online".
 * This keeps only the real changes. Pure logic — the caller supplies the
 * timers and decides how a notice is shown.
 *
 * Two kinds of knowledge feed it. A list (the conversations API, or who the
 * server says is online as a connection opens) says who is here without
 * announcing anyone, and a newer list replaces what an older one said. A live
 * event is fresher than any list, so no list overrides it — until `reset()`,
 * when a new connection opens and what the old one heard may no longer be
 * true.
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
    /** Who a list says is here. Announces nothing. */
    seed(entries: PresenceEntry[]): void;
    /** A live presence update. */
    handle(update: PresenceEntry): void;
    /** A new connection: the next list may correct whatever the old one heard live. */
    reset(): void;
    dispose(): void;
}

export function createPresenceNotifier(options: PresenceNotifierOptions): PresenceNotifier {
    const me = options.me.toLowerCase();
    const graceMs = options.graceMs ?? LEFT_GRACE_MS;
    const schedule = options.schedule ?? ((callback: () => void, ms: number) => setTimeout(callback, ms));
    const cancel = options.cancel ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));

    /** Last settled state per person: true online, false offline. */
    const known = new Map<string, boolean>();

    /** Everyone a live event has spoken for since the last reset. */
    const heardLive = new Set<string>();

    /** A departure waiting out its grace period. */
    const pendingLeave = new Map<string, unknown>();

    function seed(entries: PresenceEntry[]): void {
        for (const entry of entries) {
            const name = entry.username.toLowerCase();
            // A live event is fresher than any list, so it is never overridden.
            if (name === me || heardLive.has(name)) continue;

            // Listed as here while a departure is still waiting: they came back
            // while the connection was away, so the departure never happened.
            if (entry.isOnline && pendingLeave.has(name)) {
                cancel(pendingLeave.get(name));
                pendingLeave.delete(name);
            }

            known.set(name, entry.isOnline);
        }
    }

    function handle(update: PresenceEntry): void {
        const name = update.username.toLowerCase();
        if (name === me) return;

        heardLive.add(name);

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

    function reset(): void {
        heardLive.clear();
    }

    function dispose(): void {
        for (const handleId of pendingLeave.values()) cancel(handleId);
        pendingLeave.clear();
    }

    return { seed, handle, reset, dispose };
}
