package com.ramzo.game.game

/**
 * قواعد و ثابت‌های بازی «رمزو» — همهٔ مقادیر قابل‌تنظیم این‌جاست.
 * (منبع واحد حقیقت برای پروتکل و منطق؛ تغییر این فایل روی همهٔ لایه‌ها اثر می‌گذارد)
 */
object Rules {
    /** طول کد رمز */
    const val SECRET_LENGTH = 4

    /** سقف تعداد حدس هر بازیکن در هر دور */
    const val MAX_GUESSES = 12

    /** حداکثر بازیکنان اتاق (از جمله میزبان) */
    const val MAX_PLAYERS = 5

    /** حداقل بازیکن برای شروع بازی */
    const val MIN_PLAYERS = 2

    /** اگر رمز در سقف حدس‌ها شکسته نشود، امتیاز دور به صاحب رمز می‌رسد */
    const val HOLDER_POINT_IF_UNSOLVED = true

    /** نسخهٔ پروتکل — میزبان و کلاینت باید برابر باشند */
    const val PROTO = 1

    /** پورت TCP اتاق بازی */
    const val TCP_PORT = 48000

    /** پورت UDP برای کشف اتاق */
    const val UDP_PORT = 47777

    /** امضای بستهٔ کشف تا ترافیک نامرتبط شبکه اذیت نکند */
    const val DISCOVERY_MAGIC = "RAMZO1"

    /**
     * شناسهٔ ویژه در پیام Progress: یعنی «رمز قفل شد، حدس‌زدن باز است».
     * (شناسه‌های واقعی بازیکن از ۰ شروع می‌شوند، پس ۱‑ به‌عنوان سنتینل امن است)
     */
    const val SIGNAL_SECRET_READY = -1
}

/** کدهای خطای پروتکل (قابل‌نگاشت به رشته‌های فارسی در UI) */
object ErrCodes {
    const val ROOM_FULL = "room_full"
    const val PROTO_MISMATCH = "proto_mismatch"
    const val BAD_SECRET = "bad_secret"
    const val GUESSES_OVER = "guesses_over"
    const val GAME_STARTED = "game_started"
}

/** تبدیل ارقام فارسی ۰۱۲۳ و عربی ٠١٢٣ به انگلیسی — کاربر آزاد است هرجور تایپ کند */
fun normalizeDigits(input: String): String = buildString(input.length) {
    for (c in input) when (c) {
        in '۰'..'۹' -> append('0' + (c - '۰'))
        in '٠'..'٩' -> append('0' + (c - '٠'))
        else -> append(c)
    }
}

/** آیا رشتهٔ داده‌شده یک کد ۴ رقمی معتبر است؟ */
fun isValidCode(code: String): Boolean =
    code.length == Rules.SECRET_LENGTH && code.all { it in '0'..'9' }
