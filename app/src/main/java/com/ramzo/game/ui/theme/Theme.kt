package com.ramzo.game.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// ---------------- توکن‌های رنگ رمزو (مرجع: docs/gdd-fa.md §۵) ----------------

val Bg = Color(0xFF0B1020)          // پس‌زمینهٔ سرمه‌ای تیره
val Surface1 = Color(0xFF161F38)    // کارت
val Surface2 = Color(0xFF1E2947)    // سطح برجسته‌تر / تایل خنثی
val Accent = Color(0xFF2DD4BF)      // فیروزه‌ای — اکشن اصلی
val Gold = Color(0xFFFBBF24)        // امتیاز و قهرمان
val TextMain = Color(0xFFEDF2F7)
val TextDim = Color(0xFF93A3C4)

val TileGreen = Color(0xFF22C55E)
val TileYellow = Color(0xFFEAB308)
val TileRed = Color(0xFFEF4444)
val TileNeutral = Color(0xFF2A3556)

private val RamzoColors = darkColorScheme(
    primary = Accent,
    onPrimary = Bg,
    secondary = Gold,
    onSecondary = Bg,
    background = Bg,
    onBackground = TextMain,
    surface = Surface1,
    onSurface = TextMain,
    surfaceVariant = Surface2,
    onSurfaceVariant = TextDim,
    outline = TextDim,
)

@Composable
fun RamzoTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = RamzoColors, content = content)
}
