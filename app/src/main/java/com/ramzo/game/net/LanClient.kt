package com.ramzo.game.net

import com.ramzo.game.game.Rules
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.io.PrintWriter
import java.net.InetSocketAddress
import java.net.Socket
import java.nio.charset.StandardCharsets
import java.util.concurrent.Executors

/**
 * طرفِ کلاینت اتاق — اتصال به میزبان، ارسال پیام و تحویل پیام‌های دریافتی به Listener.
 * همهٔ کال‌بک‌ها از رشتهٔ سوکت می‌آیند؛ ViewModel آن‌ها را روی رشتهٔ منطقی هم‌راستا می‌کند.
 */
class LanClient(private val listener: Listener) {

    interface Listener {
        fun onMessage(msg: Msg)
        /** اتصال قطع شد (یا از اول برقرار نشد) — reason برای نمایش در بنر */
        fun onDisconnected(reason: String)
    }

    private val io = Executors.newSingleThreadExecutor { r -> Thread(r, "ramzo-client-io") }
    private var socket: Socket? = null
    private var writer: PrintWriter? = null

    @Volatile
    var connected = false
        private set

    fun connect(hostIp: String, playerName: String, port: Int = Rules.TCP_PORT) {
        io.execute {
            try {
                val s = Socket()
                s.tcpNoDelay = true
                s.connect(InetSocketAddress(hostIp, port), 5000)
                socket = s
                writer = PrintWriter(
                    OutputStreamWriter(s.getOutputStream(), StandardCharsets.UTF_8), true
                )
                connected = true
                send(Msg.Hello(playerName))

                val reader = BufferedReader(
                    InputStreamReader(s.getInputStream(), StandardCharsets.UTF_8)
                )
                while (connected && !s.isClosed) {
                    val line = reader.readLine() ?: break
                    Msg.decode(line)?.let { listener.onMessage(it) }
                }
                if (connected) {
                    connected = false
                    listener.onDisconnected("closed")
                }
            } catch (e: Exception) {
                if (connected || socket == null) {
                    connected = false
                    listener.onDisconnected(e.message ?: "error")
                }
            }
        }
    }

    @Synchronized
    fun send(msg: Msg) {
        if (connected) runCatching { writer?.println(msg.encode()) }
    }

    fun close() {
        connected = false
        runCatching { socket?.close() }
        socket = null
        writer = null
        io.shutdown()
    }
}
