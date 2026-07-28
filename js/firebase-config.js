/**
 * js/firebase-config.js
 * ─────────────────────────────────────────────────────────────
 * تنها فایلی که کاربر باید ویرایش کند.
 * مقادیر را از Firebase Console → Project Settings → Your apps → Web app بردار.
 *
 * نکته‌ی امنیتی: apiKey فایربیس «رمز» نیست، یک شناسه‌ی عمومی است.
 * محافظت واقعی از طریق Security Rules + Authorized Domains + App Check انجام می‌شود.
 * ─────────────────────────────────────────────────────────────
 */

export const firebaseConfig = {
  apiKey:            "PASTE_HERE",
  authDomain:        "PASTE_HERE",
  projectId:         "PASTE_HERE",
  storageBucket:     "PASTE_HERE",
  messagingSenderId: "PASTE_HERE",
  appId:             "PASTE_HERE"
};

/**
 * اگر می‌خواهی App Check با reCAPTCHA v3 فعال شود، کلید سایت را اینجا بگذار.
 * خالی بگذاری، App Check غیرفعال می‌ماند (بازی کار می‌کند ولی سهمیه محافظت‌نشده است).
 */
export const RECAPTCHA_SITE_KEY = "";

/** نسخه‌ی Firebase SDK که از CDN بارگذاری می‌شود (Modular v10+). */
export const FIREBASE_SDK_VERSION = "10.12.2";

/** لاگ‌های توسعه. در نسخه‌ی منتشرشده false بماند. */
export const DEBUG = false;

/** بررسی این‌که کاربر واقعاً config را پر کرده است. */
export function isConfigFilled() {
  const required = ["apiKey", "authDomain", "projectId", "appId"];
  return required.every((k) => {
    const v = firebaseConfig[k];
    return typeof v === "string" && v.length > 6 && !v.includes("PASTE_HERE");
  });
}
