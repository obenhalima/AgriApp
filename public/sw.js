/* No page/API cache: confidential business data and decisions always stay online. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data?.json() || {}; } catch {}
  event.waitUntil(self.registration.showNotification('FarmPilot', {
    body: data.body || 'Une demande nécessite votre attention.',
    icon: '/pwa/icon-192.png', badge: '/pwa/icon-192.png', tag: data.tag || 'farmpilot',
    data: { url: '/validations' }
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow('/validations'));
});
