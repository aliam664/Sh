/**
 * js/ui.js
 * ─────────────────────────────────────────────────────────────
 * نقش: UI/UX Designer + Senior Developer
 * کتابخانه‌ی کوچک UI: ساخت امن DOM، Toast، Modal، Skeleton، آواتار،
 * حلقه‌ی تایمر SVG، هپتیک و انیمیشن.
 *
 * قانون سخت: هیچ innerHTML روی داده‌ی کاربر. همه‌چیز با textContent.
 * ─────────────────────────────────────────────────────────────
 */

import { toLatinDigits } from "./security.js";

/* ═══════════════ ساخت DOM ═══════════════ */

/**
 * سازنده‌ی امن المان.
 * el('div', { class:'card', onclick:fn, dataset:{id:'x'} }, [child, 'text'])
 */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = String(value);
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key === "style" && typeof value === "object") Object.assign(node.style, value);
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === "html") { /* عمداً پشتیبانی نمی‌شود */ }
    else node.setAttribute(key, value === true ? "" : String(value));
  }
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function $(sel, root = document) { return root.querySelector(sel); }
export function $$(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

export function clear(node) { if (node) node.replaceChildren(); }

/** SVG inline — هیچ کتابخانه‌ی آیکون خارجی مجاز نیست. */
const ICON_PATHS = {
  copy: "M9 9V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-4M5 9h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z",
  share: "M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M12 3v13M12 3 8 7M12 3l4 4",
  check: "M20 6 9 17l-5-5",
  close: "M18 6 6 18M6 6l12 12",
  crown: "m3 7 4.5 4L12 5l4.5 6L21 7l-2 11H5L3 7Z",
  user:  "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  back:  "M19 12H5M12 19l-7-7 7-7",
  plus:  "M12 5v14M5 12h14",
  trophy:"M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4ZM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 6v6l4 2",
  logout:"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  play:  "M6 4l14 8-14 8V4Z",
  chart: "M3 21h18M7 17V9M12 17V5M17 17v-6"
};

export function icon(name, size = 20) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", size);
  svg.setAttribute("height", size);
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", ICON_PATHS[name] || ICON_PATHS.user);
  svg.append(path);
  return svg;
}

/* ═══════════════ Toast ═══════════════ */

let toastHost = null;

function ensureToastHost() {
  if (toastHost && document.body.contains(toastHost)) return toastHost;
  toastHost = el("div", { class: "toast-host", role: "status", "aria-live": "polite" });
  document.body.append(toastHost);
  return toastHost;
}

/**
 * نمایش Toast. هرگز از alert() استفاده نمی‌کنیم.
 * type: 'info' | 'success' | 'error' | 'warn'
 */
export function toast(message, type = "info", duration = 3200) {
  const host = ensureToastHost();
  const node = el("div", { class: `toast toast--${type}` }, [
    el("span", { class: "toast__dot" }),
    el("span", { class: "toast__msg", text: message })
  ]);
  host.append(node);
  requestAnimationFrame(() => node.classList.add("is-in"));
  const kill = () => {
    node.classList.remove("is-in");
    setTimeout(() => node.remove(), 260);
  };
  const t = setTimeout(kill, duration);
  node.addEventListener("click", () => { clearTimeout(t); kill(); });
  return kill;
}

/* ═══════════════ Modal ═══════════════ */

/**
 * مودال با تله‌ی فوکوس ساده و بستن با Esc.
 * buttons: [{ label, variant, value }]  خروجی: Promise<value|null>
 */
export function modal({ title, body, buttons = [{ label: "باشه", value: true, variant: "primary" }], dismissible = true }) {
  return new Promise((resolve) => {
    const close = (value) => {
      document.removeEventListener("keydown", onKey);
      overlay.classList.remove("is-in");
      setTimeout(() => overlay.remove(), 200);
      resolve(value);
    };
    const onKey = (e) => {
      if (e.key === "Escape" && dismissible) close(null);
      if (e.key === "Tab") {
        const f = $$("button, input, select, textarea, [tabindex]", box).filter((n) => !n.disabled);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };

    const box = el("div", { class: "modal glass-strong", role: "dialog", "aria-modal": "true" }, [
      title ? el("h2", { class: "modal__title", text: title }) : null,
      el("div", { class: "modal__body" }, typeof body === "string" ? [el("p", { text: body })] : (Array.isArray(body) ? body : [body])),
      el("div", { class: "modal__actions" }, buttons.map((b) =>
        el("button", {
          class: `btn btn--${b.variant || "ghost"}`,
          type: "button",
          onclick: () => close(b.value)
        }, [b.label])))
    ]);

    const overlay = el("div", { class: "modal-overlay", onclick: (e) => { if (e.target === overlay && dismissible) close(null); } }, [box]);
    document.body.append(overlay);
    requestAnimationFrame(() => {
      overlay.classList.add("is-in");
      const firstBtn = $("button", box);
      firstBtn && firstBtn.focus();
    });
    document.addEventListener("keydown", onKey);
  });
}

export async function confirmDialog(title, message, okLabel = "تایید") {
  const res = await modal({
    title,
    body: message,
    buttons: [
      { label: "انصراف", value: false, variant: "ghost" },
      { label: okLabel, value: true, variant: "danger" }
    ]
  });
  return res === true;
}

/* ═══════════════ آواتار ═══════════════ */

/** هش پایدار برای تولید رنگ آواتار از روی نام/دانه. */
function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function avatarColors(seed) {
  const h = hashString(String(seed || "x"));
  const hue = h % 360;
  return {
    from: `hsl(${hue} 78% 58%)`,
    to: `hsl(${(hue + 48) % 360} 74% 44%)`
  };
}

/** آواتار حرف‌اول با گرادیان — بدون هیچ فایل تصویری. */
export function avatar(name, seed, size = 44) {
  const { from, to } = avatarColors(seed || name);
  const letter = (String(name || "?").trim()[0] || "?").toUpperCase();
  return el("div", {
    class: "avatar",
    style: {
      width: `${size}px`, height: `${size}px`,
      fontSize: `${Math.round(size * 0.42)}px`,
      backgroundImage: `linear-gradient(135deg, ${from}, ${to})`
    },
    "aria-hidden": "true"
  }, [letter]);
}

/* ═══════════════ حلقه‌ی تایمر SVG ═══════════════ */

/**
 * سازنده‌ی حلقه‌ی تایمر. خروجی { node, update(ratio, seconds) }
 */
export function timerRing(size = 92) {
  const ns = "http://www.w3.org/2000/svg";
  const r = (size - 10) / 2;
  const circumference = 2 * Math.PI * r;

  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  svg.setAttribute("width", size);
  svg.setAttribute("height", size);
  svg.classList.add("timer__svg");

  const track = document.createElementNS(ns, "circle");
  track.setAttribute("cx", size / 2); track.setAttribute("cy", size / 2); track.setAttribute("r", r);
  track.setAttribute("class", "timer__track");

  const prog = document.createElementNS(ns, "circle");
  prog.setAttribute("cx", size / 2); prog.setAttribute("cy", size / 2); prog.setAttribute("r", r);
  prog.setAttribute("class", "timer__prog");
  prog.style.strokeDasharray = String(circumference);
  prog.style.strokeDashoffset = "0";

  svg.append(track, prog);

  const label = el("span", { class: "timer__label", text: "0" });
  const node = el("div", { class: "timer" }, [svg, label]);

  let lastSec = -1;
  return {
    node,
    /** ratio: 0..1 ، ms: باقی‌مانده بر حسب میلی‌ثانیه */
    update(ratio, ms) {
      const clamped = Math.max(0, Math.min(1, ratio));
      prog.style.strokeDashoffset = String(circumference * (1 - clamped));
      const sec = Math.ceil(ms / 1000);
      if (sec !== lastSec) {
        lastSec = sec;
        label.textContent = toLatinDigits(Math.max(0, sec));
        node.classList.toggle("is-danger", sec <= 10 && sec > 0);
        if (sec <= 10 && sec > 0) {
          node.classList.remove("shake");
          void node.offsetWidth;   // ری‌استارت انیمیشن
          node.classList.add("shake");
        }
      }
    },
    setActive(active) { node.classList.toggle("is-idle", !active); }
  };
}

/* ═══════════════ Skeleton ═══════════════ */

export function skeleton(count = 3, height = 64) {
  return el("div", { class: "skeleton-group" },
    Array.from({ length: count }, () =>
      el("div", { class: "skeleton", style: { height: `${height}px` } })));
}

/* ═══════════════ هپتیک و افکت ═══════════════ */

const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** لرزش کوتاه — روی دسکتاپ بی‌اثر و بی‌خطر است. */
export function haptic(pattern = 12) {
  try { if (navigator.vibrate && !reduceMotion()) navigator.vibrate(pattern); } catch { /* noop */ }
}

export const HAPTIC = Object.freeze({
  TAP: 12,
  BID: [10, 40, 10],
  BLUFF: [30, 50, 60],
  TIMEOUT: [80, 40, 80],
  WIN: [20, 60, 20, 60, 120]
});

/** انیمیشن ضربان روی یک المان (فقط transform/opacity). */
export function pulse(node, className = "pulse") {
  if (!node || reduceMotion()) return;
  node.classList.remove(className);
  void node.offsetWidth;
  node.classList.add(className);
}

/* ═══════════════ کپی و اشتراک ═══════════════ */

export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fallback زیر */ }
  try {
    const ta = el("textarea", { style: { position: "fixed", opacity: "0", top: "-1000px" } });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch { return false; }
}

/** Web Share API با fallback به clipboard. */
export async function shareLink({ title, text, url }) {
  try {
    if (navigator.share) {
      await navigator.share({ title, text, url });
      return "shared";
    }
  } catch (e) {
    if (e && e.name === "AbortError") return "cancelled";
  }
  const ok = await copyText(url);
  return ok ? "copied" : "failed";
}

/* ═══════════════ نوار اتصال ═══════════════ */

let connBar = null;

export function setConnectionState(state) {
  if (state === "online") {
    if (connBar) { connBar.remove(); connBar = null; }
    return;
  }
  if (connBar) return;
  connBar = el("div", { class: "conn-bar", role: "alert" }, ["اتصال قطع شد — در حال تلاش مجدد…"]);
  document.body.append(connBar);
}

/* ═══════════════ به‌روزرسانی PWA ═══════════════ */

/** ثبت Service Worker و نمایش پیام «نسخه‌ی جدید». */
export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("./service-worker.js", { scope: "./" });
      reg.addEventListener("updatefound", () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener("statechange", () => {
          if (sw.state === "installed" && navigator.serviceWorker.controller) {
            showUpdateBanner(sw);
          }
        });
      });
    } catch { /* آفلاین یا فایل موجود نیست */ }
  });
}

function showUpdateBanner(sw) {
  const bar = el("div", { class: "update-bar" }, [
    el("span", { text: "نسخه‌ی جدید بازی موجود است" }),
    el("button", {
      class: "btn btn--primary btn--sm",
      type: "button",
      onclick: () => {
        sw.postMessage({ type: "SKIP_WAITING" });
        setTimeout(() => location.reload(), 200);
      }
    }, ["به‌روزرسانی"])
  ]);
  document.body.append(bar);
}

/* ═══════════════ کمکی‌های نمایشی ═══════════════ */

export function fmtScore(n) {
  const v = Number(n) || 0;
  return (v > 0 ? "+" : "") + toLatinDigits(v);
}

export function fmtNumber(n) { return toLatinDigits(Number(n) || 0); }

export function fmtDate(millis) {
  if (!millis) return "—";
  try {
    return new Intl.DateTimeFormat("fa-IR", { dateStyle: "short", timeStyle: "short" }).format(new Date(millis));
  } catch { return "—"; }
}

/** نشانگر لودینگ روی دکمه بدون از دست رفتن متن اصلی. */
export function setBusy(button, busy, busyLabel = "لطفاً صبر کن…") {
  if (!button) return;
  if (busy) {
    if (!button.dataset.label) button.dataset.label = button.textContent;
    button.disabled = true;
    button.classList.add("is-busy");
    button.textContent = busyLabel;
  } else {
    button.disabled = false;
    button.classList.remove("is-busy");
    if (button.dataset.label) button.textContent = button.dataset.label;
  }
}

/** نمایش صفحه‌ی خطای تمام‌صفحه (مثلاً وقتی اتاق حذف شده). */
export function fatalScreen(title, message, actionLabel, actionHref) {
  const box = el("div", { class: "fatal glass-strong" }, [
    el("h1", { text: title }),
    el("p", { text: message }),
    actionLabel ? el("a", { class: "btn btn--primary", href: actionHref || "./lobby.html" }, [actionLabel]) : null
  ]);
  document.body.replaceChildren(el("div", { class: "fatal-wrap" }, [box]));
}
