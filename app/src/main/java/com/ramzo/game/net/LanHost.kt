package com.ramzo.game.net

import com.ramzo.game.game.Rules
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.io.PrintWriter
import java.net.Inet4Address
import java.net.InetSocketAddress
import java.net.NetworkInterface
import java.net.ServerSocket
import java.net.Socket
import java.nio.charset.StandardCharsets
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

/**
 * سرور اتاق روی گوشی میزبان — یک ServerSocket ساده با یک رشتهٔ خواندن به‌ازای هر کلاینت.
 *
 * منطق بازی (داوری، امتیاز، چرخهٔ دور) داخل این کلاس نیست؛ همه به Listener
 * (یعنی GameViewModel، روی «رشتهٔ منطقی تکی») سپرده می‌شود تا قفل و Race نداشته باشیم.
 */
class LanHost(private val listener: Listener) {

    interface Listener {
        /**
         * اولین پیامِ کلاینت تازه‌وارد — پذیرش/رد با ViewModel است.
         * خروجی: null یعنی پذیرفته شد؛ در غیر این‌صورت کد خطا (ErrCodes) برای کلاینت می‌رود و سوکت بسته می‌شود.
         */
        fun onClientHello(clientId: Int, name: String, proto: Int): String?
        fun onClientSecret(clientId: Int, secret: String)
        fun onClientGuess(clientId: Int, guess: String)
        /** سوکت کلاینت بسته شد (رفت، خطا، یا رد شد) */
        fun onClientGone(clientId: Int)
    }

    /** اتصالِ یک کلاینت؛ نوشتن هم‌زمان‌امن با @Synchronized */
    private class ClientConn(val socket: Socket) {
        private val out = PrintWriter(
            OutputStreamWriter(socket.getOutputStream(), StandardCharsets.UTF_8), true
        )

        @Synchronized
        fun send(msg: Msg) {
            if (!socket.isClosed) runCatching { out.println(msg.encode()) }
        }

        @Synchronized
        fun close() = runCatching { socket.close() }
    }

    private val io = Executors.newCachedThreadPool { r -> Thread(r, "ramzo-host-io") }
    private val clients = ConcurrentHashMap<Int, ClientConn>()
    private var serverSocket: ServerSocket? = null
    private var nextId = 1 // 0 = میزبان

    @Volatile
    var running = false
        private set

    fun start() {
        if (running) return
        val ss = ServerSocket()
        ss.reuseAddress = true
        ss.bind(InetSocketAddress(Rules.TCP_PORT))
        serverSocket = ss
        running = true

        io.execute {
            while (running) {
                val socket = try {
                    ss.accept()
                } catch (_: Exception) {
                    break // سرور بسته شد
                }
                socket.tcpNoDelay = true
                io.execute { handleClient(socket) }
            }
        }
    }

    private fun handleClient(socket: Socket) {
        val conn = ClientConn(socket)
        var clientId = -1
        try {
            val reader = BufferedReader(
                InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8)
            )

            // پیام اول باید Hello باشد
            val first = Msg.decode(reader.readLine() ?: return closeQuiet(conn))
            if (first !is Msg.Hello) return closeQuiet(conn)

            clientId = nextId++
            clients[clientId] = conn

            val rejectCode = listener.onClientHello(clientId, first.name, first.proto)
            if (rejectCode != null) {
                conn.send(Msg.Err(rejectCode))
                clients.remove(clientId)
                closeQuiet(conn)
                return
            }
            // پذیرفته شد — ViewModel خودش welcome/lobby فرستاده است

            // حلقهٔ خواندن پیام‌های بعدی
            while (running && !socket.isClosed) {
                val line = reader.readLine() ?: break
                when (val msg = Msg.decode(line)) {
                    is Msg.SetSecret -> listener.onClientSecret(clientId, msg.secret)
                    is Msg.Guess -> listener.onClientGuess(clientId, msg.guess)
                    else -> Unit // پیام نامرتبط/ناشناخته — نادیده
                }
            }
        } catch (_: Exception) {
            // قطع‌شدن سوکت — پایین اعلام می‌شود
        } finally {
            val removed = clientId != -1 && clients.remove(clientId) != null
            closeQuiet(conn)
            if (removed) listener.onClientGone(clientId)
        }
    }

    fun sendTo(clientId: Int, msg: Msg) = clients[clientId]?.send(msg)

    fun broadcast(msg: Msg) = clients.values.forEach { it.send(msg) }

    /** بستن مؤدبانهٔ همهٔ کلاینت‌ها + سرور */
    fun shutdown(reason: String = "host_closed") {
        if (!running) return
        running = false
        broadcast(Msg.Bye(reason))
        clients.values.forEach { it.close() }
        clients.clear()
        serverSocket?.let { runCatching { it.close() } }
        serverSocket = null
        io.shutdown()
    }

    private fun closeQuiet(conn: ClientConn) = conn.close()

    companion object {
        /** IP محلی ترجیحاً رنج هات‌اسپات (۱۹۲.۱۶۸.*) — برای نمایش به کاربر */
        fun localIp(): String? = runCatching {
            val fallback = ArrayList<String>()
            val interfaces = NetworkInterface.getNetworkInterfaces() ?: return null
            for (ni in interfaces) {
                if (!ni.isUp || ni.isLoopback) continue
                for (addr in ni.inetAddresses) {
                    if (addr is Inet4Address && !addr.isLoopbackAddress) {
                        val ip = addr.hostAddress ?: continue
                        if (ip.startsWith("192.168.")) return ip
                        if (addr.isSiteLocalAddress) fallback.add(ip)
                    }
                }
            }
            fallback.firstOrNull()
        }.getOrNull()
    }
}
