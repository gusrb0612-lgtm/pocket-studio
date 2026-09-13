// 앱 껍데기를 캐시해서 비행기 모드에서도 열리게 한다.
// 파일을 고쳤으면 CACHE 버전을 올린다 — 안 올리면 폰이 옛날 파일을 계속 본다.
const CACHE = 'pocket-studio-v1';
const SHELL = [
  '.', 'index.html', 'app.css', 'app.js', 'music.js', 'audio.js', 'wav.js',
  'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'
];

// GitHub Pages 는 Cache-Control: max-age=600 을 붙인다. 그냥 fetch 하면
// 브라우저 HTTP 캐시가 10분 묵은 파일을 돌려줘서, 서비스 워커를 새로 깔아도
// 페이지는 구버전으로 뜬다. 네트워크로 갈 때는 항상 HTTP 캐시를 건너뛴다.
const fresh = url => fetch(url, { cache: 'reload' });

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(SHELL.map(u => fresh(u).then(r => { if (r.ok) return c.put(u, r); }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fresh(req.url)
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); }
        return res;
      })
      .catch(() => caches.match(req).then(hit => hit || caches.match('index.html')))
  );
});
