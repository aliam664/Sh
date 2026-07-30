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
import com.ramzo.game.ui.components.RamzoCard
import com.ramzo.game.ui.theme.Accent
import com.ramzo.game.ui.theme.Bg
import com.ramzo.game.ui.theme.Gold

/**
 * قهرمان نهایی — بزرگ‌ترین امتیاز (مساوی → قهرمانی مشترک).
 */
@Composable
fun FinalScreen(state: UiState, vm: GameViewModel) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 20.dp, vertical = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Spacer(modifier = Modifier.height(12.dp))
        Text(
            stringResource(R.string.final_title),
            fontSize = 26.sp,
            fontWeight = FontWeight.ExtraBold,
        )

        val championText = state.champions.joinToString(" و ")
        Text(
            if (state.champions.size > 1) stringResource(R.string.champions_shared, championText)
            else stringResource(R.string.champion_is, championText),
            fontSize = 22.sp,
            fontWeight = FontWeight.ExtraBold,
            color = Gold,
        )

        RamzoCard {
            ScoreList(scores = state.scores, myId = state.myId)
        }

        Spacer(modifier = Modifier.height(8.dp))

        Button(
            onClick = vm::leaveGame,
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Accent, contentColor = Bg),
        ) {
            Text(
                stringResource(R.string.end_and_exit),
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
            )
        }
    }
}
