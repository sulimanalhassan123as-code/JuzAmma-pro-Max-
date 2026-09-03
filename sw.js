// ============================================================
// Juz Amma Pro — Service Worker
// Version: 3.0 — Now with background Azan alarm support
// Strategy: Cache-first for assets, Network-first for Quran API
// ============================================================

const CACHE_NAME = 'juzamma-pro-v69-20260903101322';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192x192.svg',
  './icons/icon-512x512.svg',
  'https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Poppins:wght@300;400;500;600;700;800&display=swap'
];

// ── Azan Alarm State (persists in SW) ──────────────────────
let swAzanEnabled = false;
let swPrayerTimes = {};
let swAzanCheckInterval = null;
let swLastAzanFired = {};
let swSelectedAzan = 'makkah';

// ── Install: pre-cache static assets ──────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('[SW] Pre-cache partial failure (OK):', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: clean old caches ─────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Background Azan Alarm Engine ───────────────────────────
function startSwAzanWatch() {
  if (swAzanCheckInterval) clearInterval(swAzanCheckInterval);
  swAzanCheckInterval = setInterval(() => {
    if (!swAzanEnabled || !swPrayerTimes.Fajr) return;
    const now = new Date();
    const hhmm = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
    const prayers = ['Fajr','Dhuhr','Asr','Maghrib','Isha'];
    prayers.forEach(p => {
      const pt = swPrayerTimes[p];
      if (pt && pt === hhmm) {
        const key = p + '-' + hhmm;
        if (!swLastAzanFired[key]) {
          swLastAzanFired[key] = true;
          fireAzanNotification(p);
          setTimeout(() => { delete swLastAzanFired[key]; }, 70000);
        }
      }
    });
  }, 30000);
}

function fireAzanNotification(prayerName) {
  const arabicNames = {Fajr:'الفجر',Dhuhr:'الظهر',Asr:'العصر',Maghrib:'المغرب',Isha:'العشاء'};
  self.registration.showNotification('🕌 Azan — ' + prayerName + ' Prayer', {
    body: 'Hayya ala al-Salah — Come to Prayer\n' + (arabicNames[prayerName] || ''),
    icon: './icons/icon-192x192.svg',
    badge: './icons/icon-192x192.svg',
    tag: 'azan-' + prayerName,
    requireInteraction: true,
    vibrate: [500, 200, 500, 200, 500],
    actions: [
      { action: 'play', title: '🔊 Play Azan' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  });
  self.clients.matchAll({ type: 'window' }).then(clients => {
    clients.forEach(client => client.postMessage({ type: 'AZAN_TIME', prayer: prayerName }));
  });
}

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'play') {
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then(clients => {
        if (clients.length > 0) { clients[0].postMessage({ type: 'AZAN_TIME', prayer: 'Notification' }); clients[0].focus(); }
        else { self.clients.openWindow('./'); }
      })
    );
  } else {
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then(clients => {
        if (clients.length > 0) clients[0].focus();
        else self.clients.openWindow('./');
      })
    );
  }
});

// ── Message handler from main thread ──────────────────────
self.addEventListener('message', event => {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data.type === 'GET_VERSION') {
    event.source.postMessage({ type: 'SW_VERSION', version: CACHE_NAME });
  }
  if (event.data.type === 'AZAN_ENABLE') {
    swAzanEnabled = true;
    swPrayerTimes = event.data.prayerTimes || swPrayerTimes;
    swSelectedAzan = event.data.selectedAzan || swSelectedAzan;
    startSwAzanWatch();
  }
  if (event.data.type === 'AZAN_DISABLE') {
    swAzanEnabled = false;
    if (swAzanCheckInterval) { clearInterval(swAzanCheckInterval); swAzanCheckInterval = null; }
  }
  if (event.data.type === 'AZAN_UPDATE_TIMES') {
    swPrayerTimes = event.data.prayerTimes || {};
  }
  if (event.data.type === 'AZAN_UPDATE_VOICE') {
    swSelectedAzan = event.data.selectedAzan || swSelectedAzan;
  }
});

// ── Periodic Background Sync ────────────────────────────────
self.addEventListener('periodicsync', event => {
  if (event.tag === 'azan-check') {
    event.waitUntil(new Promise(resolve => {
      if (swAzanEnabled && swPrayerTimes.Fajr) {
        const now = new Date();
        const hhmm = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
        const prayers = ['Fajr','Dhuhr','Asr','Maghrib','Isha'];
        prayers.forEach(p => {
          if (swPrayerTimes[p] === hhmm) {
            const key = p + '-' + hhmm;
            if (!swLastAzanFired[key]) {
              swLastAzanFired[key] = true;
              fireAzanNotification(p);
              setTimeout(() => { delete swLastAzanFired[key]; }, 70000);
            }
          }
        });
      }
      resolve();
    }));
  }
});

// ── Fetch: smart routing ───────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.hostname === 'api.alquran.cloud' || url.hostname === 'everyayah.com') {
    event.respondWith(
      fetch(event.request).then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      }).catch(() => caches.match(event.request))
    );
    return;
  }
  if (url.hostname === 'api.aladhan.com') {
    event.respondWith(
      fetch(event.request).then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      }).catch(() => caches.match(event.request))
    );
    return;
  }
  if (url.hostname === 'praytimes.org') {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.match(event.request).then(cached => {
        return cached || fetch(event.request).then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        });
      })
    );
    return;
  }
  if (event.request.mode === 'navigate' || (event.request.destination === 'document') || (url.pathname === '/' || url.pathname.endsWith('.html'))) {
    event.respondWith(
      fetch(event.request).then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        // Notify all clients that fresh content was served
        self.clients.matchAll({ type: 'window' }).then(clients => {
          clients.forEach(c => c.postMessage({ type: 'CONTENT_UPDATED' }));
        });
        return response;
      }).catch(() => caches.match(event.request).then(c => c || caches.match('./index.html')))
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
