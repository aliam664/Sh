package com.ramzo.game.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ramzo.game.game.TILE_GREEN
import com.ramzo.game.game.TILE_RED
import com.ramzo.game.game.TILE_YELLOW
import com.ramzo.game.ui.theme.Accent
import com.ramzo.game.ui.theme.Bg
import com.ramzo.game.ui.theme.Gold
import com.ramzo.game.ui.theme.Surface1
import com.ramzo.game.ui.theme.Surface2
import com.ramzo.game.ui.theme.TextDim
import com.ramzo.game.ui.theme.TextMain
import com.ramzo.game.ui.theme.TileGreen
import com.ramzo.game.ui.theme.TileNeutral
import com.ramzo.game.ui.theme.TileRed
import com.ramzo.game.ui.theme.TileYellow

/** رنگ تایل بر اساس قضاوت */
fun tileColor(tile: Int): Color = when (tile) {
    TILE_GREEN -> TileGreen
    TILE_YELLOW -> TileYellow
    TILE_RED -> TileRed
    else -> TileNeutral
}

/** متنِ خوانا روی هر رنگِ تایل */
private fun onTileColor(tile: Int): Color = when (tile) {
    TILE_YELLOW -> Bg
    else -> Color.White
}

/** ردیف خانه‌های ورودی رمز/حدس — ترتیب ارقام LTR می‌ماند تا جایگاه‌ها طبیعی باشند */
@Composable
fun DigitBoxes(
    input: String,
    length: Int,
    modifier: Modifier = Modifier,
    masked: Boolean = false,
    highlightNext: Boolean = true,
) {
    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
        Row(modifier = modifier, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            repeat(length) { i ->
                val filled = i < input.length
                val isNext = highlightNext && i == input.length
                Box(
                    modifier = Modifier
                        .size(58.dp)
                        .clip(RoundedCornerShape(16.dp))
                        .background(if (filled) Surface1 else Surface2)
                        .border(
                            width = 2.dp,
                            color = if (isNext) Accent else Color.Transparent,
                            shape = RoundedCornerShape(16.dp),
                        ),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = when {
                            filled && masked -> "●"
                            filled -> input[i].toString()
                            else -> "·"
                        },
                        fontSize = 26.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (filled) TextMain else TextDim,
                    )
                }
            }
        }
    }
}

/** کی‌پد اختصاصی بازی: ۱ تا ۹، سپس ⌫ ۰ ✓ */
@Composable
fun NumberPad(
    onDigit: (Char) -> Unit,
    onBackspace: () -> Unit,
    onConfirm: () -> Unit,
    confirmEnabled: Boolean,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
        Column(
            modifier = modifier,
            verticalArrangement = Arrangement.spacedBy(10.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            listOf(
                listOf('1', '2', '3'),
                listOf('4', '5', '6'),
                listOf('7', '8', '9'),
            ).forEach { rowDigits ->
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    rowDigits.forEach { d ->
                        PadCell(label = d.toString(), enabled = enabled) { onDigit(d) }
                    }
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                PadCell(label = "⌫", enabled = enabled, container = Surface1, onClick = onBackspace)
                PadCell(label = "0", enabled = enabled) { onDigit('0') }
                PadCell(
                    label = "✓",
                    enabled = enabled && confirmEnabled,
                    container = if (confirmEnabled) Accent else Surface1,
                    contentColor = if (confirmEnabled) Bg else TextDim,
                    onClick = onConfirm,
                )
            }
        }
    }
}

@Composable
private fun PadCell(
    label: String,
    enabled: Boolean,
    container: Color = Surface2,
    contentColor: Color = TextMain,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .size(72.dp)
            .clip(CircleShape)
            .background(if (enabled) container else Surface1)
            .clickable(enabled = enabled) { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            fontSize = 26.sp,
            fontWeight = FontWeight.Bold,
            color = if (enabled) contentColor else TextDim,
        )
    }
}

/** یک ردیف تاریخچهٔ حدس: شماره + ۴ تایل رنگی */
@Composable
fun GuessRow(indexLabel: String, guess: String, tiles: List<Int>, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(text = indexLabel, color = TextDim, fontSize = 14.sp)
        CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                guess.forEachIndexed { i, c ->
                    val t = tiles.getOrElse(i) { -1 }
                    Box(
                        modifier = Modifier
                            .size(44.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(tileColor(t)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = c.toString(),
                            fontSize = 20.sp,
                            fontWeight = FontWeight.Bold,
                            color = onTileColor(t),
                        )
                    }
                }
            }
        }
    }
}

/** کارت استاندارد صفحه‌ها */
@Composable
fun RamzoCard(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = Surface1),
    ) {
        Column(modifier = Modifier.padding(16.dp)) { content() }
    }
}

/** ردیف بازیکن در لابی و لیست پیشرفت */
@Composable
fun PlayerLine(
    name: String,
    trailing: String,
    trailingColor: Color = TextDim,
    badge: String? = null,
    emphasize: Boolean = false,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(if (emphasize) Surface2 else Color.Transparent)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(text = name, fontSize = 16.sp, color = TextMain, fontWeight = FontWeight.Medium)
            if (badge != null) {
                Text(
                    text = "  $badge",
                    fontSize = 13.sp,
                    color = Gold,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
        Text(text = trailing, fontSize = 14.sp, color = trailingColor, textAlign = TextAlign.End)
    }
}

/** تیتر صفحه */
@Composable
fun ScreenTitle(title: String, subtitle: String? = null) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
        Text(
            text = title,
            fontSize = 26.sp,
            fontWeight = FontWeight.ExtraBold,
            color = TextMain,
            textAlign = TextAlign.Center,
        )
        if (subtitle != null) {
            Box(modifier = Modifier.height(4.dp))
            Text(
                text = subtitle,
                fontSize = 14.sp,
                color = TextDim,
                textAlign = TextAlign.Center,
            )
        }
    }
}
