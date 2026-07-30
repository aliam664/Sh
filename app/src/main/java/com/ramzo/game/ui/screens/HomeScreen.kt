package com.ramzo.game.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ramzo.game.GameViewModel
import com.ramzo.game.R
import com.ramzo.game.UiState
import com.ramzo.game.ui.components.RamzoCard
import com.ramzo.game.ui.components.ScreenTitle
import com.ramzo.game.ui.theme.Accent
import com.ramzo.game.ui.theme.Bg
import com.ramzo.game.ui.theme.TextDim

/**
 * صفحهٔ خانه — نام کاربر + میزبانی / پیوستن (کشف خودکار اتاق‌ها + IP دستی)
 */
@Composable
fun HomeScreen(state: UiState, vm: GameViewModel) {
    var manualIp by remember { mutableStateOf("") }

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

        // نام شما
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

        // میزبانی
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

        // پیوستن
        RamzoCard {
            Text(
                stringResource(R.string.join_section_title),
                fontSize = 17.sp,
                fontWeight = FontWeight.Bold,
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                stringResource(R.string.nearby_rooms),
                fontSize = 13.sp,
                color = TextDim,
            )
            Spacer(modifier = Modifier.height(8.dp))

            if (state.foundRooms.isEmpty()) {
                Text(
                    stringResource(R.string.no_rooms_hint),
                    fontSize = 13.sp,
                    color = TextDim,
                    lineHeight = 19.sp,
                )
            } else {
                state.foundRooms.forEach { room ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable(enabled = !state.connecting) { vm.joinRoom(room) }
                            .padding(vertical = 8.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(room.roomName, fontSize = 16.sp, fontWeight = FontWeight.Medium)
                        Text(room.host, fontSize = 13.sp, color = TextDim)
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // اتصال دستی با IP
            OutlinedTextField(
                value = manualIp,
                onValueChange = { manualIp = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text(stringResource(R.string.manual_ip_hint)) },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
            )
            Spacer(modifier = Modifier.height(8.dp))
            TextButton(
                onClick = { vm.joinByIp(manualIp) },
                enabled = !state.connecting,
                modifier = Modifier.align(Alignment.End),
            ) {
                Text(
                    if (state.connecting) stringResource(R.string.connecting)
                    else stringResource(R.string.connect) + " ←",
                    color = Accent,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
    }
}
