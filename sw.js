/**
 * QLBH - Service Worker
 * Caches static assets for offline-first experience
 */

const CACHE_VERSION = 'qlbh-v1.0.0';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;

// Assets to cache immediately on install
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/styles.css',
    '/editable-cells.css',
    '/config.js',
    '/sheets-api.js',
    '/db.js',
    '/sync.js',
    '/products.js',
    '/sales.js',
    '/transactions.js',
    '/debt.js',
    '/reports.js',
    '/chart.js',
    '/export.js',
    '/telegram.js',
    '/app.js',
    '/inline-edit.js',
    '/migration.js',
    '/manifest.json',
    '/favicon.png',
    '/icons/icon-192x192.png',
    '/icons/icon-512x512.png'
];

// External resources to cache on first use
const EXTERNAL_CACHE_URLS = [
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
    'https://cdn.jsdelivr.net/npm/chart.js',
    'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js'
];

/**
 * Install event — cache static assets
 */
self.addEventListener('install', (event) => {
    console.log('[SW] Installing...');
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then(cache => {
                console.log('[SW] Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => self.skipWaiting())
            .catch(err => {
                console.warn('[SW] Some static assets failed to cache:', err);
                // Don't fail install if some assets missing
                return self.skipWaiting();
            })
    );
});

/**
 * Activate event — clean up old caches
 */
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating...');
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys
                    .filter(key => key !== STATIC_CACHE && key !== DYNAMIC_CACHE)
                    .map(key => {
                        console.log('[SW] Removing old cache:', key);
                        return caches.delete(key);
                    })
            );
        }).then(() => self.clients.claim())
    );
});

/**
 * Fetch event — serve from cache, fallback to network
 * Strategy: Cache-First for static, Network-First for API
 */
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== 'GET') return;

    // Skip Google API calls (auth, sheets) — always network
    if (url.hostname.includes('googleapis.com') ||
        url.hostname.includes('accounts.google.com') ||
        url.hostname.includes('gstatic.com') ||
        url.hostname.includes('api.telegram.org')) {
        return;
    }

    // For external CDN resources — cache first, fallback to network
    if (EXTERNAL_CACHE_URLS.some(u => request.url.startsWith(u))) {
        event.respondWith(
            caches.match(request).then(cached => {
                if (cached) return cached;
                return fetch(request).then(response => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(DYNAMIC_CACHE).then(cache => cache.put(request, clone));
                    }
                    return response;
                });
            })
        );
        return;
    }

    // For local assets — stale-while-revalidate
    // Serve cache immediately, update cache in background
    if (url.origin === self.location.origin) {
        event.respondWith(
            caches.match(request).then(cached => {
                const networkFetch = fetch(request).then(response => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(STATIC_CACHE).then(cache => cache.put(request, clone));
                    }
                    return response;
                }).catch(() => {
                    // Network failed, return cached or offline fallback
                    return cached || new Response('Offline', { status: 503 });
                });

                // Return cached version immediately if available, update in background
                return cached || networkFetch;
            })
        );
        return;
    }
});

/**
 * Background sync — push pending changes when back online
 */
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-changes') {
        console.log('[SW] Background sync triggered');
        // The SyncEngine in the main thread handles actual sync
        // This just ensures the app wakes up to process the queue
        event.waitUntil(
            self.clients.matchAll().then(clients => {
                clients.forEach(client => {
                    client.postMessage({ type: 'SYNC_REQUESTED' });
                });
            })
        );
    }
});

/**
 * Push notification support (for future Telegram-like notifications)
 */
self.addEventListener('push', (event) => {
    if (!event.data) return;

    const data = event.data.json();
    const options = {
        body: data.body || '',
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-192x192.png',
        vibrate: [100, 50, 100],
        data: { url: data.url || '/' }
    };

    event.waitUntil(
        self.registration.showNotification(data.title || 'QLBH', options)
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = event.notification.data?.url || '/';
    event.waitUntil(
        self.clients.matchAll({ type: 'window' }).then(clients => {
            // Focus existing window if any
            for (const client of clients) {
                if (client.url.includes(url) && 'focus' in client) {
                    return client.focus();
                }
            }
            // Open new window
            return self.clients.openWindow(url);
        })
    );
});
