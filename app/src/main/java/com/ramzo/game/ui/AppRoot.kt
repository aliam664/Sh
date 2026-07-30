package com.ramzo.game.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.ramzo.game.GameViewModel
import com.ramzo.game.Screen
import com.ramzo.game.ui.screens.FinalScreen
import com.ramzo.game.ui.screens.GameScreen
import com.ramzo.game.ui.screens.HomeScreen
import com.ramzo.game.ui.screens.LobbyScreen
import com.ramzo.game.ui.screens.ResultScreen
import com.ramzo.game.ui.screens.SecretScreen
import com.ramzo.game.ui.screens.SpectateScreen
import com.ramzo.game.ui.theme.Bg
import com.ramzo.game.ui.theme.RamzoTheme
import com.ramzo.game.ui.theme.Surface2
import com.ramzo.game.ui.theme.TextMain

/**
 * ریشهٔ اپ — تم رمزو، جهت راست‌به‌چپ و سوییچ صفحه‌ها بر اساس StateFlow.
 * (ناوبری وضعیت‌محور؛ برای ۸ صفحه به کتابخانهٔ Navigation نیازی نداریم)
 */
@Composable
fun AppRoot(vm: GameViewModel) {
    val state by vm.state.collectAsStateWithLifecycle()

    RamzoTheme {
        CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
            Surface(modifier = Modifier.fillMaxSize(), color = Bg) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .systemBarsPadding(),
                ) {
                    when (state.screen) {
                        Screen.HOME -> HomeScreen(state, vm)
                        Screen.HOST_LOBBY -> LobbyScreen(state, vm)
                        Screen.SECRET -> SecretScreen(state, vm)
                        Screen.GAME -> GameScreen(state, vm)
                        Screen.SPECTATE -> SpectateScreen(state)
                        Screen.RESULT -> ResultScreen(state, vm)
                        Screen.FINAL -> FinalScreen(state, vm)
                    }

                    // بنر اطلاع‌رسانی/خطا — روی همهٔ صفحه‌ها
                    state.banner?.let { text ->
                        Box(
                            modifier = Modifier
                                .align(Alignment.BottomCenter)
                                .padding(16.dp)
                                .clip(RoundedCornerShape(14.dp))
                                .background(Surface2)
                                .padding(horizontal = 18.dp, vertical = 12.dp),
                        ) {
                            Text(text = text, color = TextMain, fontSize = 14.sp)
                        }
                    }
                }
            }
        }
    }
}
