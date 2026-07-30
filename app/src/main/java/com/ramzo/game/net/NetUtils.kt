package com.ramzo.game.net

import java.net.Inet4Address
import java.net.NetworkInterface

/** ابزارهای کوچک شبکه */
object NetUtils {

    /** IP محلی، با ترجیح رنج هات‌اسپات (۱۹۲.۱۶۸.*) — برای نمایش به مهمان‌ها */
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
