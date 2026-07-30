package com.ramzo.game.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ramzo.game.GameViewModel
import com.ramzo.game.R
import com.ramzo.game.UiState
import com.ramzo.game.game.Rules
import com.ramzo.game.ui.components.PlayerLine
import com.ramzo.game.ui.components.RamzoCard
import com.ramzo.game.ui.components.ScreenTitle
import com.ramzo.game.ui.theme.Accent
import com.ramzo.game.ui.theme.Bg
import com.ramzo.game.ui.theme.Gold
import com.ramzo.game.ui.theme.TextDim

/**
 * لابی — یک قالب برای هر دو نقش؛ میزبان IP درشت می‌بیند و دکمهٔ شروع دارد.
 */
@Composable
fun LobbyScreen(state: UiState, vm: GameViewModel) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 20.dp, vertical = 24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        ScreenTitle(title = stringResource(R.string.lobby_title))

        RamzoCard {
            Text(state.roomName, fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, color = Gold)
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                "${stringResource(R.string.capacity)}: ${state.players.size}/${Rules.MAX_PLAYERS}",
                fontSize = 14.sp,
                color = TextDim,
            )
            if (state.iAmHost) {
                Spacer(modifier = Modifier.height(10.dp))
                Text(
                    stringResource(R.string.room_ip_label),
                    fontSize = 13.sp,
                    color = TextDim,
                )
                Text(
                    state.hostIp,
                    fontSize = 30.sp,
                    fontWeight = FontWeight.ExtraBold,
                    letterSpacing = 1.sp,
                )
            }
        }

        RamzoCard {
            Text(
                stringResource(R.string.players),
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold,
            )
            Spacer(modifier = Modifier.height(4.dp))
            state.players.forEach { p ->
                PlayerLine(
                    name = p.name,
                    trailing = if (p.isHost) stringResource(R.string.host_tag) else "",
                    trailingColor = Gold,
                    badge = if (p.id == state.myId) "(${stringResource(R.string.you_tag)})" else null,
                )
            }
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                stringResource(R.string.everyone_holds_once),
                fontSize = 12.sp,
                color = TextDim,
            )
        }

        Spacer(modifier = Modifier.weight(1f))

        if (state.iAmHost) {
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
        } else {
            Text(
                stringResource(R.string.waiting_for_host),
                fontSize = 15.sp,
                color = TextDim,
            )
        }

        TextButton(onClick = vm::leaveGame, modifier = Modifier.fillMaxWidth()) {
            Text(stringResource(R.string.leave), color = TextDim)
        }
    }
}
