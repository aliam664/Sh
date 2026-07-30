package com.ramzo.game.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ramzo.game.GameViewModel
import com.ramzo.game.R
import com.ramzo.game.UiState
import com.ramzo.game.game.Rules
import com.ramzo.game.ui.components.DigitBoxes
import com.ramzo.game.ui.components.GuessRow
import com.ramzo.game.ui.components.NumberPad
import com.ramzo.game.ui.components.PlayerLine
import com.ramzo.game.ui.components.RamzoCard
import com.ramzo.game.ui.theme.Accent
import com.ramzo.game.ui.theme.TextDim
import com.ramzo.game.ui.theme.TileGreen

/**
 * صفحهٔ بازی برای حدس‌زننده‌ها — تاریخچهٔ رنگی + کی‌پد + وضعیت بقیه.
 */
@Composable
fun GameScreen(state: UiState, vm: GameViewModel) {
    var input by remember { mutableStateOf("") }
    val canGuess = state.roundOpen && !state.iSolved && state.guessesLeft > 0

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 20.dp, vertical = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        // نوار وضعیت دور
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                stringResource(R.string.round_of, state.round, state.totalRounds),
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold,
            )
            Text(
                stringResource(R.string.holder_label, state.holderName),
                fontSize = 13.sp,
                color = TextDim,
            )
            Text(
                stringResource(R.string.guesses_left, state.guessesLeft),
                fontSize = 13.sp,
                color = Accent,
                fontWeight = FontWeight.Bold,
            )
        }

        Spacer(modifier = Modifier.height(8.dp))

        // تاریخچهٔ حدس‌های من (جدیدترین بالا)
        LazyColumn(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            item {
                Text(
                    stringResource(R.string.my_guesses),
                    fontSize = 13.sp,
                    color = TextDim,
                    modifier = Modifier.padding(bottom = 2.dp),
                )
            }
            itemsIndexed(state.myHistory) { _, entry ->
                GuessRow(
                    indexLabel = "${state.myHistory.indexOf(entry) + 1}.",
                    guess = entry.guess,
                    tiles = entry.tiles,
                )
            }
            item {
                if (state.progressAll.any { it.id != state.myId }) {
                    Spacer(modifier = Modifier.height(10.dp))
                    Text(
                        stringResource(R.string.others_status),
                        fontSize = 13.sp,
                        color = TextDim,
                    )
                    state.progressAll.filter { it.id != state.myId }.forEach { p ->
                        PlayerLine(
                            name = p.name,
                            trailing = if (p.solved) stringResource(R.string.solved_tag)
                            else "${p.used}/${state.maxGuesses}",
                            trailingColor = if (p.solved) TileGreen else TextDim,
                        )
                    }
                }
            }
        }

        when {
            state.iSolved -> Text(
                stringResource(R.string.you_solved_wait),
                fontSize = 15.sp,
                color = TileGreen,
                fontWeight = FontWeight.Bold,
            )

            !state.roundOpen -> Text(
                stringResource(R.string.waiting_secret, state.holderName),
                fontSize = 14.sp,
                color = TextDim,
            )
        }
        Spacer(modifier = Modifier.height(8.dp))

        DigitBoxes(input = input, length = Rules.SECRET_LENGTH)
        Spacer(modifier = Modifier.height(12.dp))
        NumberPad(
            onDigit = { if (input.length < Rules.SECRET_LENGTH) input += it },
            onBackspace = { if (input.isNotEmpty()) input = input.dropLast(1) },
            onConfirm = {
                vm.submitGuess(input)
                input = ""
            },
            confirmEnabled = input.length == Rules.SECRET_LENGTH,
            enabled = canGuess,
        )
        Spacer(modifier = Modifier.height(8.dp))
    }
}
