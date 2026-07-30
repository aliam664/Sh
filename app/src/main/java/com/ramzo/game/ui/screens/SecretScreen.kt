package com.ramzo.game.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ramzo.game.GameViewModel
import com.ramzo.game.R
import com.ramzo.game.UiState
import com.ramzo.game.game.Rules
import com.ramzo.game.ui.components.DigitBoxes
import com.ramzo.game.ui.components.NumberPad
import com.ramzo.game.ui.components.ScreenTitle
import com.ramzo.game.ui.theme.Gold

/**
 * ورود رمز مخفی — فقط صاحب رمز این صفحه را می‌بیند.
 */
@Composable
fun SecretScreen(state: UiState, vm: GameViewModel) {
    var input by remember { mutableStateOf("") }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 20.dp, vertical = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.SpaceBetween,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            ScreenTitle(
                title = stringResource(R.string.secret_title),
                subtitle = stringResource(R.string.secret_hint),
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(stringResource(R.string.secret_share_warning), fontSize = 13.sp, color = Gold)
        }

        DigitBoxes(
            input = input,
            length = Rules.SECRET_LENGTH,
            masked = state.mySecret.isNotEmpty(), // بعد از قفل، نمایش ● بماند
        )

        NumberPad(
            onDigit = { if (input.length < Rules.SECRET_LENGTH) input += it },
            onBackspace = { if (input.isNotEmpty()) input = input.dropLast(1) },
            onConfirm = { vm.submitSecret(input) },
            confirmEnabled = input.length == Rules.SECRET_LENGTH,
        )
        Spacer(modifier = Modifier.height(8.dp))
    }
}
