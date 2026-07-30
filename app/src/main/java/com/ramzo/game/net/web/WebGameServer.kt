package com.ramzo.game.net.web

import android.content.Context
import com.ramzo.game.game.ErrCodes
import com.ramzo.game.game.GameCore
import com.ramzo.game.game.Rules
import fi.iki.elonen.NanoHTTPD
import fi.iki.elonen.NanoWSD
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap

/**
 * وب‌سرور مهمان‌ها — هستهٔ «بدون نصب»:
 *
 *  • GET /       → وب‌کلاینت رمزو (تک‌فایل HTML داخل assets) روی مرورگر مهمان
 *  • WS  /ws     → کانال زندهٔ JSON: اکشن‌های مهمان → GameCore ، اسنپ‌شات → مهمان
 *
 * اکشن‌های ورودی مهمان (روی WS):
 *   {"t":"hello","name":"سارا"}      ورود به لابی (فقط وقتی لابی باز است)
 *   {"t":"secret","s":"1125"}        فقط صاحب رمز
 *   {"t":"guess","g":"5211"}
 *
 * خروجی به هر مهمان: پیام "snap" (اسنپ‌شات شخصی‌سازی‌شده — ساختار در docs/architecture-fa.md)
 * و در صورت رد ورود: {"t":"err","code":"room_full|game_started"} سپس بستن سوکت.
 *
 * ⚠️ همهٔ تعامل با GameCore از طریق [submit] روی رشتهٔ منطقی تکی انجام می‌شود.
 */
class WebGameServer(
    private val context: Context,
    private val core: GameCore,
    private val submit: (() -> Unit) -> Unit,
    port: Int = Rules.HTTP_PORT,
) : NanoWSD(port) {

    fun interface CoreEvents {
        /** هر بار که GameCore تغییر کرد (روی رشتهٔ منطقی) صدا زده می‌شود */
        fun onChanged()
    }

    private val guests = ConcurrentHashMap<Int, GuestSocket>()
    private var indexCache: String? = null

    // ---------- عمر سرور ----------

    fun startUp() {
        start(NanoHTTPD.SOCKET_READ_TIMEOUT, true)
    }

    fun shutDown() {
        guests.values.forEach { it.closeQuiet() }
        guests.clear()
        stop()
    }

    fun broadcastChanged() {
        guests.values.forEach { g ->
            g.playerId.takeIf { it >= 0 }?.let { pid ->
                g.sendJson(snapshotFor(pid))
            }
        }
    }

    // ---------- HTTP ----------

    override fun serve(session: IHTTPSession): Response =
        if (isWebsocketRequested(session)) super.serve(session) else serveIndex()

    private fun serveIndex(): Response = runCatching {
        val html = indexCache ?: context.assets.open("web/index.html")
            .bufferedReader(Charsets.UTF_8).readText().also { indexCache = it }
        newFixedLengthResponse(
            Response.Status.OK, "text/html; charset=utf-8", html,
        )
    }.getOrElse {
        newFixedLengthResponse(
            Response.Status.INTERNAL_ERROR, "text/plain; charset=utf-8", "RAMZO: asset missing",
        )
    }

    // ---------- WebSocket ----------

    override fun newWebSocket(handshake: IHTTPSession): WebSocket = GuestSocket(handshake)

    private inner class GuestSocket(handshake: IHTTPSession) : NanoWSD.WebSocket(handshake) {

        @Volatile
        var playerId: Int = -1

        override fun onOpen() = Unit // تا hello نیاید، عضو اتاق نیستیم

        override fun onText(message: WebSocketFrame) {
            val text = message.textPayload ?: return
            submit { handleText(text) }
        }

        override fun onClose(
            code: WebSocketFrame.CloseCode,
            reason: String,
            initiatedByRemote: Boolean,
        ) {
            val id = playerId
            val self = this
            submit {
                if (id >= 0) {
                    guests.remove(id, self)
                    core.guestLeft(id)
                }
            }
        }

        override fun onPong(pong: WebSocketFrame) = Unit

        override fun onException(exception: java.io.IOException) = closeQuiet()

        @Synchronized
        fun sendJson(o: JSONObject) {
            if (isOpen) runCatching { send(o.toString()) }
        }

        fun closeQuiet() = runCatching {
            close(WebSocketFrame.CloseCode.NormalClosure, "", false)
        }

        /** روی رشتهٔ منطقی اجرا می‌شود */
        private fun handleText(text: String) {
            val o = runCatching { JSONObject(text) }.getOrNull() ?: return
            when (o.optString("t")) {

                "hello" -> {
                    if (playerId >= 0) return
                    val join = core.tryAddGuest(o.optString("name", ""))
                    if (join.errorCode != null) {
                        sendJson(JSONObject().put("t", "err").put("code", join.errorCode))
                        closeQuiet()
                    } else {
                        playerId = join.playerId
                        guests[playerId] = this
                        sendJson(snapshotFor(playerId))
                    }
                }

                "secret" -> if (playerId >= 0) core.setSecret(playerId, o.optString("s", ""))

                "guess" -> if (playerId >= 0) core.guess(playerId, o.optString("g", ""))
            }
        }
    }

    // ---------- اسنپ‌شات شخصی (JSON → مرورگر) ----------

    /** نمای فعلی بازی از چشم یک بازیکن مشخص — محتوای حساس فقط به همان بازیکن می‌رسد */
    fun snapshotFor(pid: Int): JSONObject {
        val o = JSONObject()
        o.put("t", "snap")
        o.put(
            "view", when (core.phase) {
                GameCore.Phase.LOBBY -> "lobby"
                GameCore.Phase.WAIT_SECRET -> if (pid == core.holderId) "secret" else "game"
                GameCore.Phase.OPEN -> if (pid == core.holderId) "spectate" else "game"
                GameCore.Phase.RESULT -> "result"
                GameCore.Phase.FINAL -> "final"
            },
        )

        // you
        val you = JSONObject()
            .put("id", pid)
            .put("name", core.nameOf(pid))
            .put("holder", pid == core.holderId)
            .put("host", pid == core.hostId())
            .put("left", core.guessesLeftOf(pid))
            .put("solved", core.isSolved(pid))
        core.mySecretFor(pid).takeIf { it.isNotEmpty() }?.let { you.put("secret", it) }
        o.put("you", you)

        // players (لابی)
        val playersArr = JSONArray()
        core.playerList().forEach { p ->
            playersArr.put(
                JSONObject().put("id", p.id).put("name", p.name).put("host", p.isHost),
            )
        }
        o.put("players", playersArr)

        // دور
        o.put("round", core.round)
        o.put("total", core.totalRounds())
        o.put("holder", core.nameOf(core.holderId))
        o.put("max", Rules.MAX_GUESSES)
        o.put("open", core.phase == GameCore.Phase.OPEN)

        // تاریخچهٔ خودم (جدیدترین اول)
        val hist = JSONArray()
        core.historyOf(pid).forEach { e ->
            val tiles = JSONArray(); e.tiles.forEach { tiles.put(it) }
            hist.put(JSONArray().put(e.guess).put(tiles).put(e.solved))
        }
        o.put("history", hist)

        // پیشرفت همهٔ حدس‌زننده‌ها
        val prog = JSONArray()
        core.progressList().forEach { p ->
            prog.put(
                JSONObject().put("id", p.id).put("name", p.name)
                    .put("used", p.used).put("solved", p.solved),
            )
        }
        o.put("progress", prog)

        // نتیجهٔ دور
        if (core.phase == GameCore.Phase.RESULT || core.phase == GameCore.Phase.FINAL) {
            val r = JSONObject()
                .put("winner", core.resultWinnerId)
                .put("name", core.winnerName())
                .put("holderPoint", core.resultHolderPoint)
                .put("void", core.resultWinnerId == -1)
                .put("secret", core.revealedSecret)
                .put("last", core.lastRound)
            o.put("result", r)
        }

        // جدول امتیاز + قهرمان
        val sc = JSONArray()
        core.scoreList().forEach { s ->
            sc.put(JSONObject().put("id", s.id).put("name", s.name).put("score", s.score))
        }
        o.put("scores", sc)
        if (core.phase == GameCore.Phase.FINAL) {
            val ch = JSONArray(); core.champions().forEach { ch.put(it) }
            o.put("champions", ch)
        }
        return o
    }
}
