/*
 * Push-Nachrichten im Service Worker. vite-plugin-pwa lädt diese Datei per `importScripts` in den generierten
 * sw.js (vite.config.ts). Der Server schickt { title, body, tag } – siehe public/push/lib.php.
 */
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Habit Stacks', {
      body: data.body || '',
      // Gleicher Turm → die neue Nachricht ersetzt die alte.
      tag: data.tag || 'habit-stacks',
      icon: '/icon-192.png',
      data: { url: '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const open = windows[0]
      if (open) return open.focus()
      return self.clients.openWindow(event.notification.data?.url || '/')
    })(),
  )
})
