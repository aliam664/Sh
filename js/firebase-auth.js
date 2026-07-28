/**
 * js/firebase-auth.js
 * ─────────────────────────────────────────────────────────────
 * نقش: Firebase Architect
 * راه‌اندازی اپ فایربیس، ورود ناشناس، مدیریت پروفایل کاربر و گاردهای مسیریابی.
 * تمام صفحات از همین فایل بوت می‌شوند.
 * ─────────────────────────────────────────────────────────────
 */

import {
  firebaseConfig, isConfigFilled, FIREBASE_SDK_VERSION, RECAPTCHA_SITE_KEY
} from "./firebase-config.js";
import { log, sanitizeUsername, isValidUsername, generateAvatarSeed, store, setClockOffset } from "./security.js";

const CDN = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;

let app = null;
let auth = null;
let db = null;
let fs = null;    // ماژول firestore
let authMod = null;
let bootPromise = null;

/* ═══════════════ صفحه‌ی خطای راهنما ═══════════════ */

function renderConfigError(message, hint) {
  document.documentElement.setAttribute("dir", "rtl");
  const wrap = document.createElement("div");
  wrap.className = "config-error";
  const box = document.createElement("div");
  box.className = "config-error__box";

  const h = document.createElement("h1");
  h.textContent = "پیکربندی Firebase انجام نشده";
  const p = document.createElement("p");
  p.textContent = message;
  const pre = document.createElement("pre");
  pre.textContent = hint;

  box.append(h, p, pre);
  wrap.append(box);
  document.body.replaceChildren(wrap);
}

const CONFIG_HINT = `۱) به console.firebase.google.com برو و یک پروژه بساز
۲) Build → Authentication → Sign-in method → Anonymous را فعال کن
۳) Build → Firestore Database → Create database
۴) Project settings → Your apps → Web app → کپی کردن firebaseConfig
۵) مقادیر را در فایل js/firebase-config.js جای‌گذاری کن
۶) firestore.rules را Deploy کن
۷) دامنه‌ی <user>.github.io را به Authorized Domains اضافه کن`;

/* ═══════════════ بوت اپ ═══════════════ */

/**
 * ماژول‌های فایربیس را از CDN بارگذاری و اپ را می‌سازد.
 * offline persistence با persistentLocalCache + multi-tab فعال می‌شود.
 */
async function boot() {
  if (!isConfigFilled()) {
    renderConfigError("فایل js/firebase-config.js هنوز پر نشده است.", CONFIG_HINT);
    throw new Error("firebase-config-missing");
  }

  const [appMod, aMod, fMod] = await Promise.all([
    import(`${CDN}/firebase-app.js`),
    import(`${CDN}/firebase-auth.js`),
    import(`${CDN}/firebase-firestore.js`)
  ]);

  authMod = aMod;
  fs = fMod;
  app = appMod.initializeApp(firebaseConfig);

  // App Check اختیاری — اگر کلید reCAPTCHA داده شده باشد
  if (RECAPTCHA_SITE_KEY) {
    try {
      const ac = await import(`${CDN}/firebase-app-check.js`);
      ac.initializeAppCheck(app, {
        provider: new ac.ReCaptchaV3Provider(RECAPTCHA_SITE_KEY),
        isTokenAutoRefreshEnabled: true
      });
    } catch (e) { log.warn("App Check init failed", e); }
  }

  auth = authMod.getAuth(app);
  await authMod.setPersistence(auth, authMod.browserLocalPersistence).catch((e) => log.warn(e));

  try {
    db = fs.initializeFirestore(app, {
      localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() })
    });
  } catch (e) {
    // مرورگرهایی که IndexedDB ندارند (مثلاً حالت خصوصی قدیمی سافاری)
    log.warn("persistent cache unavailable, falling back to memory", e);
    db = fs.getFirestore(app);
  }

  return { app, auth, db, fs, authMod };
}

/** بوت تک‌نمونه‌ای (idempotent). */
export function initFirebase() {
  if (!bootPromise) bootPromise = boot();
  return bootPromise;
}

export function getFs()   { return fs; }
export function getDb()   { return db; }
export function getAuthInstance() { return auth; }

/* ═══════════════ ورود ناشناس ═══════════════ */

/** منتظر می‌ماند تا وضعیت احراز هویت مشخص شود. */
export function waitForAuth() {
  return new Promise((resolve, reject) => {
    const unsub = authMod.onAuthStateChanged(auth, (user) => { unsub(); resolve(user); }, reject);
  });
}

/**
 * ورود ناشناس. اگر session قبلی وجود داشته باشد همان برگردانده می‌شود.
 * محدودیت شناخته‌شده: Safari ITP بعد از ۷ روز بی‌فعالیتی هویت را پاک می‌کند.
 */
export async function ensureSignedIn() {
  await initFirebase();
  let user = await waitForAuth();
  if (!user) {
    const cred = await authMod.signInAnonymously(auth);
    user = cred.user;
  }
  return user;
}

export async function signOutUser() {
  await initFirebase();
  await authMod.signOut(auth);
  store.del("activeRoomId");
  store.del("profile");
}

/* ═══════════════ پروفایل کاربر ═══════════════ */

function userRef(uid) { return fs.doc(db, "users", uid); }

/** خواندن پروفایل از Firestore. null یعنی هنوز نام انتخاب نکرده. */
export async function fetchProfile(uid) {
  await initFirebase();
  const snap = await fs.getDoc(userRef(uid));
  if (!snap.exists()) return null;
  const data = snap.data();
  if (!data || !data.username) return null;
  store.set("profile", { userId: uid, username: data.username, avatarSeed: data.avatarSeed || "" });
  return { userId: uid, ...data };
}

export const EMPTY_STATS = Object.freeze({
  gamesPlayed: 0, wins: 0, totalScore: 0,
  successfulBluffs: 0, caughtBluffs: 0, roundsWon: 0
});

/** ساخت یا به‌روزرسانی پروفایل با نام انتخابی کاربر. */
export async function saveProfile(uid, rawName, avatarSeed) {
  await initFirebase();
  const username = sanitizeUsername(rawName);
  if (!isValidUsername(username)) throw new Error("invalid-username");

  const ref = userRef(uid);
  const snap = await fs.getDoc(ref);
  const seed = avatarSeed || generateAvatarSeed();

  if (snap.exists()) {
    await fs.updateDoc(ref, {
      username,
      avatarSeed: seed,
      lastSeen: fs.serverTimestamp()
    });
  } else {
    await fs.setDoc(ref, {
      userId: uid,
      username,
      avatarSeed: seed,
      joinTime: fs.serverTimestamp(),
      lastSeen: fs.serverTimestamp(),
      stats: { ...EMPTY_STATS }
    });
  }
  store.set("profile", { userId: uid, username, avatarSeed: seed });
  return { userId: uid, username, avatarSeed: seed };
}

/** ثبت آخرین بازدید + کالیبراسیون ساعت (سرور در برابر گوشی). */
export async function touchLastSeen(uid) {
  await initFirebase();
  const localBefore = Date.now();
  try {
    await fs.updateDoc(userRef(uid), { lastSeen: fs.serverTimestamp() });
    const snap = await fs.getDoc(userRef(uid));
    const ts = snap.data()?.lastSeen;
    if (ts && typeof ts.toMillis === "function") {
      setClockOffset(ts.toMillis(), (localBefore + Date.now()) / 2);
    }
  } catch (e) { log.warn("touchLastSeen", e); }
}

/**
 * به‌روزرسانی آمار کلی کاربر پس از پایان بازی.
 * با increment انجام می‌شود تا نیازی به خواندن قبلی نباشد.
 */
export async function bumpStats(uid, delta) {
  await initFirebase();
  const patch = {};
  for (const [k, v] of Object.entries(delta)) {
    if (!(k in EMPTY_STATS) || !Number.isFinite(v)) continue;
    patch[`stats.${k}`] = fs.increment(v);
  }
  if (!Object.keys(patch).length) return;
  patch.lastSeen = fs.serverTimestamp();
  await fs.updateDoc(userRef(uid), patch).catch((e) => log.warn("bumpStats", e));
}

/* ═══════════════ گارد صفحات ═══════════════ */

/**
 * بوت استاندارد هر صفحه:
 *  - requireProfile: اگر نام نداشته باشد به login.html می‌فرستد
 * خروجی: { user, profile }
 */
export async function pageGuard({ requireProfile = true } = {}) {
  const user = await ensureSignedIn();
  const profile = await fetchProfile(user.uid);
  if (requireProfile && !profile) {
    location.replace("./login.html");
    throw new Error("redirect-login");
  }
  return { user, profile };
}
