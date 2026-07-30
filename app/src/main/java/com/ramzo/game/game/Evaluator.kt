package com.ramzo.game.game

/** نتیجهٔ یک رقم در ارزیابی حدس */
const val TILE_GREEN = 0   // رقم درست، دقیقاً سر جایش
const val TILE_YELLOW = 1  // رقم در رمز هست، ولی سر جایش نیست
const val TILE_RED = 2     // رقم اصلاً در رمز نیست

/**
 * ارزیابی حدس با الگوریتم «دوپاس» — با ارقام تکراری هم هرگز دروغ نمی‌گوید.
 *
 * پاس ۱: هر رقمی که دقیقاً سر جایش است سبز می‌شود و از شمارش باقی ارقام رمز حذف می‌گردد.
 * پاس ۲: برای ارقام سبز‌نشده، به‌اندازهٔ تکرارِ باقی‌ماندهٔ آن رقم در رمز، زرد می‌دهیم؛ مازاد قرمز.
 *
 * مثال: رمز = "1125"، حدس = "5512"  →  [زرد، قرمز، زرد، زرد]
 * (فقط یک «۵» در رمز هست؛ پس «۵» دوم قرمز می‌شود تا بازیکن گمراه نشود.)
 *
 * این تابع خالص و بدون وابستگی است تا در تست JUnit روی JVM هم اجرا شود.
 */
object Evaluator {

    fun evaluate(secret: String, guess: String): IntArray {
        require(secret.length == guess.length) { "secret and guess must have equal length" }
        require(isValidCode(secret) && isValidCode(guess)) { "code must be ${Rules.SECRET_LENGTH} digits" }

        val n = secret.length
        val result = IntArray(n) { TILE_RED }

        // پاس ۱ — سبزها
        for (i in 0 until n) {
            if (guess[i] == secret[i]) result[i] = TILE_GREEN
        }

        // شمارش ارقام باقی‌ماندهٔ رمز (ارقامی که سبز نشدند)
        val remaining = IntArray(10)
        for (i in 0 until n) {
            if (result[i] != TILE_GREEN) remaining[secret[i] - '0']++
        }

        // پاس ۲ — زردها با احترام به سقف تکرار هر رقم
        for (i in 0 until n) {
            if (result[i] == TILE_GREEN) continue
            val d = guess[i] - '0'
            if (remaining[d] > 0) {
                result[i] = TILE_YELLOW
                remaining[d]--
            }
        }
        return result
    }

    /** آیا همهٔ ارقام سبزند؟ */
    fun isSolved(tiles: IntArray): Boolean = tiles.all { it == TILE_GREEN }
}
