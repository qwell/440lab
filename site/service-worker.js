const CACHE_NAME = '440lab-v2';
const UNCACHED_AUDIO_ASSET_PATTERN = /\.(?:mid|midi|sf2|sf3)(?:\.js)?$/iu;

const APP_SHELL = [
    './',
    './index.html',

    './assets/css/tools.css',
    './assets/css/base.css',
    './assets/css/layout.css',
    './assets/css/controls.css',
    './assets/css/practice.css',

    './assets/js/index.js',
    './assets/js/music.js',
    './assets/js/notation.js',
    './assets/js/engine.js',
    './assets/js/practice.js',
    './assets/js/render.js',
    './assets/js/dom.js',
    './assets/js/application.js',

    './assets/fonts/NotoMusic-Regular.ttf',

    './assets/images/logo-dark-192x192.png',
    './assets/images/logo-dark-512x512.png',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches
            .open(CACHE_NAME)
            .then((cache) => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((names) =>
                Promise.all(
                    names
                        .filter((name) => name !== CACHE_NAME)
                        .map((name) => caches.delete(name))
                )
            )
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') {
        return;
    }

    const url = new URL(event.request.url);

    if (url.origin !== self.location.origin) {
        return;
    }

    if (UNCACHED_AUDIO_ASSET_PATTERN.test(url.pathname)) {
        return;
    }

    event.respondWith(
        (async () => {
            let response;

            try {
                response = await fetch(event.request);
            } catch {
                const cached = await caches.match(event.request);

                if (cached) {
                    return cached;
                }

                if (event.request.mode === 'navigate') {
                    return caches.match('./index.html');
                }

                throw new Error('Resource unavailable offline');
            }

            if (response.ok) {
                try {
                    const copy = response.clone();
                    const cache = await caches.open(CACHE_NAME);

                    await cache.put(event.request, copy);
                } catch (error) {
                    console.warn('Unable to update the offline cache.', error);
                }
            }

            return response;
        })()
    );
});
