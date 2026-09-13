/**
 * One rule for "online", used everywhere it is shown.
 *
 * A live socket update always wins, even a live `false` — someone who just
 * left should not keep reading as online because a stale `true` is still
 * sitting in the conversations list. The stored value (from the
 * conversations API) is only a fallback, for when no `presence:update` has
 * arrived yet this session.
 */
export function isPeerOnline(live: boolean | undefined, stored: boolean | undefined): boolean {
    return live ?? stored ?? false;
}
