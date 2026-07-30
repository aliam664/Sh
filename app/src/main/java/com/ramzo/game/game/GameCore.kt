package com.ramzo.game.game

/**
 * مدل‌های مشترک — بین اپ میزبان (Compose) و مهمان‌های مرورگری (WebSocket).
 * منبع واحد حقیقت بازی فقط GameCore است؛ UIها فقط بازتاب‌اند.
 */
class GuessEntry(val guess: String, val tiles: List<Int>, val solved: Boolean)
class PlayerProgress(val id: Int, val name: String, val used: Int, val solved: Boolean)
class ScoreEntry(val id: Int, val name: String, val score: Int)
class RoomPlayer(val id: Int, val name: String, val isHost: Boolean)

/**
 * هستهٔ معتمد بازی «رمزو» — بدون هیچ وابستگی به UI یا شبکه.
 *
 * هر تغییر حالت در پایان دستور، [notifyChanged] را صدا می‌زند؛ لایه‌های بیرون
 * (ViewModel برای اپ میزبان و WebGameServer برای مهمان‌ها) همان لحظه اسنپ‌شات
 * شخصی‌سازی‌شده می‌سازند و می‌فرستند.
 *
 * ⚠️ همهٔ متدها باید روی «رشتهٔ منطقی تکی» صاحب GameCore صدا زده شوند.
 */
class GameCore(private val notifyChanged: () -> Unit) {

    enum class Phase {
        LOBBY,        // بازیکنان جمع می‌شوند
        WAIT_SECRET,  // در انتظار رمز صاحب رمز
        OPEN,         // حدس‌زدن باز است
        RESULT,       // نتیجهٔ دور
        FINAL,        // صفحهٔ قهرمان
    }

    // ---------- ثبت‌نام ----------
    private val players = LinkedHashMap<Int, Player>()          // ترتیب ورود حفظ می‌شود
    private val holderOrder = ArrayList<Int>()                  // چرخهٔ صاحب‌رمزی
    private var nextGuestId = 1

    class Player(val id: Int, var name: String, val connected: Boolean)

    fun playerList(): List<RoomPlayer> =
        players.values.filter { it.connected }
            .map { RoomPlayer(it.id, it.name, it.id == HOST_ID) }

    fun playerCount(): Int = players.values.count { it.connected }

    fun hostId(): Int = HOST_ID

    fun nameOf(id: Int): String = players[id]?.name ?: "؟"

    // ---------- وضعیت دور ----------
    var phase = Phase.LOBBY
        private set
    var round = 0
        private set
    var holderId = -1
        private set
    var lastRound = false
        private set
    var resultWinnerId = Int.MIN_VALUE   // MIN_VALUE = هنوز نتیجه‌ای نیست
        private set
    var resultHolderPoint = false
        private set
    var revealedSecret = ""
        private set

    private val scores = LinkedHashMap<Int, Int>()
    private val used = HashMap<Int, Int>()
    private val solvedSet = HashSet<Int>()
    private val history = HashMap<Int, MutableList<GuessEntry>>()  // جدیدترین اول

    // ================================ ورود/خروج بازیکن ================================

    /** میزبان (id=0) هنگام ساختن اتاق */
    fun initHost(name: String) {
        players.clear(); holderOrder.clear()
        scores.clear(); used.clear(); solvedSet.clear(); history.clear()
        players[HOST_ID] = Player(HOST_ID, clean(name), true)
        holderOrder.add(HOST_ID)
        scores[HOST_ID] = 0
        phase = Phase.LOBBY
        round = 0; holderId = -1; lastRound = false
        resultWinnerId = Int.MIN_VALUE; revealedSecret = ""
        notifyChanged()
    }

    /** مهمان جدید — فقط وقتی لابی باز است؛ -1 یعنی رد شد */
    fun tryAddGuest(name: String): GuestJoin {
        if (phase != Phase.LOBBY) return GuestJoin(ErrCodes.GAME_STARTED, -1)
        if (playerCount() >= Rules.MAX_PLAYERS) return GuestJoin(ErrCodes.ROOM_FULL, -1)
        val id = nextGuestId++
        players[id] = Player(id, clean(name).ifBlank { "بازیکن $id" }, true)
        holderOrder.add(id)
        scores[id] = 0
        notifyChanged()
        return GuestJoin(null, id)
    }

    class GuestJoin(val errorCode: String?, val playerId: Int)

    /** قطع‌شدن مهمان (سوکت بسته شد) */
    fun guestLeft(id: Int) {
        val p = players[id] ?: return
        players[id] = Player(p.id, p.name, false)
        holderOrder.remove(id)

        when (phase) {
            Phase.WAIT_SECRET, Phase.OPEN -> {
                if (id == holderId) {
                    endRound(solvedBy = null, void = true)     // ابطال دور
                } else {
                    used[id] = Rules.MAX_GUESSES                // قفل‌نشدن دور
                    if (allGuessersDone()) endRound(solvedBy = null, void = false)
                    else notifyChanged()
                }
            }

            Phase.LOBBY -> {
                players.remove(id); scores.remove(id); history.remove(id)
                notifyChanged()
            }

            else -> notifyChanged()
        }
    }

    // ================================ جریان بازی ================================

    /** دکمهٔ شروع میزبان — false یعنی شرط حداقل بازیکن برقرار نیست */
    fun startGameByHost(): Boolean {
        if (phase != Phase.LOBBY || playerCount() < Rules.MIN_PLAYERS) return false
        scores.keys.forEach { scores[it] = 0 }
        startRound(1)
        return true
    }

    private fun startRound(roundNo: Int) {
        used.clear(); solvedSet.clear(); history.clear()
        secret = null
        round = roundNo
        holderId = holderOrder[(roundNo - 1) % holderOrder.size]
        phase = Phase.WAIT_SECRET
        resultWinnerId = Int.MIN_VALUE
        resultHolderPoint = false
        revealedSecret = ""
        notifyChanged()
    }

    /** صاحب رمز رمزش را قفل می‌کند */
    fun setSecret(playerId: Int, code: String): Boolean {
        if (phase != Phase.WAIT_SECRET || playerId != holderId) return false
        if (!isValidCode(code)) return false
        secret = code
        phase = Phase.OPEN
        notifyChanged()
        return true
    }

    /** یک حدس — اگر معتبر نباشد null برمی‌گردد */
    fun guess(playerId: Int, code: String): GuessEntry? {
        if (phase != Phase.OPEN) return null
        if (playerId == holderId || solvedSet.contains(playerId)) return null
        val p = players[playerId]
        if (p == null || !p.connected) return null
        if (!isValidCode(code)) return null

        val newUsed = (used[playerId] ?: 0) + 1
        if (newUsed > Rules.MAX_GUESSES) return null
        used[playerId] = newUsed

        val tiles = Evaluator.evaluate(secret!!, code)
        val solved = Evaluator.isSolved(tiles)
        if (solved) solvedSet.add(playerId)

        val entry = GuessEntry(code, tiles.toList(), solved)
        history.getOrPut(playerId) { mutableListOf() }.add(0, entry)

        if (solved) {
            endRound(solvedBy = playerId, void = false)
        } else if (allGuessersDone()) {
            endRound(solvedBy = null, void = false)
        } else {
            notifyChanged()
        }
        return entry
    }

    private fun allGuessersDone(): Boolean {
        val guessers = holderOrder.filter { it != holderId }
        if (guessers.isEmpty()) return false
        return guessers.all { solvedSet.contains(it) || (used[it] ?: 0) >= Rules.MAX_GUESSES }
    }

    private fun endRound(solvedBy: Int?, void: Boolean) {
        val winnerId: Int
        when {
            void -> { winnerId = -1; resultHolderPoint = false }
            solvedBy != null -> { winnerId = solvedBy; resultHolderPoint = false }
            Rules.HOLDER_POINT_IF_UNSOLVED -> { winnerId = holderId; resultHolderPoint = true }
            else -> { winnerId = -1; resultHolderPoint = false }
        }
        if (winnerId >= 0 && scores.containsKey(winnerId)) {
            scores[winnerId] = (scores[winnerId] ?: 0) + 1
        }

        resultWinnerId = winnerId
        revealedSecret = if (void) "—" else (secret ?: "؟")
        lastRound = round >= holderOrder.size
        phase = Phase.RESULT
        notifyChanged()
    }

    /** دکمهٔ دور بعدی میزبان (در آخرین دور صدا زده نمی‌شود؛ finishGameByHost بجایش) */
    fun nextRoundByHost() {
        if (phase == Phase.RESULT && !lastRound) startRound(round + 1)
    }

    /** پایان بازی و محاسبهٔ قهرمان(ان) */
    fun finishGameByHost() {
        if (phase != Phase.RESULT || !lastRound) return
        phase = Phase.FINAL
        notifyChanged()
    }

    // ================================ نمای‌ها (برای اسنپ‌شات) ================================

    fun historyOf(playerId: Int): List<GuessEntry> = history[playerId] ?: emptyList()

    fun guessesLeftOf(playerId: Int): Int =
        (Rules.MAX_GUESSES - (used[playerId] ?: 0)).coerceAtLeast(0)

    fun isSolved(playerId: Int): Boolean = solvedSet.contains(playerId)

    fun progressList(): List<PlayerProgress> {
        if (phase == Phase.LOBBY) return emptyList()
        return players.values
            .filter { it.connected && it.id != holderId && scores.containsKey(it.id) }
            .map {
                PlayerProgress(it.id, it.name, used[it.id] ?: 0, solvedSet.contains(it.id))
            }
    }

    fun scoreList(): List<ScoreEntry> =
        scores.entries
            .map { (id, sc) -> ScoreEntry(id, players[id]?.name ?: "؟", sc) }
            .sortedWith(compareByDescending<ScoreEntry> { it.score }.thenBy { it.id })

    fun champions(): List<String> {
        val list = scoreList()
        val max = list.maxOfOrNull { it.score } ?: 0
        return list.filter { it.score == max }.map { it.name }
    }

    fun totalRounds(): Int = maxOf(holderOrder.size, round)

    fun winnerName(): String =
        if (resultWinnerId >= 0) nameOf(resultWinnerId) else "—"

    fun mySecretFor(playerId: Int): String =
        if (playerId == holderId) secret ?: "" else ""

    private fun clean(name: String) = name.trim().take(12)

    companion object {
        const val HOST_ID = 0
    }
}
