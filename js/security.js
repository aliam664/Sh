/**
 * js/security.js
 * ─────────────────────────────────────────────────────────────
 * نقش: Security Engineer
 * وظایف: پاکسازی ورودی، محدودسازی نرخ (rate limit)، همگام‌سازی ساعت،
 *        گاردهای مسیریابی، لاگر قابل خاموش‌شدن.
 * این فایل هیچ وابستگی به Firebase ندارد تا در همه‌ی صفحات سبک بارگذاری شود.
 * ─────────────────────────────────────────────────────────────
 */

import { DEBUG } from "./firebase-config.js";

/* ═══════════════ لاگر ═══════════════ */

export const log = {
  debug: (...a) => { if (DEBUG) console.log("%c[bluff]", "color:#7c5cff", ...a); },
  warn:  (...a) => { if (DEBUG) console.warn("[bluff]", ...a); },
  error: (...a) => { console.error("[bluff]", ...a); }
};

/* ═══════════════ ثابت‌ها ═══════════════ */

export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH   = 6;
export const USERNAME_MIN       = 2;
export const USERNAME_MAX       = 16;
export const MIN_BID_INTERVAL_MS = 700;   // حداقل فاصله بین دو کنش شبکه‌ای کاربر
export const PRESENCE_HEARTBEAT_MS = 15000;
export const PRESENCE_TIMEOUT_MS   = 40000;

const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\uFEFF]/g;

/* ═══════════════ پاکسازی ورودی ═══════════════ */

/**
 * پاکسازی عمومی متن کاربر: حذف تگ HTML، کاراکترهای کنترلی و فاصله‌ی اضافه.
 * توجه: خروجی این تابع هم هرگز با innerHTML درج نمی‌شود؛ همیشه textContent.
 */
export function sanitizeText(input, maxLen = 120) {
  if (typeof input !== "string") return "";
  return input
    .replace(/<[^>]*>/g, " ")      // حذف تگ‌ها
    .replace(/[<>]/g, "")          // باقی‌مانده‌ی براکت‌ها
    .replace(CONTROL_CHARS, "")    // کاراکترهای نامرئی/کنترلی/جهت‌دهی
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

/** پاکسازی نام کاربری با قواعد بخش ۵ سند. */
export function sanitizeUsername(input) {
  const clean = sanitizeText(input, USERNAME_MAX);
  return clean.slice(0, USERNAME_MAX);
}

export function isValidUsername(name) {
  return typeof name === "string" &&
    name.length >= USERNAME_MIN &&
    name.length <= USERNAME_MAX;
}

/** فیلتر و بزرگ‌سازی کد اتاق. */
export function sanitizeRoomCode(input) {
  if (typeof input !== "string") return "";
  return input
    .toUpperCase()
    .split("")
    .filter((c) => ROOM_CODE_ALPHABET.includes(c))
    .join("")
    .slice(0, ROOM_CODE_LENGTH);
}

export function isValidRoomCode(code) {
  return typeof code === "string" &&
    code.length === ROOM_CODE_LENGTH &&
    [...code].every((c) => ROOM_CODE_ALPHABET.includes(c));
}

/** تولید کد اتاق با crypto (بدون سوگیری قابل توجه). */
export function generateRoomCode() {
  const bytes = new Uint32Array(ROOM_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    out += ROOM_CODE_ALPHABET[bytes[i] % ROOM_CODE_ALPHABET.length];
  }
  return out;
}

/** دانه‌ی آواتار: عددی پایدار برای تولید رنگ. */
export function generateAvatarSeed() {
  const b = new Uint32Array(2);
  crypto.getRandomValues(b);
  return `${b[0].toString(36)}${b[1].toString(36)}`.slice(0, 10);
}

/* ═══════════════ نرمال‌سازی فارسی (برای اعتبارسنجی جواب) ═══════════════ */

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS  = "٠١٢٣٤٥٦٧٨٩";
const DIACRITICS = /[\u064B-\u0652\u0670\u0640]/g; // اعراب و کشیده

/**
 * نرمال‌سازی متن فارسی/عربی/لاتین برای مقایسه‌ی جواب‌ها.
 * یکسان‌سازی ی/ي، ک/ك، حذف نیم‌فاصله، اعراب، ارقام فارسی → لاتین.
 */
export function normalizeAnswer(text) {
  if (typeof text !== "string") return "";
  let s = text.trim().toLowerCase();
  s = s.replace(CONTROL_CHARS, "");
  s = s.replace(/[يى]/g, "ی").replace(/[كک]/g, "ک");
  s = s.replace(/[أإآا]/g, "ا").replace(/[ۀةه]/g, "ه").replace(/ؤ/g, "و");
  s = s.replace(DIACRITICS, "");
  s = s.replace(/\u200c/g, "");          // نیم‌فاصله
  s = s.replace(/[.,،؛;:!?؟'"«»\-_/\\()[\]]/g, " ");
  s = [...s].map((ch) => {
    const p = PERSIAN_DIGITS.indexOf(ch);
    if (p > -1) return String(p);
    const a = ARABIC_DIGITS.indexOf(ch);
    if (a > -1) return String(a);
    return ch;
  }).join("");
  return s.replace(/\s+/g, " ").trim();
}

/** فاصله‌ی لِوِنشتاین با کوتاه‌سازی زودهنگام (سقف = limit). */
export function levenshtein(a, b, limit = 2) {
  if (a === b) return 0;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > limit) return limit + 1;
  let prev = new Array(lb + 1);
  let cur  = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;
  for (let i = 1; i <= la; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > limit) return limit + 1;
    const tmp = prev; prev = cur; cur = tmp;
  }
  return prev[lb];
}

/* ═══════════════ Rate Limit سمت کلاینت ═══════════════ */

const rateBuckets = new Map();

/**
 * اجازه‌ی انجام یک کنش را می‌دهد یا رد می‌کند.
 * سمت کلاینت است و دور زدنش ممکن — نسخه‌ی سختگیرانه‌اش در Security Rules هم هست.
 */
export function rateLimit(key, intervalMs = MIN_BID_INTERVAL_MS) {
  const now = Date.now();
  const last = rateBuckets.get(key) || 0;
  if (now - last < intervalMs) return false;
  rateBuckets.set(key, now);
  return true;
}

export function resetRateLimit(key) {
  rateBuckets.delete(key);
}

/* ═══════════════ Clock Sync ═══════════════ */

const CLOCK_KEY = "bluff.clockOffset";

/** دسترسی امن به localStorage (حالت خصوصی سافاری استثنا پرتاب می‌کند). */
function safeLocalStorage() {
  try { return typeof localStorage !== "undefined" ? localStorage : null; }
  catch { return null; }
}
const LS = safeLocalStorage();

let clockOffset = Number((LS && LS.getItem(CLOCK_KEY)) || 0);

/**
 * اختلاف ساعت گوشی با سرور را ثبت می‌کند.
 * serverMs از serverTimestamp خوانده‌شده می‌آید، localMs زمان محلی هنگام همان نوشتن.
 */
export function setClockOffset(serverMs, localMs) {
  if (!Number.isFinite(serverMs) || !Number.isFinite(localMs)) return;
  const offset = serverMs - localMs;
  // پرش‌های غیرمنطقی (بیش از ۱۰ دقیقه) نادیده گرفته می‌شوند
  if (Math.abs(offset) > 10 * 60 * 1000) return;
  clockOffset = offset;
  try { LS && LS.setItem(CLOCK_KEY, String(offset)); } catch { /* حالت خصوصی */ }
}

export function getClockOffset() { return clockOffset; }

/** «الان» از دید سرور — مبنای همه‌ی تایمرها. */
export function serverNow() { return Date.now() + clockOffset; }

/* ═══════════════ Storage امن ═══════════════ */

export const store = {
  get(key, fallback = null) {
    try {
      const v = LS && LS.getItem(`bluff.${key}`);
      return v === null ? fallback : JSON.parse(v);
    } catch { return fallback; }
  },
  set(key, value) {
    try { LS && LS.setItem(`bluff.${key}`, JSON.stringify(value)); return true; }
    catch { return false; }
  },
  del(key) {
    try { LS && LS.removeItem(`bluff.${key}`); } catch { /* noop */ }
  }
};

/* ═══════════════ کمکی‌های عمومی ═══════════════ */

export function clampInt(value, min, max) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

/** تبدیل ارقام فارسی به لاتین برای نمایش اعداد بازی. */
export function toLatinDigits(input) {
  return String(input).replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)));
}

/** مدیریت متمرکز unsubscribeها تا نشت listener رخ ندهد. */
export function createCleanup() {
  const fns = new Set();
  const run = () => { fns.forEach((f) => { try { f(); } catch (e) { log.warn(e); } }); fns.clear(); };
  if (typeof window !== "undefined") window.addEventListener("pagehide", run, { once: true });
  return {
    add(fn) { if (typeof fn === "function") fns.add(fn); return fn; },
    remove(fn) { fns.delete(fn); },
    runAll: run
  };
}

/** تاخیر با Promise (برای backoff). */
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** اجرای عملیات با تلاش مجدد نمایی — برای خطاهای موقتی شبکه. */
export async function withRetry(fn, { attempts = 3, baseDelay = 400 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); }
    catch (err) {
      lastErr = err;
      const code = err && err.code ? String(err.code) : "";
      if (code.includes("permission-denied") || code.includes("not-found")) throw err;
      if (i < attempts - 1) await sleep(baseDelay * Math.pow(2, i));
    }
  }
  throw lastErr;
}
