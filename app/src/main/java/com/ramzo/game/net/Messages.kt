package com.ramzo.game.net

import com.ramzo.game.game.Rules
import org.json.JSONArray
import org.json.JSONObject

/**
 * پروتکل «رمزو» — پیام‌های JSON خط‌به‌خط (NDJSON) روی TCP.
 *
 * هر پیام یک شیء JSON با فیلد "t" (نوع) است. ستاره‌ای، میزبانِ معتمد:
 * کلاینت‌ها فقط hello/secret/guess می‌فرستند و بقیه از سرور می‌آید.
 *
 * (docs/architecture-fa.md — جدول کامل پیام‌ها)
 */

/** بازیکنِ شناخته‌شده روی شبکه */
class NetPlayer(
    val id: Int,
    val name: String,
    val isHost: Boolean,
)

sealed class Msg {
    abstract val type: String

    /** زیرکلاس‌ها فیلدهای خودشان را به JSON اضافه می‌کنند */
    protected open fun JSONObject.fill(): JSONObject = this

    fun encode(): String = JSONObject().put("t", type).fill().toString()

    // ---------- Client → Server ----------

    class Hello(val name: String, val proto: Int = Rules.PROTO) : Msg() {
        override val type = "hello"
        override fun JSONObject.fill() = apply { put("name", name); put("proto", proto) }
    }

    class SetSecret(val secret: String) : Msg() {
        override val type = "secret"
        override fun JSONObject.fill() = apply { put("s", secret) }
    }

    class Guess(val guess: String) : Msg() {
        override val type = "guess"
        override fun JSONObject.fill() = apply { put("g", guess) }
    }

    // ---------- Server → Client ----------

    class Welcome(val playerId: Int, val room: String) : Msg() {
        override val type = "welcome"
        override fun JSONObject.fill() = apply { put("id", playerId); put("room", room) }
    }

    class Lobby(val players: List<NetPlayer>) : Msg() {
        override val type = "lobby"
        override fun JSONObject.fill() = apply {
            val arr = JSONArray()
            players.forEach { p ->
                arr.put(JSONObject().put("id", p.id).put("name", p.name).put("host", p.isHost))
            }
            put("players", arr)
        }
    }

    class RoundStart(
        val round: Int,        // شمارهٔ دور از ۱
        val holderId: Int,
        val holderName: String,
        val maxGuesses: Int,
    ) : Msg() {
        override val type = "roundStart"
        override fun JSONObject.fill() = apply {
            put("round", round); put("holder", holderId)
            put("holderName", holderName); put("max", maxGuesses)
        }
    }

    class SecretAck(val ok: Boolean, val why: String = "") : Msg() {
        override val type = "secretAck"
        override fun JSONObject.fill() = apply { put("ok", ok); put("why", why) }
    }

    /** نتیجهٔ رنگ‌بندی — فقط برای صاحبِ حدس */
    class GuessResult(
        val guess: String,
        val tiles: IntArray,   // 0=سبز 1=زرد 2=قرمز
        val solved: Boolean,
        val left: Int,         // حدس‌های باقی‌مانده
    ) : Msg() {
        override val type = "result"
        override fun JSONObject.fill() = apply {
            val a = JSONArray(); tiles.forEach { a.put(it) }
            put("g", guess); put("c", a); put("solved", solved); put("left", left)
        }
        override fun toString() = encode()
    }

    /** پیشرفت عمومی (بدون محتوای حدس) — برای همه */
    class Progress(val playerId: Int, val used: Int, val solved: Boolean) : Msg() {
        override val type = "progress"
        override fun JSONObject.fill() = apply {
            put("id", playerId); put("used", used); put("solved", solved)
        }
    }

    class RoundEnd(
        val winnerId: Int,        // -1 یعنی دور بدون برنده (باطل/خروج صاحب رمز)
        val winnerName: String,
        val secretRevealed: String,
        val scores: Map<Int, Int>,
        val nextHolderId: Int,
        val lastRound: Boolean,
    ) : Msg() {
        override val type = "roundEnd"
        override fun JSONObject.fill() = apply {
            val arr = JSONArray()
            scores.forEach { (id, sc) -> arr.put(JSONObject().put("id", id).put("score", sc)) }
            put("winner", winnerId); put("winnerName", winnerName)
            put("secret", secretRevealed); put("scores", arr)
            put("nextHolder", nextHolderId); put("last", lastRound)
        }
    }

    class Bye(val why: String) : Msg() {
        override val type = "bye"
        override fun JSONObject.fill() = apply { put("why", why) }
    }

    class Err(val code: String) : Msg() {
        override val type = "err"
        override fun JSONObject.fill() = apply { put("code", code) }
    }

    companion object {
        /** خط → پیام؛ در صورت ناشناخته‌بودن null برمی‌گرداند */
        fun decode(line: String): Msg? = try {
            val o = JSONObject(line)
            when (o.getString("t")) {
                "hello" -> Hello(o.optString("name", "؟"), o.optInt("proto", 0))

                "secret" -> SetSecret(o.getString("s"))

                "guess" -> Guess(o.getString("g"))

                "welcome" -> Welcome(o.getInt("id"), o.optString("room", ""))

                "lobby" -> {
                    val arr = o.getJSONArray("players")
                    val list = ArrayList<NetPlayer>(arr.length())
                    for (i in 0 until arr.length()) {
                        val p = arr.getJSONObject(i)
                        list.add(NetPlayer(p.getInt("id"), p.getString("name"), p.optBoolean("host")))
                    }
                    Lobby(list)
                }

                "roundStart" -> RoundStart(
                    o.getInt("round"), o.getInt("holder"),
                    o.getString("holderName"), o.getInt("max"),
                )

                "secretAck" -> SecretAck(o.getBoolean("ok"), o.optString("why"))

                "result" -> {
                    val a = o.getJSONArray("c")
                    GuessResult(
                        o.getString("g"),
                        IntArray(a.length()) { i -> a.getInt(i) },
                        o.getBoolean("solved"), o.getInt("left"),
                    )
                }

                "progress" -> Progress(o.getInt("id"), o.getInt("used"), o.getBoolean("solved"))

                "roundEnd" -> {
                    val arr = o.getJSONArray("scores")
                    val map = HashMap<Int, Int>(arr.length())
                    for (i in 0 until arr.length()) {
                        val s = arr.getJSONObject(i)
                        map[s.getInt("id")] = s.getInt("score")
                    }
                    RoundEnd(
                        o.getInt("winner"), o.optString("winnerName", ""),
                        o.optString("secret", ""), map,
                        o.getInt("nextHolder"), o.getBoolean("last"),
                    )
                }

                "bye" -> Bye(o.optString("why", ""))

                "err" -> Err(o.getString("code"))

                else -> null
            }
        } catch (e: Exception) {
            null
        }
    }
}
