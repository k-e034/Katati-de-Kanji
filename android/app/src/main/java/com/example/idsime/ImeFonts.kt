package com.example.idsime

import android.content.Context
import android.graphics.Typeface
import android.util.Log

/**
 * Loads a device-independent CJK font for the IME UI.
 *
 * We bundle IPAmj Mincho (Ver.006.01) — the font designed for the MJ
 * character collection that mojidata itself is based on — so every rare
 * kanji surfaced by an IDS lookup has a real glyph rather than tofu or
 * whatever vendor fallback the device decides to pull.
 *
 * Source: https://moji.or.jp/mojikiban/font/  (IPA Font License v1.0)
 * The license text is shipped alongside the font at
 * assets/fonts/IPA_Font_License_Agreement_v1.0.txt.
 *
 * `ipamjm.ttf` is a single-face TTF (not a TTC), so no face-index selection
 * is required. `Typeface.createFromAsset` works on all supported API levels
 * (our minSdk is 24).
 */
object ImeFonts {
    private const val TAG = "ImeFonts"
    private const val ASSET_PATH = "fonts/ipamjm.ttf"

    @Volatile private var cached: Typeface? = null
    @Volatile private var attempted: Boolean = false

    /**
     * Returns the bundled IPAmj Mincho typeface, or null if loading failed.
     * Cached after first successful call; pass any app/service Context.
     */
    fun cjk(ctx: Context): Typeface? {
        if (attempted) return cached
        synchronized(this) {
            if (attempted) return cached
            cached = tryLoad(ctx)
            attempted = true
            return cached
        }
    }

    private fun tryLoad(ctx: Context): Typeface? {
        return try {
            val tf = Typeface.createFromAsset(ctx.assets, ASSET_PATH)
            Log.i(TAG, "loaded IPAmj Mincho from $ASSET_PATH")
            tf
        } catch (t: Throwable) {
            Log.e(TAG, "failed to load $ASSET_PATH", t)
            null
        }
    }
}
