package com.ramzo.game.ui.components

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter

/** تولید QR برای آدرس ورود مهمان‌ها — کاربر با دوربین گوشی ،بدون هیچ اپی، بازش می‌کند */
object QrGen {
    fun generate(content: String, sizePx: Int): Bitmap? = runCatching {
        val bits = QRCodeWriter().encode(content, BarcodeFormat.QR_CODE, sizePx, sizePx)
        val dark = 0xFF111111.toInt()
        val light = 0xFFFFFFFF.toInt()
        val pixels = IntArray(sizePx * sizePx)
        for (y in 0 until sizePx) {
            val offset = y * sizePx
            for (x in 0 until sizePx) {
                pixels[offset + x] = if (bits[x, y]) dark else light
            }
        }
        Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.RGB_565).apply {
            setPixels(pixels, 0, sizePx, 0, 0, sizePx, sizePx)
        }
    }.getOrNull()
}

@Composable
fun QrCode(content: String, size: Dp = 170.dp, modifier: Modifier = Modifier) {
    val bmp = remember(content) { QrGen.generate(content, 512) }
    if (bmp != null) {
        Image(
            bitmap = bmp.asImageBitmap(),
            contentDescription = "QR: $content",
            modifier = modifier.size(size),
            contentScale = ContentScale.Fit,
            filterQuality = FilterQuality.None, // پیکسل‌های QR باید تیز بمانند
        )
    }
}
