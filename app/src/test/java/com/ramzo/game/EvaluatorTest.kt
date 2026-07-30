package com.ramzo.game

import com.ramzo.game.game.Evaluator
import com.ramzo.game.game.TILE_GREEN
import com.ramzo.game.game.TILE_RED
import com.ramzo.game.game.TILE_YELLOW
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * تست واحد برای داور بازی — مهم‌ترین بخش منطق رمزو.
 * اجرا بدون دستگاه: ./gradlew test
 */
class EvaluatorTest {

    @Test
    fun `all green when guess equals secret`() {
        val r = Evaluator.evaluate("1234", "1234")
        assertArrayEquals(intArrayOf(TILE_GREEN, TILE_GREEN, TILE_GREEN, TILE_GREEN), r)
        assertTrue(Evaluator.isSolved(r))
    }

    @Test
    fun `all red when nothing matches`() {
        val r = Evaluator.evaluate("1234", "5678")
        assertArrayEquals(intArrayOf(TILE_RED, TILE_RED, TILE_RED, TILE_RED), r)
        assertFalse(Evaluator.isSolved(r))
    }

    @Test
    fun `all yellow when all digits permuted`() {
        // رمز 1125 — حدس 5211: همهٔ ارقام هستند ولی هیچ‌کدام سر جایشان نیستند
        val r = Evaluator.evaluate("1125", "5211")
        assertArrayEquals(intArrayOf(TILE_YELLOW, TILE_YELLOW, TILE_YELLOW, TILE_YELLOW), r)
    }

    @Test
    fun `repeated digit never over-promises`() {
        // رمز 1125 فقط یک «۵» دارد؛ پس «۵» دومِ حدس باید قرمز شود
        val r = Evaluator.evaluate("1125", "5512")
        assertArrayEquals(intArrayOf(TILE_YELLOW, TILE_RED, TILE_YELLOW, TILE_YELLOW), r)
    }

    @Test
    fun `mixed greens and yellows`() {
        // رمز 1024 — حدس 1204: ۱ و ۴ سبز، ۲ و ۰ زرد
        val r = Evaluator.evaluate("1024", "1204")
        assertArrayEquals(intArrayOf(TILE_GREEN, TILE_YELLOW, TILE_YELLOW, TILE_GREEN), r)
    }

    @Test
    fun `green duplicates handled correctly`() {
        // رمز 1111 — حدس 1222: فقط اولین ۱ سبز، بقیه قرمز (چون دیگر ۱ باقی نمی‌ماند)
        val r = Evaluator.evaluate("1111", "1222")
        assertArrayEquals(intArrayOf(TILE_GREEN, TILE_RED, TILE_RED, TILE_RED), r)
    }

    @Test
    fun `leading zero is a valid code`() {
        val r = Evaluator.evaluate("0012", "0012")
        assertTrue(Evaluator.isSolved(r))
    }
}
