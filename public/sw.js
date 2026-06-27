// Dummy service worker to resolve 404 errors from Clerk or browser caching.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', () => {
  // Optional: Get a list of all the current open windows/clients
  // and force them to refresh or claim them.
});
