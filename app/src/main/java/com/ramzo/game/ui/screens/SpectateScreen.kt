package com.ramzo.game.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ramzo.game.UiState
import com.ramzo.game.R
import com.ramzo.game.ui.components.DigitBoxes
import com.ramzo.game.ui.components.PlayerLine
import com.ramzo.game.ui.components.RamzoCard
import com.ramzo.game.ui.theme.Gold
import com.ramzo.game.ui.theme.TextDim
import com.ramzo.game.ui.theme.TileGreen

/**
 * صفحهٔ ناظر — فقط صاحب رمز: رمز خودش + پیشرفت زندهٔ همه.
 */
@Composable
fun SpectateScreen(state: UiState) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 20.dp, vertical = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(
            stringResource(R.string.spectate_title),
            fontSize = 24.sp,
            fontWeight = FontWeight.ExtraBold,
        )

        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                stringResource(R.string.your_secret_is),
                fontSize = 13.sp,
                color = TextDim,
            )
            Spacer(modifier = Modifier.height(6.dp))
            DigitBoxes(input = state.mySecret, length = state.mySecret.length, highlightNext = false)
        }

        RamzoCard {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    stringResource(R.string.round_of, state.round, state.totalRounds),
                    fontSize = 14.sp,
                    color = Gold,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    stringResource(R.string.watching_players),
                    fontSize = 13.sp,
                    color = TextDim,
                )
            }
            Spacer(modifier = Modifier.height(8.dp))
            state.progressAll.forEach { p ->
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
