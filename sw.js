/* Sổ Công Trình — service worker v4 (tăng tốc)
   - Trang app + ảnh (cùng gốc): mở NGAY bằng bản đã lưu trên máy, đồng thời tải bản mới ở nền.
     Nếu trang có bản mới → báo cho app hiện thanh "Đã có bản cập nhật mới · Tải lại".
   - Thư viện Chart.js (cdnjs) + phông chữ Google: lưu trên máy, dùng lại mãi (địa chỉ có số phiên bản).
   - Dữ liệu (script.google.com), ảnh Drive: KHÔNG đụng tới — luôn đi mạng như cũ, không bao giờ dùng dữ liệu cũ. */
const SHELL_CACHE = 'sct-shell-v4';
const LIB_CACHE = 'sct-lib-v1';
const KEEP = [SHELL_CACHE, LIB_CACHE];
const LIB_HOSTS = ['cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(['/'])).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => KEEP.indexOf(k) === -1).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function sameBody(a, b) {
  const ea = a.headers.get('etag'), eb = b.headers.get('etag');
  if (ea && eb) return Promise.resolve(ea === eb);
  return Promise.all([a.clone().text(), b.clone().text()]).then((t) => t[0] === t[1]);
}

function notifyUpdate() {
  self.clients.matchAll({ type: 'window' }).then((list) => list.forEach((c) => c.postMessage({ type: 'sct-update' })));
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // thư viện / phông chữ: có trên máy thì dùng luôn, chưa có thì tải 1 lần rồi lưu
  if (LIB_HOSTS.indexOf(url.hostname) !== -1) {
    e.respondWith(caches.open(LIB_CACHE).then((cache) =>
      cache.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
        return res;
      }))
    ));
    return;
  }
  if (url.origin !== location.origin) return; // dữ liệu Google Sheets/Drive... → mạng bình thường
  if (url.pathname === '/sw.js') return;

  const isPage = req.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html';
  const key = isPage ? '/' : req;
  e.respondWith(caches.open(SHELL_CACHE).then((cache) =>
    cache.match(key, { ignoreSearch: isPage }).then((cached) => {
      const network = fetch(req, isPage ? { cache: 'no-cache' } : undefined).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          if (isPage && cached) {
            // so với bản đang lưu (mở lại từ cache — bản "cached" đã trả cho trang nên không đọc lại được)
            cache.match(key, { ignoreSearch: true })
              .then((old) => (old ? sameBody(old, res.clone()) : true))
              .catch(() => true)
              .then((same) => cache.put(key, copy).then(() => { if (!same) notifyUpdate(); }));
          } else {
            cache.put(key, copy);
          }
        }
        return res;
      });
      if (cached) { e.waitUntil(network.catch(() => {})); return cached; }
      return network.catch(() => caches.match('/'));
    })
  ));
});
