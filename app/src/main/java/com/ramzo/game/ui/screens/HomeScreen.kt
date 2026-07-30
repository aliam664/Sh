package com.ramzo.game.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ramzo.game.GameViewModel
import com.ramzo.game.R
import com.ramzo.game.UiState
import com.ramzo.game.ui.components.RamzoCard
import com.ramzo.game.ui.components.ScreenTitle
import com.ramzo.game.ui.theme.Accent
import com.ramzo.game.ui.theme.Bg
import com.ramzo.game.ui.theme.Gold
import com.ramzo.game.ui.theme.TextDim

/**
 * صفحهٔ خانه — نام + ساختن اتاق.
 * مهمان‌ها چیزی نصب نمی‌کنند؛ از مرورگر گوشی‌شان با هات‌اسپات وارد می‌شوند.
 */
@Composable
fun HomeScreen(state: UiState, vm: GameViewModel) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp, vertical = 24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Spacer(modifier = Modifier.height(12.dp))
        ScreenTitle(
            title = stringResource(R.string.app_name) + " 🔐",
            subtitle = stringResource(R.string.home_tagline),
        )
        Spacer(modifier = Modifier.height(8.dp))

        RamzoCard {
            OutlinedTextField(
                value = state.myName,
                onValueChange = vm::onNameChange,
                modifier = Modifier.fillMaxWidth(),
                label = { Text(stringResource(R.string.your_name)) },
                placeholder = { Text(stringResource(R.string.your_name_hint)) },
                singleLine = true,
            )
        }

        Button(
            onClick = vm::hostGame,
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Accent, contentColor = Bg),
        ) {
            Text(
                stringResource(R.string.host_game),
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
            )
        }

        // راهنمای حضور مهمان‌ها
        RamzoCard {
            Text(
                stringResource(R.string.join_help_title),
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                color = Gold,
            )
            Spacer(modifier = Modifier.height(8.dp))
            HelpLine("۱", stringResource(R.string.join_step_1))
            HelpLine("۲", stringResource(R.string.join_step_2))
            HelpLine("۳", stringResource(R.string.join_step_3))
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                stringResource(R.string.join_no_install_note),
                fontSize = 13.sp,
                color = Accent,
                fontWeight = FontWeight.Bold,
            )
        }
    }
}

@Composable
private fun HelpLine(num: String, text: String) {
    Row(modifier = Modifier.padding(vertical = 3.dp)) {
        Text(text = "$num. ", fontSize = 14.sp, color = Gold, fontWeight = FontWeight.Bold)
        Text(text = text, fontSize = 14.sp, color = TextDim, lineHeight = 20.sp)
    }
}
