package com.ramzo.game.net

import android.content.Context
import android.net.wifi.WifiManager
import com.ramzo.game.game.Rules
import org.json.JSONObject
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.nio.charset.StandardCharsets
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

/** اتاقِ کشف‌شده روی شبکهٔ محلی */
class FoundRoom(
    val roomName: String,
    val host: String,
    val port: Int,
    @Volatile var lastSeen: Long = System.currentTimeMillis(),
)

/**
 * میزبان وقتی لابی باز است، هر ۱ ثانیه اعلام اتاق را روی UDP Broadcast تبلیغ می‌کند.
 */
class RoomAdvertiser(
    private val roomName: String,
    private val ip: String,
) {
    private val executor = Executors.newSingleThreadExecutor { r -> Thread(r, "ramzo-advertiser") }

    @Volatile
    private var running = false

    fun start() {
        if (running) return
        running = true
        executor.execute {
            val payload = JSONObject()
                .put("m", Rules.DISCOVERY_MAGIC)
                .put("room", roomName)
                .put("ip", ip)
                .put("port", Rules.TCP_PORT)
                .toString()
                .toByteArray(StandardCharsets.UTF_8)

            var socket: DatagramSocket? = null
            try {
                socket = DatagramSocket()
                socket.broadcast = true
                val target = InetAddress.getByName("255.255.255.255")
                while (running) {
                    runCatching {
                        socket.send(DatagramPacket(payload, payload.size, target, Rules.UDP_PORT))
                    }
                    Thread.sleep(1000)
                }
            } catch (_: Exception) {
                // شبکه در دسترس نیست — اتصال دستی با IP همچنان کار می‌کند
            } finally {
                socket?.let { s -> runCatching { s.close() } }
            }
        }
    }

    fun stop() {
        running = false
        executor.shutdownNow()
    }
}

/**
 * کلاینت در صفحهٔ خانه به اعلان‌های اتاق گوش می‌دهد و لیست زنده برمی‌گرداند.
 * MulticastLock برای گوشی‌هایی که بدون آن broadcast را تحویل نمی‌دهند.
 */
class RoomScanner(
    context: Context,
    private val onRoomsChanged: (List<FoundRoom>) -> Unit,
) {
    companion object {
        private const val ROOM_TTL_MS = 4_000L
        private const val POLL_MS = 900L
    }

    private val appContext = context.applicationContext
    private val rooms = ConcurrentHashMap<String, FoundRoom>()
    private val executor = Executors.newSingleThreadExecutor { r -> Thread(r, "ramzo-scanner") }
    private var multicastLock: WifiManager.MulticastLock? = null

    @Volatile
    private var running = false

    fun start() {
        if (running) return
        running = true
        rooms.clear()

        executor.execute {
            acquireMulticastLock()
            var socket: DatagramSocket? = null
            try {
                socket = DatagramSocket(null)
                socket.reuseAddress = true
                socket.bind(InetSocketAddress(Rules.UDP_PORT))
                socket.soTimeout = POLL_MS.toInt()

                val buffer = ByteArray(2048)
                while (running) {
                    try {
                        val packet = DatagramPacket(buffer, buffer.size)
                        socket.receive(packet)
                        val text = String(packet.data, packet.offset, packet.length, StandardCharsets.UTF_8)
                        parseRoom(text)?.let { room ->
                            val key = "${room.host}:${room.port}"
                            val existing = rooms[key]
                            if (existing != null) existing.lastSeen = System.currentTimeMillis()
                            else rooms[key] = room
                        }
                    } catch (_: java.net.SocketTimeoutException) {
                        // طبیعی — فقط برای prune کردن اتاق‌های ساکت
                    } catch (_: Exception) {
                        break
                    }
                    pruneAndReport()
                }
            } catch (_: Exception) {
                // باز شدن سوکت نشد — کاربر هنوز مسیر IP دستی را دارد
            } finally {
                socket?.let { s -> runCatching { s.close() } }
                releaseMulticastLock()
            }
        }
    }

    fun stop() {
        running = false
        executor.shutdownNow()
    }

    private fun parseRoom(text: String): FoundRoom? = runCatching {
        val o = JSONObject(text)
        if (o.optString("m") != Rules.DISCOVERY_MAGIC) return null
        FoundRoom(
            roomName = o.optString("room", "اتاق"),
            host = o.optString("ip"),
            port = o.optInt("port", Rules.TCP_PORT),
            lastSeen = System.currentTimeMillis(),
        )
    }.getOrNull()

    private fun pruneAndReport() {
        val now = System.currentTimeMillis()
        val iterator = rooms.entries.iterator()
        while (iterator.hasNext()) {
            if (now - iterator.next().value.lastSeen > ROOM_TTL_MS) iterator.remove()
        }
        onRoomsChanged(rooms.values.sortedBy { it.roomName })
    }

    private fun acquireMulticastLock() = runCatching {
        val wifi = appContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
        val lock = wifi.createMulticastLock("ramzo")
        lock.setReferenceCounted(true)
        lock.acquire()
        multicastLock = lock
    }

    private fun releaseMulticastLock() = runCatching {
        multicastLock?.let { if (it.isHeld) it.release() }
        multicastLock = null
    }
}
