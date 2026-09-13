/**
 * Service worker.
 *
 * Two rules govern everything here.
 *
 * One: the app shell is cached so the game opens instantly and works with no
 * signal. That is the part anyone may see.
 *
 * Two: nothing from /api is ever cached. Those responses are her messages, her
 * photographs and her letters, and a cache entry is a copy of them sitting on
 * disk, readable by anyone who later has the device. Code may be cached.
 * Content may not.
 */

// Bumped from v1 when the caching strategy changed, so a phone still holding the
// v1 cache — which may contain stale copies of the game's scripts — drops it.
const VERSION = 'v2';
const SHELL_CACHE = `shell-${VERSION}`;

// Only what is needed to render the game with no network.
const SHELL = ['/', '/index.html', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(SHELL_CACHE)
            .then((cache) => cache.addAll(SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((names) => Promise.all(
                names.filter((name) => name !== SHELL_CACHE).map((name) => caches.delete(name))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    // Her data never touches the cache, online or off.
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/')) return;

    // A navigation falls back to the cached shell when there is no signal, so
    // she gets the game rather than the browser's offline page. Each successful
    // load refreshes that copy, so offline she gets the last release she had.
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    remember('/index.html', response);
                    return response;
                })
                .catch(() => caches.match('/index.html').then((r) => r || Response.error()))
        );
        return;
    }

    // The React bundle lives under /assets/ with a content hash in every file
    // name, so a cached copy is always the right one and can be served at once.
    if (url.pathname.startsWith('/assets/')) {
        event.respondWith(cacheFirst(request));
        return;
    }

    // Everything else keeps its name from one release to the next — the game's
    // scripts, its stylesheet, the icons. Serving those cache-first meant a phone
    // that had visited once would never load a fix to the corners again. So:
    // the network whenever there is signal, and the cache only when there is not.
    event.respondWith(networkFirst(request));
});

function cacheable(response) {
    return Boolean(response) && response.status === 200 && response.type === 'basic';
}

/** Keeps a copy for offline use. The clone is taken before the body is read. */
function remember(key, response) {
    if (!cacheable(response)) return;

    const copy = response.clone();
    caches.open(SHELL_CACHE).then((cache) => cache.put(key, copy));
}

function cacheFirst(request) {
    return caches.match(request).then((cached) => {
        if (cached) return cached;

        return fetch(request).then((response) => {
            remember(request, response);
            return response;
        });
    });
}

function networkFirst(request) {
    return fetch(request)
        .then((response) => {
            remember(request, response);
            return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || Response.error()));
}

/**
 * Push notifications.
 *
 * Kept deliberately vague: a notification is read on a lock screen, in front of
 * whoever happens to be nearby, so it says that something is waiting and never
 * what it is or who it is from.
 */
self.addEventListener('push', (event) => {
    let payload = {};
    try {
        payload = event.data ? event.data.json() : {};
    } catch { /* a malformed push still gets the neutral notification */ }

    event.waitUntil(
        self.registration.showNotification(payload.title || 'Tic Tac Toe', {
            body: payload.body || 'Your turn.',
            icon: '/icons/icon-192.png',
            badge: '/icons/icon-192.png',
            tag: 'chamber',
        })
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
            const open = clients.find((client) => client.url.includes(self.location.origin));
            if (open) return open.focus();
            return self.clients.openWindow('/');
        })
    );
});
