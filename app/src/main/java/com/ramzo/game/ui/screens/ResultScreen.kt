package com.ramzo.game.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ramzo.game.GameViewModel
import com.ramzo.game.R
import com.ramzo.game.UiState
import com.ramzo.game.game.ScoreEntry
import com.ramzo.game.ui.components.DigitBoxes
import com.ramzo.game.ui.components.PlayerLine
import com.ramzo.game.ui.components.RamzoCard
import com.ramzo.game.ui.theme.Accent
import com.ramzo.game.ui.theme.Bg
import com.ramzo.game.ui.theme.Gold
import com.ramzo.game.ui.theme.TextDim

/** جدول امتیازات — در صفحهٔ نتیجهٔ دور و فینال استفاده می‌شود */
@Composable
fun ScoreList(scores: List<ScoreEntry>, myId: Int) {
    scores.forEachIndexed { index, s ->
        PlayerLine(
            name = s.name,
            trailing = "${s.score}",
            trailingColor = if (index == 0 && s.score > 0) Gold else TextDim,
            badge = buildString {
                if (index == 0 && s.score > 0) append("🏆")
                if (s.id == myId) append(" شما")
            }.ifBlank { null },
            emphasize = s.id == myId,
        )
    }
}

/**
 * نتیجهٔ دور — افشای رمز، برنده، جدول امتیاز و دکمهٔ ادامه.
 */
@Composable
fun ResultScreen(state: UiState, vm: GameViewModel) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp, vertical = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(
            text = when {
                state.resultVoid -> stringResource(R.string.result_void_round)
                state.resultHolderPoint -> stringResource(R.string.result_holder_point, state.resultWinnerName)
                else -> stringResource(R.string.result_winner, state.resultWinnerName)
            },
            fontSize = 22.sp,
            fontWeight = FontWeight.ExtraBold,
            color = if (state.resultVoid) TextDim else Gold,
        )

        if (state.revealedSecret.isNotBlank() && state.revealedSecret != "—") {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    stringResource(R.string.secret_was),
                    fontSize = 13.sp,
                    color = TextDim,
                )
                Spacer(modifier = Modifier.height(6.dp))
                DigitBoxes(
                    input = state.revealedSecret,
                    length = state.revealedSecret.length,
                    highlightNext = false,
                )
            }
        }

        RamzoCard {
            Text(
                stringResource(R.string.scoreboard),
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold,
            )
            Spacer(modifier = Modifier.height(4.dp))
            ScoreList(scores = state.scores, myId = state.myId)
        }

        Spacer(modifier = Modifier.height(8.dp))

        when {
            // میزبان: دکمهٔ دور بعدی یا نمایش قهرمان
            state.iAmHost -> Button(
                onClick = vm::nextRound,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Accent, contentColor = Bg),
            ) {
                Text(
                    if (state.lastRound) stringResource(R.string.show_champion)
                    else stringResource(R.string.next_round),
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                )
            }

            // کلاینت در دور آخر هم مستقیم به فینال می‌رود
            state.lastRound -> Button(
                onClick = vm::finishGame,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Accent, contentColor = Bg),
            ) {
                Text(
                    stringResource(R.string.show_champion),
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                )
            }

            else -> Text(
                stringResource(R.string.waiting_host_next),
                fontSize = 14.sp,
                color = TextDim,
            )
        }

        TextButton(onClick = vm::leaveGame, modifier = Modifier.fillMaxWidth()) {
            Text(stringResource(R.string.leave), color = TextDim)
        }
    }
}
