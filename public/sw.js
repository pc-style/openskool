// openskool service worker: the app shell works offline, and audio shared to the installed app
// waits in a cache until the Library imports it. Registered in production builds only (src/App.tsx).

const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev'
const SHELL = `openskool-shell-${VERSION}`
const SHARE = 'openskool-share' // read by importShared() in src/lib/library.ts
const STATIC = ['/', '/manifest.webmanifest', '/favicon.svg', '/icon-192.png', '/icon-512.png', '/icon-maskable-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL)
      let built = []
      try {
        built = (await (await fetch('/sw-assets.json', { cache: 'no-store' })).json()).files
      } catch {
        // no asset list: the hashed files are cached as they are first used instead
      }
      await cache.addAll([...STATIC, ...built])
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== SHELL && key !== SHARE) await caches.delete(key)
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // Web Share Target: keep the files, then open the Library, which imports them
  if (req.method === 'POST' && url.pathname === '/library') {
    event.respondWith(
      (async () => {
        const form = await req.formData()
        const cache = await caches.open(SHARE)
        const files = form.getAll('audio').filter((f) => f instanceof File)
        await Promise.all(
          files.map((f, i) =>
            cache.put(
              `/shared/${Date.now()}-${i}`,
              new Response(f, { headers: { 'content-type': f.type || 'application/octet-stream', 'x-filename': encodeURIComponent(f.name) } }),
            ),
          ),
        )
        return Response.redirect('/#/library?shared=1', 303)
      })(),
    )
    return
  }
  if (req.method !== 'GET') return

  // pages: the network first, so a new build shows up; the cached shell when offline
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        let res
        try {
          res = await fetch(req)
          if (res.ok && url.pathname === '/') (await caches.open(SHELL)).put('/', res.clone())
          if (res.ok) return res
        } catch {
          // offline
        }
        return (await caches.match('/')) || res || Response.error()
      })(),
    )
    return
  }

  // hashed build files never change: the cache first
  if (url.pathname.startsWith('/assets/') || STATIC.includes(url.pathname)) {
    event.respondWith(
      (async () => {
        const hit = await caches.match(req)
        if (hit) return hit
        const res = await fetch(req)
        if (res.ok) (await caches.open(SHELL)).put(req, res.clone())
        return res
      })(),
    )
  }
})
