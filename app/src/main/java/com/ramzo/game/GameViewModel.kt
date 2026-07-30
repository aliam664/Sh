package com.ramzo.game

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.ramzo.game.game.ErrCodes
import com.ramzo.game.game.Evaluator
import com.ramzo.game.game.Rules
import com.ramzo.game.game.isValidCode
import com.ramzo.game.game.normalizeDigits
import com.ramzo.game.net.FoundRoom
import com.ramzo.game.net.LanClient
import com.ramzo.game.net.LanHost
import com.ramzo.game.net.Msg
import com.ramzo.game.net.NetPlayer
import com.ramzo.game.net.RoomAdvertiser
import com.ramzo.game.net.RoomScanner
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import java.util.concurrent.Callable
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

// ---------- مدل‌های UI ----------

enum class Screen { HOME, HOST_LOBBY, CLIENT_LOBBY, SECRET, GAME, SPECTATE, RESULT, FINAL }

/** یک حدس ثبت‌شده با رنگ‌بندی ارقام */
class GuessEntry(val guess: String, val tiles: List<Int>, val solved: Boolean)

/** پیشرفت عمومی یک حدس‌زننده (بدون محتوای حدس) */
class PlayerProgress(val id: Int, val name: String, val used: Int, val solved: Boolean)

class ScoreEntry(val id: Int, val name: String, val score: Int)

data class UiState(
    val screen: Screen = Screen.HOME,
    // هویت
    val myName: String = "",
    val myId: Int = -1,
    val iAmHost: Boolean = false,
    // اتاق
    val roomName: String = "",
    val hostIp: String = "",
    val players: List<NetPlayer> = emptyList(),
    val foundRooms: List<FoundRoom> = emptyList(),
    val connecting: Boolean = false,
    // دور
    val round: Int = 0,
    val totalRounds: Int = 0,
    val holderId: Int = -1,
    val holderName: String = "",
    val maxGuesses: Int = Rules.MAX_GUESSES,
    val roundOpen: Boolean = false,      // رمز قفل شده و حدس‌زدن باز است
    val mySecret: String = "",
    // حدس‌های من
    val myHistory: List<GuessEntry> = emptyList(),
    val guessesLeft: Int = Rules.MAX_GUESSES,
    val iSolved: Boolean = false,
    // پیشرفت بقیه (حدس‌زننده‌ها)
    val progressAll: List<PlayerProgress> = emptyList(),
    // نتیجهٔ دور
    val resultWinnerId: Int = Int.MIN_VALUE, // MIN_VALUE یعنی هنوز نتیجه‌ای نیست
    val resultWinnerName: String = "",
    val resultHolderPoint: Boolean = false,  // امتیاز به صاحب رمز رسید
    val resultVoid: Boolean = false,         // دور باطل (خروج صاحب رمز)
    val revealedSecret: String = "",
    val lastRound: Boolean = false,
    // امتیازات و فینال
    val scores: List<ScoreEntry> = emptyList(),
    val champions: List<String> = emptyList(),
    // اطلاع‌رسانی
    val banner: String? = null,
)

/**
 * قلب رمزو — تک ViewModel که دو نقش «میزبان» و «کلاینت» را پوشش می‌دهد.
 *
 * قانون طلایی هم‌زمانی: همهٔ رویدادهای شبکه و اکشن‌های کاربر روی یک «رشتهٔ
 * منطقی تکی» پردازش می‌شوند؛ پس منطق داوری/امتیاز هیچ قفل و Race ندارد.
 * نوشتن/خواندن سوکت روی رشته‌های خودش است (داخل LanHost/LanClient).
 */
class GameViewModel(application: Application) : AndroidViewModel(application) {

    private val app = application

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state

    // ---------- زیرساخت ----------
    private val logic = Executors.newSingleThreadExecutor { r -> Thread(r, "ramzo-logic") }
    private var host: LanHost? = null
    private var client: LanClient? = null
    private var advertiser: RoomAdvertiser? = null
    private var scanner: RoomScanner? = null

    // ---------- وضعیت سرور (فقط میزبان، فقط روی رشتهٔ منطقی) ----------
    private val names = HashMap<Int, String>()          // حتی پس از خروج بازیکن، برای جدول امتیاز
    private val order = ArrayList<Int>()                 // ترتیب ورود = ترتیب چرخش صاحب‌رمزی
    private val scoresMap = HashMap<Int, Int>()
    private val guessesUsed = HashMap<Int, Int>()
    private val solvedThisRound = HashSet<Int>()
    private var secret: String? = null
    private var secretReady = false
    private var roundActive = false
    private var clientToldHostClosed = false
    private var expectControlledClose = false

    private val stateLock = Any()

    init {
        startScanner()
    }

    // ================================ ابزار وضعیت ================================

    private inline fun set(crossinline f: (UiState) -> UiState) {
        synchronized(stateLock) { _state.value = f(_state.value) }
    }

    private inline fun onLogic(crossinline block: () -> Unit) {
        logic.execute {
            try {
                block()
            } catch (t: Throwable) {
                banner(R.string.err_connection_lost)
            }
        }
    }

    /** از رشتهٔ I/O سوکت: سؤال هم‌زمان از رشتهٔ منطقی (فقط برای onClientHello) */
    private fun <T> awaitLogic(call: () -> T): T =
        logic.submit(Callable { call() }).get(3, TimeUnit.SECONDS)

    private fun banner(res: Int, vararg args: Any) {
        val text = if (args.isEmpty()) app.getString(res) else app.getString(res, *args)
        bannerText(text)
    }

    private fun bannerText(text: String) {
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

    // ================================ کشف اتاق (کلاینت) ================================

    private fun startScanner() {
        if (scanner != null) return
        scanner = RoomScanner(app) { rooms -> set { s -> s.copy(foundRooms = rooms) } }
        scanner?.start()
    }

    private fun stopScanner() {
        scanner?.stop()
        scanner = null
        set { it.copy(foundRooms = emptyList()) }
    }

    fun joinRoom(room: FoundRoom) = onLogic {
        if (requireName()) join(room.host)
    }

    fun joinByIp(rawIp: String) = onLogic {
        if (!requireName()) return@onLogic
        val ip = normalizeDigits(rawIp.trim())
        val parts = ip.split(".")
        val valid = parts.size == 4 && parts.all { p ->
            p.isNotEmpty() && p.length <= 3 && p.all { c -> c in '0'..'9' } && p.toInt() in 0..255
        }
        if (!valid) banner(R.string.err_invalid_ip) else join(ip)
    }

    private fun join(ip: String) {
        clientToldHostClosed = false
        expectControlledClose = false
        set { it.copy(connecting = true) }
        val c = LanClient(clientListener)
        client = c
        c.connect(ip, state.value.myName)
    }

    // ================================ میزبانی ================================

    fun hostGame() = onLogic {
        if (!requireName()) return@onLogic
        val h = LanHost(hostListener)
        try {
            h.start()
        } catch (e: Exception) {
            banner(R.string.err_host_failed)
            return@onLogic
        }
        host = h

        val name = state.value.myName
        val ip = LanHost.localIp() ?: "؟"
        val room = app.getString(R.string.room_name_format, name)

        names.clear(); order.clear(); scoresMap.clear()
        names[0] = name
        order.add(0)
        scoresMap[0] = 0

        advertiser?.stop()
        advertiser = RoomAdvertiser(room, ip).also { it.start() }
        stopScanner()

        set {
            it.copy(
                screen = Screen.HOST_LOBBY,
                myId = 0, iAmHost = true,
                roomName = room, hostIp = ip,
                players = listOf(NetPlayer(0, name, true)),
                scores = listOf(ScoreEntry(0, name, 0)),
            )
        }
    }

    /** دکمهٔ «شروع بازی» میزبان */
    fun startGame() = onLogic {
        val me = host ?: return@onLogic
        if (order.size < Rules.MIN_PLAYERS) {
            banner(R.string.need_two_players)
            return@onLogic
        }
        advertiser?.stop()
        scoresMap.keys.forEach { scoresMap[it] = 0 } // بازی تازه، امتیاز صفر
        setRound(roundNo = 1, viaHost = me)
    }

    /** دکمهٔ «دور بعدی» میزبان در صفحهٔ نتیجه */
    fun nextRound() = onLogic {
        val me = host ?: return@onLogic
        if (state.value.lastRound) {
            finishGame()
            return@onLogic
        }
        setRound(roundNo = state.value.round + 1, viaHost = me)
    }

    /** آماده‌سازی ِ دور جدید + اطلاع به همه */
    private fun setRound(roundNo: Int, viaHost: LanHost) {
        guessesUsed.clear()
        solvedThisRound.clear()
        secret = null
        secretReady = false
        roundActive = true

        val holder = order[(roundNo - 1) % order.size]
        val holderName = names[holder] ?: "؟"

        viaHost.broadcast(Msg.RoundStart(roundNo, holder, holderName, Rules.MAX_GUESSES))
        // خودِ میزبان هم باید UI‌اش تنظیم شود
        applyRoundStartLocally(roundNo, holder, holderName)
    }

    /** منطق مشترک رفتن به دور جدید (هم میزبان هم کلاینت) */
    private fun applyRoundStartLocally(roundNo: Int, holder: Int, holderName: String) {
        val iAmHolder = holder == state.value.myId
        val guessers = state.value.players
            .filter { it.id != holder }
            .map { PlayerProgress(it.id, it.name, 0, false) }
        // کلاینت order ندارد؛ تعداد دورها از لیست بازیکنان (حداقل شمارهٔ دور فعلی) استنباط می‌شود
        val total = maxOf(state.value.players.size, roundNo)
        set {
            it.copy(
                screen = if (iAmHolder) Screen.SECRET else Screen.GAME,
                round = roundNo,
                totalRounds = total,
                holderId = holder, holderName = holderName,
                maxGuesses = Rules.MAX_GUESSES,
                roundOpen = false,
                mySecret = "",
                myHistory = emptyList(),
                guessesLeft = Rules.MAX_GUESSES,
                iSolved = false,
                progressAll = guessers,
                resultWinnerId = Int.MIN_VALUE,
                resultVoid = false, resultHolderPoint = false,
                revealedSecret = "",
                lastRound = false,
            )
        }
    }

    // ================================ ارسال رمز / حدس ================================

    /** صاحب رمز: قفل‌کردن رمز (هر دو نقش) */
    fun submitSecret(raw: String) = onLogic {
        val code = normalizeDigits(raw)
        if (!isValidCode(code)) {
            banner(R.string.err_bad_secret)
            return@onLogic
        }
        if (state.value.iAmHost) {
            hostAcceptSecret(code)
        } else {
            // رمز را محلی هم نگه می‌داریم تا صفحهٔ ناظر (پس از تأیید سرور) آن را نشان دهد
            set { it.copy(mySecret = code) }
            client?.send(Msg.SetSecret(code))
        }
    }

    private fun hostAcceptSecret(code: String) {
        secret = code
        secretReady = true
        host?.broadcast(Msg.Progress(Rules.SIGNAL_SECRET_READY, 0, false))
        set { it.copy(screen = Screen.SPECTATE, mySecret = code, roundOpen = true) }
    }

    /** حدس‌زننده: ارسال حدس (هر دو نقش) */
    fun submitGuess(raw: String) = onLogic {
        val s = state.value
        if (!s.roundOpen || s.iSolved || s.guessesLeft <= 0) return@onLogic
        val g = normalizeDigits(raw)
        if (!isValidCode(g)) return@onLogic
        if (s.iAmHost) {
            handleGuess(0, g)   // میزبانِ حدس‌زننده — همان مسیر کلاینت‌ها
        } else {
            client?.send(Msg.Guess(g))
        }
    }

    // ================================ داوری — فقط میزبان ================================

    private fun handleGuess(playerId: Int, guess: String) {
        if (!roundActive || !secretReady) return
        val holder = state.value.holderId
        if (playerId == holder || solvedThisRound.contains(playerId)) return
        if (!scoresMap.containsKey(playerId)) return // بازیکن غریبه/رفته

        val used = (guessesUsed[playerId] ?: 0)
        if (used >= Rules.MAX_GUESSES) {
            replyTo(playerId, Msg.Err(ErrCodes.GUESSES_OVER))
            return
        }

        val newUsed = used + 1
        guessesUsed[playerId] = newUsed

        val tiles = Evaluator.evaluate(secret!!, guess)
        val solved = Evaluator.isSolved(tiles)
        if (solved) solvedThisRound.add(playerId)

        replyTo(playerId, Msg.GuessResult(guess, tiles, solved, Rules.MAX_GUESSES - newUsed))
        host?.broadcast(Msg.Progress(playerId, newUsed, solved))
        applyProgressLocally(playerId, newUsed, solved)

        if (solved) {
            endRound(solvedBy = playerId, void = false)
        } else if (allGuessersDone(holder)) {
            endRound(solvedBy = null, void = false) // سقف حدس‌ها تمام شد
        }
    }

    /** آیا همهٔ حدس‌زننده‌ها (به‌جز صاحب رمز) یا حل کرده‌اند یا سقفشان تمام شده؟ */
    private fun allGuessersDone(holder: Int): Boolean {
        val guessers = order.filter { it != holder }
        if (guessers.isEmpty()) return false
        return guessers.all { id ->
            solvedThisRound.contains(id) || (guessesUsed[id] ?: 0) >= Rules.MAX_GUESSES
        }
    }

    private fun endRound(solvedBy: Int?, void: Boolean) {
        roundActive = false
        val holder = state.value.holderId

        val winnerId: Int
        val holderPoint: Boolean
        when {
            void -> { winnerId = -1; holderPoint = false }
            solvedBy != null -> { winnerId = solvedBy; holderPoint = false }
            Rules.HOLDER_POINT_IF_UNSOLVED -> { winnerId = holder; holderPoint = true }
            else -> { winnerId = -1; holderPoint = false }
        }
        if (winnerId >= 0) scoresMap[winnerId] = (scoresMap[winnerId] ?: 0) + 1

        val total = order.size
        val roundNo = state.value.round
        // دور آخر وقتی شمارهٔ دور به تعداد بازیکنانِ فعلی رسیده باشد
        // (اگر کسی رفته باشد، order کوچک‌تر شده و این مقایسه همچنان درست کار می‌کند)
        val last = roundNo >= total
        val nextHolder = if (!last) order[roundNo % total] else -1

        val revealed = if (void) "—" else (secret ?: "؟")
        val winnerName = if (winnerId >= 0) names[winnerId] ?: "؟" else "—"

        host?.broadcast(
            Msg.RoundEnd(winnerId, winnerName, revealed, HashMap(scoresMap), nextHolder, last)
        )
        applyRoundEndLocally(winnerId, winnerName, revealed, holderPoint, last)
    }

    private fun applyRoundEndLocally(
        winnerId: Int, winnerName: String, revealed: String, holderPoint: Boolean, last: Boolean,
    ) {
        val scoreList = scoresMapScoreList()
        set {
            it.copy(
                screen = Screen.RESULT,
                resultWinnerId = winnerId,
                resultWinnerName = winnerName,
                resultHolderPoint = holderPoint,
                resultVoid = winnerId == -1,
                revealedSecret = revealed,
                lastRound = last,
                scores = scoreList,
                roundOpen = false,
            )
        }
    }

    private fun scoresMapScoreList(): List<ScoreEntry> =
        scoresMap.entries
            .map { (id, sc) -> ScoreEntry(id, names[id] ?: "؟", sc) }
            .sortedWith(compareByDescending<ScoreEntry> { it.score }.thenBy { it.id })

    /** قهرمان نهایی (ممکن است مشترک باشد) */
    fun finishGame() = onLogic {
        val list = scoresMapScoreList()
        val max = list.maxOfOrNull { it.score } ?: 0
        val champs = list.filter { it.score == max }.map { it.name }
        set { it.copy(screen = Screen.FINAL, scores = list, champions = champs) }
    }

    /** پاسخ پیام به یک بازیکن — اگر خودِ میزبان است محلی اعمال می‌شود */
    private fun replyTo(playerId: Int, msg: Msg) {
        if (playerId == 0) {
            when (msg) {
                is Msg.GuessResult -> applyGuessResultLocally(msg)
                is Msg.Err -> if (msg.code == ErrCodes.GUESSES_OVER) banner(R.string.err_guesses_over)
                else -> Unit
            }
        } else {
            host?.sendTo(playerId, msg)
        }
    }

    // ================================ لایسنسِ میزبان برای LanHost ================================

    private val hostListener = object : LanHost.Listener {

        override fun onClientHello(clientId: Int, name: String, proto: Int): String? = awaitLogic {
            when {
                proto != Rules.PROTO -> ErrCodes.PROTO_MISMATCH
                order.size >= Rules.MAX_PLAYERS -> ErrCodes.ROOM_FULL
                roundActive -> ErrCodes.GAME_STARTED // v1: ورود وسط بازی نداریم — از دور بعدی/اتاق بعد
                else -> {
                    val cleanName = name.trim().take(12).ifBlank { "بازیکن $clientId" }
                    names[clientId] = cleanName
                    order.add(clientId)
                    scoresMap[clientId] = 0

                    host?.sendTo(clientId, Msg.Welcome(clientId, state.value.roomName))
                    broadcastLobbyToAll()
                    banner(R.string.joined_game_notice, cleanName)
                    null
                }
            }
        }

        override fun onClientSecret(clientId: Int, secret: String) = onLogic {
            if (!roundActive || secretReady) return@onLogic
            if (clientId != state.value.holderId) return@onLogic
            val code = normalizeDigits(secret)
            if (!isValidCode(code)) {
                host?.sendTo(clientId, Msg.SecretAck(false, ErrCodes.BAD_SECRET))
                return@onLogic
            }
            secret = code
            secretReady = true
            host?.sendTo(clientId, Msg.SecretAck(true))
            host?.broadcast(Msg.Progress(Rules.SIGNAL_SECRET_READY, 0, false))
            set { it.copy(roundOpen = true) } // نمای میزبان (اگر حدس‌زننده بود)
        }

        override fun onClientGuess(clientId: Int, guess: String) = onLogic {
            handleGuess(clientId, normalizeDigits(guess))
        }

        override fun onClientGone(clientId: Int) = onLogic {
            val name = names[clientId] ?: return@onLogic
            val wasHolder = clientId == state.value.holderId && roundActive

            order.remove(clientId)
            // نام و امتیازش برای جدول می‌ماند (scoresMap/names دست‌نخورده)

            if (roundActive) {
                if (wasHolder) {
                    // خروج صاحب رمز وسط دور → دور باطل
                    guessesUsed.clear(); solvedThisRound.clear()
                    secretReady = false
                    endRound(solvedBy = null, void = true)
                } else {
                    // حدس‌هایش «مصرف‌شده» تلقی می‌شود تا دور قفل نشود
                    guessesUsed[clientId] = Rules.MAX_GUESSES
                    host?.broadcast(Msg.Progress(clientId, Rules.MAX_GUESSES, false))
                    applyRoundEndIfDone()
                }
            }
            broadcastLobbyToAll()
            banner(R.string.left_game_notice, name)
        }
    }

    private fun applyRoundEndIfDone() {
        if (roundActive && allGuessersDone(state.value.holderId)) {
            endRound(solvedBy = null, void = false)
        }
    }

    private fun broadcastLobbyToAll() {
        val list = order.map { id -> NetPlayer(id, names[id] ?: "؟", id == 0) }
        host?.broadcast(Msg.Lobby(list))
        set { it.copy(players = list, roomName = it.roomName) }
    }

    // ================================ سمت کلاینت ================================

    private val clientListener = object : LanClient.Listener {

        override fun onMessage(msg: Msg) = onLogic { handleClientMessage(msg) }

        override fun onDisconnected(reason: String) = onLogic {
            val wasInGame = state.value.screen != Screen.HOME
            client?.close()
            client = null
            when {
                expectControlledClose -> {
                    expectControlledClose = false
                    set { it.copy(connecting = false) }
                }

                wasInGame || state.value.connecting -> {
                    goHome()
                    if (clientToldHostClosed) banner(R.string.err_host_closed)
                    else if (reason == "closed") banner(R.string.err_connection_lost)
                    else banner(R.string.err_connect_failed)
                }
            }
        }
    }

    /**
     * خطاهای کنترل‌شدهٔ ورود (اتاق پر/نسخه/بازی شروع‌شده) — بعدش سوکت را خودمان
     * می‌بندیم، پس بنر «اتصال قطع شد» نباید روی پیام اصلی بنشیند.
     */
    private fun handleClientMessage(msg: Msg) {
        when (msg) {
            is Msg.Welcome -> {
                stopScanner()
                set {
                    it.copy(
                        myId = msg.playerId,
                        iAmHost = false,
                        roomName = msg.room,
                        screen = Screen.CLIENT_LOBBY,
                        connecting = false,
                    )
                }
            }

            is Msg.Err -> {
                when (msg.code) {
                    ErrCodes.ROOM_FULL -> banner(R.string.err_room_full, Rules.MAX_PLAYERS)
                    ErrCodes.PROTO_MISMATCH -> banner(R.string.err_proto_mismatch)
                    ErrCodes.GAME_STARTED -> banner(R.string.err_game_started)
                    ErrCodes.GUESSES_OVER -> banner(R.string.err_guesses_over)
                    else -> bannerText(msg.code)
                }
                if (msg.code == ErrCodes.ROOM_FULL ||
                    msg.code == ErrCodes.PROTO_MISMATCH ||
                    msg.code == ErrCodes.GAME_STARTED
                ) {
                    // بستن کنترل‌شده — بنر «قطع اتصال» سرکوب می‌شود
                    expectControlledClose = true
                    client?.close(); client = null
                    set { it.copy(connecting = false) }
                }
            }

            is Msg.Lobby -> set { it.copy(players = msg.players) }

            is Msg.RoundStart -> applyRoundStartLocally(msg.round, msg.holderId, msg.holderName)

            is Msg.SecretAck -> {
                if (msg.ok) set { it.copy(screen = Screen.SPECTATE) }
                else banner(R.string.err_bad_secret)
            }

            is Msg.GuessResult -> applyGuessResultLocally(msg)

            is Msg.Progress -> {
                if (msg.playerId == Rules.SIGNAL_SECRET_READY) {
                    set { it.copy(roundOpen = true) }
                } else {
                    applyProgressLocally(msg.playerId, msg.used, msg.solved)
                }
            }

            is Msg.RoundEnd -> {
                scoresMap.clear()
                names.clear()
                msg.scores.forEach { (id, sc) ->
                    scoresMap[id] = sc
                    names[id] = state.value.players.find { it.id == id }?.name
                        ?: names[id] ?: "؟"
                }
                // نام صاحب رمز/برنده ممکن است در players نباشد (رفته) — از order/name موجود
                applyRoundEndLocally(
                    msg.winnerId,
                    msg.winnerName.ifBlank { "؟" },
                    msg.secretRevealed,
                    msg.winnerId == state.value.holderId && msg.winnerId != -1,
                    msg.lastRound,
                )
            }

            is Msg.Bye -> clientToldHostClosed = true

            else -> Unit
        }
    }

    private fun applyGuessResultLocally(msg: Msg.GuessResult) {
        val entry = GuessEntry(msg.guess, msg.tiles.toList(), msg.solved)
        set {
            it.copy(
                myHistory = listOf(entry) + it.myHistory,
                guessesLeft = msg.left,
                iSolved = it.iSolved || msg.solved,
            )
        }
    }

    private fun applyProgressLocally(playerId: Int, used: Int, solved: Boolean) {
        set { s ->
            val existing = s.progressAll.toMutableList()
            val idx = existing.indexOfFirst { it.id == playerId }
            val name = existing.getOrNull(idx)?.name
                ?: s.players.find { it.id == playerId }?.name
                ?: names[playerId] ?: "؟"
            val updated = PlayerProgress(playerId, name, used, solved)
            if (idx >= 0) existing[idx] = updated else existing.add(updated)
            s.copy(progressAll = existing)
        }
    }

    // ================================ خروج و تمیزکاری ================================

    /** دکمهٔ خروج/پایان — هر نقشی */
    fun leaveGame() {
        onLogic {
            host?.let { h ->
                advertiser?.stop()
                advertiser = null
                h.shutdown("host_closed")
                host = null
            }
            client?.close()
            client = null
            goHome()
        }
    }

    private fun goHome() {
        roundActive = false
        clientToldHostClosed = false
        expectControlledClose = false
        names.clear(); order.clear(); scoresMap.clear()
        guessesUsed.clear(); solvedThisRound.clear()
        secret = null; secretReady = false
        set {
            UiState(myName = it.myName) // همه‌چیز ریست به‌جز نام کاربر
        }
        startScanner()
    }

    override fun onCleared() {
        advertiser?.stop()
        host?.shutdown()
        client?.close()
        scanner?.stop()
        logic.shutdown()
        super.onCleared()
    }
}
