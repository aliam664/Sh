package com.ramzo.game.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ramzo.game.GameViewModel
import com.ramzo.game.R
import com.ramzo.game.UiState
import com.ramzo.game.game.Rules
import com.ramzo.game.ui.components.PlayerLine
import com.ramzo.game.ui.components.QrCode
import com.ramzo.game.ui.components.RamzoCard
import com.ramzo.game.ui.components.ScreenTitle
import com.ramzo.game.ui.theme.Accent
import com.ramzo.game.ui.theme.Bg
import com.ramzo.game.ui.theme.Gold
import com.ramzo.game.ui.theme.TextDim

/**
 * لابی میزبان — مهمان‌ها با QR/آدرس از مرورگر وارد می‌شوند (بدون نصب).
 */
@Composable
fun LobbyScreen(state: UiState, vm: GameViewModel) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp, vertical = 24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        ScreenTitle(title = state.roomName)

        // کارت ورود مهمان‌ها
        RamzoCard {
            Text(
                stringResource(R.string.lobby_invite_title),
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                color = Gold,
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                stringResource(R.string.lobby_invite_steps),
                fontSize = 13.sp,
                color = TextDim,
                lineHeight = 19.sp,
            )
            Spacer(modifier = Modifier.height(12.dp))
            Box(
                modifier = Modifier.fillMaxWidth(),
                contentAlignment = Alignment.Center,
            ) {
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(16.dp))
                        .background(Color.White)
                        .padding(10.dp),
                ) {
                    QrCode(content = state.hostUrl, size = 170.dp)
                }
            }
            Spacer(modifier = Modifier.height(12.dp))
            Text(
                stringResource(R.string.lobby_open_in_browser),
                fontSize = 13.sp,
                color = TextDim,
                modifier = Modifier.fillMaxWidth(),
            )
            Text(
                state.hostUrl,
                fontSize = 26.sp,
                fontWeight = FontWeight.ExtraBold,
                letterSpacing = 1.sp,
                modifier = Modifier.fillMaxWidth(),
            )
        }

        // بازیکنان
        RamzoCard {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    stringResource(R.string.players),
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    "${state.players.size}/${Rules.MAX_PLAYERS}",
                    fontSize = 15.sp,
                    color = Accent,
                    fontWeight = FontWeight.Bold,
                )
            }
            Spacer(modifier = Modifier.height(4.dp))
            state.players.forEach { p ->
                PlayerLine(
                    name = p.name,
                    trailing = if (p.isHost) stringResource(R.string.host_tag) else
                        stringResource(R.string.guest_browser_tag),
                    trailingColor = if (p.isHost) Gold else TextDim,
                    badge = if (p.id == state.myId) "(${stringResource(R.string.you_tag)})" else null,
                )
            }
            if (state.players.size < Rules.MIN_PLAYERS) {
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    stringResource(R.string.lobby_waiting_guests),
                    fontSize = 13.sp,
                    color = TextDim,
                )
            }
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                stringResource(R.string.everyone_holds_once),
                fontSize = 12.sp,
                color = TextDim,
            )
        }

        Spacer(modifier = Modifier.height(4.dp))

        Button(
            onClick = vm::startGame,
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Accent, contentColor = Bg),
        ) {
            Text(
                stringResource(R.string.start_game),
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
            )
        }

        TextButton(onClick = vm::leaveGame, modifier = Modifier.fillMaxWidth()) {
            Text(stringResource(R.string.leave), color = TextDim)
        }
    }
}
