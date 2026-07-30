package com.ramzo.game

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.ramzo.game.game.GameCore
import com.ramzo.game.game.GuessEntry
import com.ramzo.game.game.PlayerProgress
import com.ramzo.game.game.RoomPlayer
import com.ramzo.game.game.Rules
import com.ramzo.game.game.ScoreEntry
import com.ramzo.game.game.isValidCode
import com.ramzo.game.game.normalizeDigits
import com.ramzo.game.net.NetUtils
import com.ramzo.game.net.web.WebGameServer
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import java.util.concurrent.Executors

// ---------- مدل‌های UI ----------

enum class Screen { HOME, HOST_LOBBY, SECRET, GAME, SPECTATE, RESULT, FINAL }

data class UiState(
    val screen: Screen = Screen.HOME,
    // هویت (این دستگاه همیشه میزبان است — مهمان‌ها از مرورگر می‌آیند)
    val myName: String = "",
    val myId: Int = GameCore.HOST_ID,
    val iAmHost: Boolean = false,
    // اتاق
    val roomName: String = "",
    val hostUrl: String = "",              // آدرس ورود مهمان‌ها در مرورگر
    val players: List<RoomPlayer> = emptyList(),
    // دور
    val round: Int = 0,
    val totalRounds: Int = 0,
    val holderId: Int = -1,
    val holderName: String = "",
    val maxGuesses: Int = Rules.MAX_GUESSES,
    val roundOpen: Boolean = false,
    val mySecret: String = "",
    // حدس‌های من (وقتی میزبان حدس‌زننده است)
    val myHistory: List<GuessEntry> = emptyList(),
    val guessesLeft: Int = Rules.MAX_GUESSES,
    val iSolved: Boolean = false,
    // پیشرفت حدس‌زننده‌ها
    val progressAll: List<PlayerProgress> = emptyList(),
    // نتیجهٔ دور
    val resultWinnerId: Int = Int.MIN_VALUE,
    val resultWinnerName: String = "",
    val resultHolderPoint: Boolean = false,
    val resultVoid: Boolean = false,
    val revealedSecret: String = "",
    val lastRound: Boolean = false,
    // جدول و فینال
    val scores: List<ScoreEntry> = emptyList(),
    val champions: List<String> = emptyList(),
    // اطلاع‌رسانی
    val banner: String? = null,
)

/**
 * ViewModel اپ میزبان.
 *
 * معماری «بدون نصب»: GameCore منبع واحد حقیقت است؛ این ViewModel همان را به
 * Compose نشان می‌دهد و WebGameServer همان را با JSON اسنپ‌شاتی در مرورگر مهمان‌ها.
 * همهٔ اکشن‌ها روی یک «رشتهٔ منطقی تکی» اجرا می‌شوند — بدون قفل و Race.
 */
class GameViewModel(application: Application) : AndroidViewModel(application) {

    private val app = application

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state

    private val logic = Executors.newSingleThreadExecutor { r -> Thread(r, "ramzo-logic") }
    private var core: GameCore? = null
    private var server: WebGameServer? = null

    /** رمزِ میزبان وقتی صاحب رمز است (برای صفحهٔ ناظر) — جزئیات UI، نه core */
    private var hostSecret = ""
    private var lastKnownRound = 0

    private val stateLock = Any()

    // ================================ ابزار وضعیت ================================

    private inline fun set(crossinline f: (UiState) -> UiState) {
        synchronized(stateLock) { _state.value = f(_state.value) }
    }

    private fun onLogic(block: () -> Unit) {
        logic.execute {
            try {
                block()
            } catch (t: Throwable) {
                banner(R.string.err_generic)
            }
        }
    }

    private fun banner(res: Int, vararg args: Any) {
        val text = if (args.isEmpty()) app.getString(res) else app.getString(res, *args)
        set { it.copy(banner = text) }
        viewModelScope.launch {
            delay(3500)
            set { s -> if (s.banner == text) s.copy(banner = null) else s }
        }
    }

    // ================================ ورودی‌های UI ================================

    fun onNameChange(v: String) = set { it.copy(myName = v.trim().take(12)) }

    private fun requireName(): Boolean {
        val ok = state.value.myName.isNotBlank()
        if (!ok) banner(R.string.err_name_required)
        return ok
    }

    // ================================ چرخهٔ عمر اتاق ================================

    /** ساختن اتاق: GameCore + وب‌سرور مهمان‌ها + نمایش لابی میزبان */
    fun hostGame() = onLogic {
        if (!requireName() || server != null) return@onLogic

        val c = GameCore {
            // هر تغییر در core → هم رندر اپ میزبان، هم پخش اسنپ‌شات به مرورگرها
            logic.execute {
                render()
                server?.broadcastChanged()
            }
        }
        core = c
        c.initHost(state.value.myName)

        try {
            server = WebGameServer(app, c, ::onLogic).also { it.startUp() }
        } catch (e: Exception) {
            core = null
            banner(R.string.err_host_failed)
            return@onLogic
        }

        val ip = NetUtils.localIp() ?: "?"
        set {
            it.copy(
                screen = Screen.HOST_LOBBY,
                iAmHost = true,
                roomName = app.getString(R.string.room_name_format, state.value.myName),
                hostUrl = "http://$ip:${Rules.HTTP_PORT}",
            )
        }
        render()
    }

    fun startGame() = onLogic {
        val c = core ?: return@onLogic
        if (!c.startGameByHost()) banner(R.string.need_two_players)
    }

    fun submitSecret(raw: String) = onLogic {
        val c = core ?: return@onLogic
        val code = normalizeDigits(raw)
        if (!isValidCode(code)) {
            banner(R.string.err_bad_secret)
            return@onLogic
        }
        if (c.setSecret(GameCore.HOST_ID, code)) {
            hostSecret = code
        }
    }

    fun submitGuess(raw: String) = onLogic {
        val c = core ?: return@onLogic
        if (!state.value.roundOpen || state.value.iSolved) return@onLogic
        if (state.value.guessesLeft <= 0) {
            banner(R.string.err_guesses_over)
            return@onLogic
        }
        val g = normalizeDigits(raw)
        if (isValidCode(g)) c.guess(GameCore.HOST_ID, g)
    }

    fun nextRound() = onLogic {
        val c = core ?: return@onLogic
        if (state.value.lastRound) c.finishGameByHost() else c.nextRoundByHost()
    }

    fun finishGame() = onLogic { core?.finishGameByHost() }

    /** بستن اتاق + بازگشت به خانه */
    fun leaveGame() = onLogic {
        server?.shutDown()
        server = null
        core = null
        hostSecret = ""
        lastKnownRound = 0
        set { UiState(myName = it.myName) }
    }

    // ================================ رندر core → UI ================================

    private fun render() {
        val c = core ?: return
        if (c.round != lastKnownRound) {
            lastKnownRound = c.round
            hostSecret = ""
        }

        val screen = when (c.phase) {
            GameCore.Phase.LOBBY -> Screen.HOST_LOBBY
            GameCore.Phase.WAIT_SECRET ->
                if (c.holderId == GameCore.HOST_ID) Screen.SECRET else Screen.GAME
            GameCore.Phase.OPEN ->
                if (c.holderId == GameCore.HOST_ID) Screen.SPECTATE else Screen.GAME
            GameCore.Phase.RESULT -> Screen.RESULT
            GameCore.Phase.FINAL -> Screen.FINAL
        }

        set {
            it.copy(
                screen = screen,
                players = c.playerList(),
                round = c.round,
                totalRounds = c.totalRounds(),
                holderId = c.holderId,
                holderName = if (c.holderId >= 0) c.nameOf(c.holderId) else "",
                maxGuesses = Rules.MAX_GUESSES,
                roundOpen = c.phase == GameCore.Phase.OPEN,
                mySecret = hostSecret,
                myHistory = c.historyOf(GameCore.HOST_ID),
                guessesLeft = c.guessesLeftOf(GameCore.HOST_ID),
                iSolved = c.isSolved(GameCore.HOST_ID),
                progressAll = c.progressList(),
                resultWinnerId = c.resultWinnerId,
                resultWinnerName = c.winnerName(),
                resultHolderPoint = c.resultHolderPoint,
                resultVoid = c.phase == GameCore.Phase.RESULT && c.resultWinnerId == -1,
                revealedSecret = c.revealedSecret,
                lastRound = c.lastRound,
                scores = c.scoreList(),
                champions = if (c.phase == GameCore.Phase.FINAL) c.champions() else emptyList(),
            )
        }
    }

    override fun onCleared() {
        server?.shutDown()
        logic.shutdown()
        super.onCleared()
    }
}
