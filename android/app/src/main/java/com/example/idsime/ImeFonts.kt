package com.example.idsime

import android.graphics.Typeface
import android.os.Build
import android.util.Log
import java.io.File

/**
 * Loads a device-independent CJK font so rare kanji don't fall back to
 * whatever the vendor happens to ship. We read /system/fonts/NotoSansCJK-Regular.ttc
 * directly (present on every AOSP + Japanese-market build since API 24, and
 * world-readable). If the file is missing or load fails, we return null and
 * callers fall back to the default typeface.
 *
 * The TTC contains four faces in this order: JP(0), KR(1), SC(2), TC(3). We
 * want the Japanese face to get proper glyph variants for Han unification.
 */
object ImeFonts {
    private const val TAG = "ImeFonts"
    private const val PATH = "/system/fonts/NotoSansCJK-Regular.ttc"
    private const val JP_TTC_INDEX = 0

    @Volatile private var cached: Typeface? = null
    @Volatile private var attempted: Boolean = false

    /**
     * Returns the Noto Sans CJK JP typeface, or null if the system font isn't
     * available on this device (some vendors strip it). Cached after first call.
     */
    fun cjk(): Typeface? {
        if (attempted) return cached
        synchronized(this) {
            if (attempted) return cached
            cached = tryLoad()
            attempted = true
            return cached
        }
    }

    private fun tryLoad(): Typeface? {
        val file = File(PATH)
        if (!file.exists() || !file.canRead()) {
            Log.w(TAG, "NotoSansCJK not available at $PATH; using system default")
            return null
        }
        return try {
            val tf = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                // API 26+: Typeface.Builder lets us pick the JP face explicitly.
                Typeface.Builder(file).setTtcIndex(JP_TTC_INDEX).build()
            } else {
                // API 24–25: no TTC index selector in the public API. createFromFile
                // returns face 0 of the collection, which on the standard
                // NotoSansCJK-Regular.ttc shipped by AOSP is already the JP face.
                Typeface.createFromFile(file)
            }
            Log.i(TAG, "loaded NotoSansCJK (size=${file.length()})")
            tf
        } catch (t: Throwable) {
            Log.e(TAG, "failed to load $PATH", t)
            null
        }
    }
}
