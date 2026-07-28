/**
 * service-worker.js
 * ─────────────────────────────────────────────────────────────
 * استراتژی کش:
 *   • HTML  → Network-First   (تا آپدیت بازی فوراً به همه برسد)
 *     اگر HTML را cache-first کنیم، بازیکنان با دو نسخه‌ی متفاوت بازی می‌کنند
 *     و این در یک بازی چندنفره یک باگ کشنده است.
 *   • CSS / JS / آیکون / فونت → Cache-First (سریع و کم‌مصرف)
 *   • Firebase / Auth / Firestore → Bypass کامل، هرگز کش نمی‌شوند
 * ─────────────────────────────────────────────────────────────
 */

const CACHE_VERSION = "bluff-v1.0.0";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

/** فایل‌هایی که هنگام نصب پیش‌کش می‌شوند (همه با مسیر نسبی). */
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./login.html",
  "./lobby.html",
  "./room.html",
  "./game.html",
  "./profile.html",
  "./css/style.css",
  "./css/responsive.css",
  "./js/firebase-config.js",
  "./js/firebase-auth.js",
  "./js/database.js",
  "./js/room.js",
  "./js/game-engine.js",
  "./js/ui.js",
  "./js/questions.js",
  "./js/security.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png"
];

/** دامنه‌هایی که هرگز نباید کش شوند. */
const BYPASS_HOSTS = [
  "firestore.googleapis.com",
  "firebaseio.com",
  "identitytoolkit.googleapis.com",
  "securetoken.googleapis.com",
  "firebaseinstallations.googleapis.com",
  "firebaseappcheck.googleapis.com",
  "googleapis.com",
  "google.com",
  "gstatic.com"
];

/* ═══════════════ نصب ═══════════════ */

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    // addAll اتمیک است؛ اگر یک فایل ۴۰۴ بدهد کل نصب می‌شکند.
    // بنابراین تک‌تک و با تحمل خطا کش می‌کنیم.
    await Promise.all(PRECACHE_URLS.map(async (url) => {
      try {
        const res = await fetch(new Request(url, { cache: "reload" }));
        if (res.ok) await cache.put(url, res);
      } catch { /* آفلاین یا فایل موجود نیست */ }
    }));
  })());
});

/* ═══════════════ فعال‌سازی و پاکسازی ═══════════════ */

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((k) => !k.startsWith(CACHE_VERSION))
      .map((k) => caches.delete(k)));

    if (self.registration.navigationPreload) {
      await self.registration.navigationPreload.enable().catch(() => {});
    }
    await self.clients.claim();
  })());
});

/* ═══════════════ پیام‌ها ═══════════════ */

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

/* ═══════════════ کمکی‌ها ═══════════════ */

function shouldBypass(url) {
  return BYPASS_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`));
}

function isHtmlRequest(request) {
  if (request.mode === "navigate") return true;
  const accept = request.headers.get("accept") || "";
  return accept.includes("text/html");
}

/** پاسخ آفلاین وقتی هیچ نسخه‌ی کش‌شده‌ای نداریم. */
function offlineFallback() {
  const html = `<!DOCTYPE html><html lang="fa" dir="rtl"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>آفلاین — Bluff / Bid</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#07070d;color:#f0f0f5;
       font-family:system-ui,Tahoma,sans-serif;text-align:center;padding:24px;direction:rtl}
  .box{max-width:420px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);
       border-radius:22px;padding:32px}
  h1{font-size:1.4rem;margin:0 0 12px}
  p{color:rgba(240,240,245,.55);line-height:1.9;margin:0 0 20px}
  a{display:inline-block;padding:14px 28px;border-radius:999px;background:#7c5cff;color:#fff;
    text-decoration:none;font-weight:700}
</style></head><body><div class="box">
<h1>اینترنت وصل نیست</h1>
<p>برای بازی آنلاین به اتصال اینترنت نیاز داری. وقتی وصل شدی دوباره تلاش کن.</p>
<a href="./index.html">تلاش دوباره</a>
</div></body></html>`;
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
}

/* ═══════════════ Fetch ═══════════════ */

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  let url;
  try { url = new URL(request.url); } catch { return; }

  // درخواست‌های فایربیس و احراز هویت هرگز از سرویس‌ورکر رد نمی‌شوند
  if (shouldBypass(url)) return;
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  /* ── HTML: Network-First ── */
  if (isHtmlRequest(request)) {
    event.respondWith((async () => {
      try {
        const preload = await event.preloadResponse;
        const fresh = preload || await fetch(request);
        if (fresh && fresh.ok) {
          const cache = await caches.open(STATIC_CACHE);
          cache.put(request, fresh.clone()).catch(() => {});
        }
        return fresh;
      } catch {
        const cached = await caches.match(request, { ignoreSearch: true });
        return cached || (await caches.match("./index.html")) || offlineFallback();
      }
    })());
    return;
  }

  /* ── دارایی‌های ایستا: Cache-First ── */
  event.respondWith((async () => {
    const cached = await caches.match(request, { ignoreSearch: false });
    if (cached) {
      // به‌روزرسانی بی‌صدا در پس‌زمینه (stale-while-revalidate سبک)
      fetch(request).then((res) => {
        if (res && res.ok) caches.open(STATIC_CACHE).then((c) => c.put(request, res.clone()));
      }).catch(() => {});
      return cached;
    }
    try {
      const res = await fetch(request);
      if (res && res.ok && (url.origin === self.location.origin || request.destination === "font")) {
        const cache = await caches.open(RUNTIME_CACHE);
        cache.put(request, res.clone()).catch(() => {});
      }
      return res;
    } catch {
      if (request.destination === "document") return offlineFallback();
      return new Response("", { status: 504, statusText: "offline" });
    }
  })());
});
