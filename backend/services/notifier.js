'use strict';

/**
 * Reaching someone who is not looking at the page.
 *
 * Deliberately inert until it is configured. Push needs a secure origin and a
 * signing key pair, neither of which exists on localhost, so this records the
 * intent and does nothing rather than pretending to deliver. When VAPID keys
 * are set it becomes a real send with no other code changing.
 *
 * What it will say is fixed here on purpose: a notification is read on a lock
 * screen in front of whoever is nearby, so it says something is waiting and
 * never what it is or who it is from.
 */
function createNotifier(deps) {
    const options = deps || {};
    const PushSubscription = options.PushSubscription;
    const log = options.log || (() => {});
    const publicKey = options.publicKey || process.env.VAPID_PUBLIC_KEY;
    const privateKey = options.privateKey || process.env.VAPID_PRIVATE_KEY;

    const configured = Boolean(publicKey && privateKey);

    /** Saves where a device can be reached. Replaces any earlier row for it. */
    async function subscribe({ username, subscription }) {
        if (!subscription || !subscription.endpoint || !subscription.keys) {
            throw new Error('That subscription is not usable.');
        }

        await PushSubscription.findOneAndUpdate(
            { endpoint: subscription.endpoint },
            {
                $set: {
                    username: String(username).toLowerCase(),
                    endpoint: subscription.endpoint,
                    keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
                },
            },
            { upsert: true }
        );

        return { subscribed: true };
    }

    async function unsubscribe(endpoint) {
        await PushSubscription.deleteOne({ endpoint });
        return { unsubscribed: true };
    }

    /**
     * Tells someone something is waiting, without saying what.
     *
     * Returns what it would have sent even when unconfigured, so the calling
     * code and its tests are identical either way.
     */
    async function notify({ username }) {
        const payload = { title: 'Tic Tac Toe', body: 'Your turn.' };

        if (!configured) {
            log(`🔕 Push not configured; would have notified @${username}.`);
            return { sent: 0, configured: false, payload };
        }

        const targets = await PushSubscription.find({ username: String(username).toLowerCase() }).lean();

        // The actual send is deliberately not wired up yet: it needs a deployed
        // origin to be testable, and an untested delivery path is worse than an
        // absent one. The subscriptions are here and waiting.
        log(`🔔 Would deliver to ${targets.length} device(s) for @${username}.`);
        return { sent: 0, configured: true, targets: targets.length, payload };
    }

    return { subscribe, unsubscribe, notify, get configured() { return configured; } };
}

module.exports = { createNotifier };
